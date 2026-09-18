"""Teacher-governed, course-scoped concept graph operations."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any
from uuid import uuid4

from fiosra.mvp.concepts.schemas import ConceptGraphProposal
from fiosra.mvp.config import settings
from fiosra.mvp.llm.contracts import CompletionRequest
from fiosra.mvp.llm.litellm_provider import LiteLLMProvider
from fiosra.mvp.neo4j_client import Neo4jClient, neo4j_client

logger = logging.getLogger(__name__)


class ConceptGraphError(RuntimeError):
    """Raised when a concept graph action would violate curriculum integrity."""


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized[:48] or "concept"


class ConceptGraphService:
    """Maintains one approved high-to-low concept graph per course."""

    def __init__(self, client: Neo4jClient | None = None) -> None:
        self.client = client or neo4j_client

    async def init_schema(self) -> None:
        queries = [
            """
            CREATE CONSTRAINT course_id_unique IF NOT EXISTS
            FOR (c:Course) REQUIRE c.course_id IS UNIQUE
            """,
            """
            CREATE CONSTRAINT module_id_unique IF NOT EXISTS
            FOR (m:Module) REQUIRE m.module_id IS UNIQUE
            """,
            """
            CREATE CONSTRAINT concept_id_unique IF NOT EXISTS
            FOR (c:Concept) REQUIRE c.concept_id IS UNIQUE
            """,
            """
            CREATE CONSTRAINT source_material_key_unique IF NOT EXISTS
            FOR (s:SourceMaterial) REQUIRE s.resource_key IS UNIQUE
            """,
            """
            CREATE CONSTRAINT source_chunk_id_unique IF NOT EXISTS
            FOR (s:SourceChunk) REQUIRE s.chunk_id IS UNIQUE
            """,
            """
            CREATE INDEX concept_course_idx IF NOT EXISTS
            FOR (c:Concept) ON (c.course_id)
            """,
            """
            CREATE INDEX concept_course_canonical_idx IF NOT EXISTS
            FOR (c:Concept) ON (c.course_id, c.canonical_key)
            """,
        ]
        async with self.client.get_session() as session:
            for query in queries:
                await session.run(query)

    async def ensure_course(
        self,
        course_id: str,
        title: str,
        domain: str,
    ) -> None:
        await self.init_schema()
        query = """
        MERGE (course:Course {course_id: $course_id})
        SET course.title = $title,
            course.domain = $domain,
            course.updated_at = datetime()
        """
        async with self.client.get_session() as session:
            await session.run(query, {"course_id": str(course_id), "title": title, "domain": domain})

    async def ensure_module(
        self,
        course_id: str,
        module_id: str,
        title: str,
        position: int,
    ) -> None:
        query = """
        MATCH (course:Course {course_id: $course_id})
        MERGE (module:Module {module_id: $module_id})
        SET module.course_id = $course_id,
            module.title = $title,
            module.position = $position,
            module.updated_at = datetime()
        MERGE (course)-[:HAS_MODULE]->(module)
        """
        async with self.client.get_session() as session:
            await session.run(
                query,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id),
                    "title": title,
                    "position": int(position),
                },
            )

    async def sync_course_structure(self, course: Any) -> None:
        """Ensures course and module nodes exist before graph edits or source ingestion."""
        await self.ensure_course(str(course.course_id), course.title, course.domain)
        for module in course.modules:
            await self.ensure_module(
                str(course.course_id),
                str(module.module_id),
                module.title,
                module.position,
            )

    async def create_concept(
        self,
        course_id: str,
        label: str,
        definition: str,
        concept_type: str,
        level: str,
        parent_concept_id: str | None = None,
    ) -> dict[str, Any]:
        canonical_key = _slug(label).upper()
        concept_id = f"CON_{canonical_key}_{uuid4().hex[:6].upper()}"
        query = """
        MATCH (course:Course {course_id: $course_id})
        MERGE (concept:Concept {course_id: $course_id, canonical_key: $canonical_key})
        ON CREATE SET concept.concept_id = $concept_id,
            concept.course_id = $course_id,
            concept.canonical_key = $canonical_key,
            concept.label = $label,
            concept.definition = $definition,
            concept.concept_type = $concept_type,
            concept.level = $level,
            concept.status = 'approved',
            concept.created_at = datetime(),
            concept.updated_at = datetime()
        ON MATCH SET concept.updated_at = datetime()
        MERGE (course)-[:HAS_CONCEPT]->(concept)
        RETURN concept { .concept_id, .course_id, .label, .definition, .concept_type, .level, .status } AS concept
        """
        async with self.client.get_session() as session:
            result = await session.run(
                query,
                {
                    "course_id": str(course_id),
                    "canonical_key": canonical_key,
                    "concept_id": concept_id,
                    "label": label.strip(),
                    "definition": definition.strip(),
                    "concept_type": concept_type,
                    "level": level,
                },
            )
            row = await result.single()
        if not row:
            raise ConceptGraphError("The parent course must be synchronized before concepts can be created.")
        if parent_concept_id:
            await self.add_contains(course_id, parent_concept_id, row["concept"]["concept_id"])
        return dict(row["concept"])

    async def update_concept(self, course_id: str, concept_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        permitted = {key: value for key, value in values.items() if value is not None}
        if not permitted:
            return await self.get_concept(course_id, concept_id)
        set_clause = ", ".join(f"concept.{key} = ${key}" for key in permitted)
        query = f"""
        MATCH (concept:Concept {{concept_id: $concept_id, course_id: $course_id}})
        SET {set_clause}, concept.updated_at = datetime()
        RETURN concept {{ .concept_id, .course_id, .label, .definition, .concept_type, .level, .status }} AS concept
        """
        params = {"course_id": str(course_id), "concept_id": concept_id} | permitted
        async with self.client.get_session() as session:
            result = await session.run(query, params)
            row = await result.single()
        return dict(row["concept"]) if row else None

    async def get_concept(self, course_id: str, concept_id: str) -> dict[str, Any] | None:
        query = """
        MATCH (concept:Concept {concept_id: $concept_id, course_id: $course_id})
        RETURN concept { .concept_id, .course_id, .label, .definition, .concept_type, .level, .status } AS concept
        """
        async with self.client.get_session() as session:
            result = await session.run(query, {"course_id": str(course_id), "concept_id": concept_id})
            row = await result.single()
        return dict(row["concept"]) if row else None

    async def _validate_relation(
        self,
        course_id: str,
        source_id: str,
        target_id: str,
        relation: str,
    ) -> None:
        if source_id == target_id:
            raise ConceptGraphError("A concept cannot relate to itself.")
        if relation == "CONTAINS":
            query = """
            MATCH (source:Concept {concept_id: $source_id, course_id: $course_id})
            MATCH (target:Concept {concept_id: $target_id, course_id: $course_id})
            OPTIONAL MATCH path = (target)-[:CONTAINS*1..]->(source)
            RETURN source IS NOT NULL AS source_exists,
                   target IS NOT NULL AS target_exists,
                   count(path) > 0 AS creates_cycle
            """
        else:
            query = """
            MATCH (source:Concept {concept_id: $source_id, course_id: $course_id})
            MATCH (target:Concept {concept_id: $target_id, course_id: $course_id})
            RETURN source IS NOT NULL AS source_exists,
                   target IS NOT NULL AS target_exists,
                   false AS creates_cycle
            """
        async with self.client.get_session() as session:
            result = await session.run(
                query,
                {"course_id": str(course_id), "source_id": source_id, "target_id": target_id},
            )
            row = await result.single()
        if not row or not row["source_exists"] or not row["target_exists"]:
            raise ConceptGraphError("Both concepts must exist in the selected course.")
        if row["creates_cycle"]:
            raise ConceptGraphError("This link would create a hierarchy cycle.")

    async def _add_relation(
        self,
        course_id: str,
        source_id: str,
        target_id: str,
        relation: str,
    ) -> None:
        await self._validate_relation(course_id, source_id, target_id, relation)
        query = f"""
        MATCH (source:Concept {{concept_id: $source_id, course_id: $course_id}})
        MATCH (target:Concept {{concept_id: $target_id, course_id: $course_id}})
        MERGE (source)-[edge:{relation}]->(target)
        SET edge.updated_at = datetime()
        """
        async with self.client.get_session() as session:
            await session.run(
                query,
                {"course_id": str(course_id), "source_id": source_id, "target_id": target_id},
            )

    async def add_contains(self, course_id: str, parent_id: str, child_id: str) -> None:
        await self._add_relation(course_id, parent_id, child_id, "CONTAINS")

    async def add_prerequisite(self, course_id: str, prerequisite_id: str, dependent_id: str) -> None:
        await self._add_relation(course_id, prerequisite_id, dependent_id, "PREREQUISITE_OF")

    async def link_module(self, course_id: str, module_id: str, concept_id: str, role: str) -> None:
        relation = {"introduces": "INTRODUCES", "develops": "DEVELOPS", "assesses": "ASSESSES"}.get(role)
        if not relation:
            raise ConceptGraphError("Unsupported module concept role.")
        query = f"""
        MATCH (module:Module {{module_id: $module_id, course_id: $course_id}})
        MATCH (concept:Concept {{concept_id: $concept_id, course_id: $course_id}})
        MERGE (module)-[edge:{relation}]->(concept)
        SET edge.updated_at = datetime()
        """
        async with self.client.get_session() as session:
            result = await session.run(
                query,
                {"course_id": str(course_id), "module_id": str(module_id), "concept_id": concept_id},
            )
            summary = await result.consume()
        if summary.counters.relationships_created == 0 and not await self.get_concept(course_id, concept_id):
            raise ConceptGraphError("The selected module or concept was not found in this course.")

    async def ingest_resource(
        self,
        course_id: str,
        module_id: str | None,
        title: str,
        resource_type: str,
        source_url: str | None,
        chunks: list[dict[str, Any]],
    ) -> None:
        """Projects already-persisted source chunks into the course concept graph."""
        material_seed = "|".join([str(course_id), str(module_id or "course"), title, resource_type, source_url or ""])
        resource_key = hashlib.sha256(material_seed.encode("utf-8")).hexdigest()
        concept_query = """
        MATCH (concept:Concept {course_id: $course_id})
        WHERE coalesce(concept.status, 'approved') <> 'superseded'
        RETURN concept.concept_id AS concept_id, concept.label AS label
        """
        async with self.client.get_session() as session:
            result = await session.run(concept_query, {"course_id": str(course_id)})
            concept_candidates = [dict(record) for record in await result.data()]
        material_query = """
        MATCH (course:Course {course_id: $course_id})
        MERGE (source:SourceMaterial {resource_key: $resource_key})
        SET source.course_id = $course_id,
            source.module_id = $module_id,
            source.title = $title,
            source.source_type = $resource_type,
            source.source_url = $source_url,
            source.status = 'ready',
            source.updated_at = datetime()
        MERGE (course)-[:HAS_RESOURCE]->(source)
        WITH source
        OPTIONAL MATCH (module:Module {module_id: $module_id, course_id: $course_id})
        FOREACH (_ IN CASE WHEN module IS NULL THEN [] ELSE [1] END |
            MERGE (module)-[:HAS_RESOURCE]->(source)
        )
        """
        async with self.client.get_session() as session:
            await session.run(
                material_query,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                    "resource_key": resource_key,
                    "title": title,
                    "resource_type": resource_type,
                    "source_url": source_url,
                },
            )
            for chunk in chunks:
                chunk_query = """
                MATCH (source:SourceMaterial {resource_key: $resource_key})
                MERGE (chunk:SourceChunk {chunk_id: $chunk_id})
                SET chunk.course_id = $course_id,
                    chunk.module_id = $module_id,
                    chunk.title = $title,
                    chunk.kc_id = $kc_id,
                    chunk.content_hash = $content_hash,
                    chunk.updated_at = datetime()
                MERGE (source)-[:HAS_CHUNK]->(chunk)
                WITH chunk
                OPTIONAL MATCH (target:Concept {concept_id: $kc_id, course_id: $course_id})
                FOREACH (_ IN CASE WHEN target IS NULL THEN [] ELSE [1] END |
                    MERGE (chunk)-[e:EVIDENCES]->(target)
                    SET e.method = CASE WHEN e.method='verified_source_excerpt' THEN e.method ELSE 'ingestion_match' END, e.updated_at = datetime()
                )
                """
                await session.run(
                    chunk_query,
                    {
                        "course_id": str(course_id),
                        "module_id": str(module_id) if module_id else None,
                        "resource_key": resource_key,
                        "chunk_id": str(chunk["chunk_id"]),
                        "title": chunk.get("title") or title,
                        "kc_id": chunk.get("kc_id"),
                        "content_hash": hashlib.sha256(chunk.get("content", "").encode("utf-8")).hexdigest(),
                    },
                )
                normalized_content = chunk.get("content", "").lower()
                for candidate in concept_candidates:
                    terms = {
                        term
                        for term in re.findall(r"[a-z0-9]{4,}", candidate["label"].lower())
                    }
                    matching_terms = [term for term in terms if term in normalized_content]
                    if not matching_terms:
                        continue
                    confidence = round(min(0.95, 0.35 + 0.2 * len(matching_terms)), 2)
                    evidence_query = """
                    MATCH (chunk:SourceChunk {chunk_id: $chunk_id})
                    MATCH (concept:Concept {concept_id: $concept_id, course_id: $course_id})
                    MERGE (chunk)-[edge:EVIDENCES]->(concept)
                    SET edge.method = CASE WHEN edge.method='verified_source_excerpt' THEN edge.method ELSE 'lexical_concept_match' END,
                        edge.confidence = $confidence,
                        edge.updated_at = datetime()
                    """
                    await session.run(
                        evidence_query,
                        {
                            "chunk_id": str(chunk["chunk_id"]),
                            "concept_id": candidate["concept_id"],
                            "course_id": str(course_id),
                            "confidence": confidence,
                        },
                    )

    @staticmethod
    def _proposal_json(content: str) -> dict[str, Any] | None:
        """Parse a structured proposal even when a provider wraps it in Markdown."""
        candidate = content.strip()
        if candidate.startswith("```"):
            candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE)
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            start = candidate.find("{")
            if start == -1:
                return None
            try:
                parsed, _ = json.JSONDecoder().raw_decode(candidate[start:])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None

    @staticmethod
    def _deterministic_proposal(
        course: Any,
        target_module: Any | None = None,
        existing_labels: set[str] | None = None,
        source_snippets: list[str] | None = None,
    ) -> ConceptGraphProposal:
        """Provide a reviewable course graph draft grounded in syllabus and source materials."""
        existing_set = {l.lower() for l in (existing_labels or set())}
        concepts: list[dict[str, Any]] = []
        modules_to_process = [target_module] if target_module else course.modules

        root_label = f"{course.title}: core inquiries"
        root_id = "c1"
        if not existing_set or not any("core inquiries" in l or "central" in l for l in existing_set):
            concepts.append(
                {
                    "proposal_id": "c1",
                    "label": root_label,
                    "definition": course.syllabus_context or f"The central conceptual foundation of {course.title}.",
                    "concept_type": "domain",
                    "level": "course_theme",
                    "parent_proposal_id": None,
                    "module_positions": [],
                    "module_role": "introduces",
                }
            )
        else:
            root_id = None

        idx = len(concepts) + 1
        for mod in modules_to_process:
            if not mod:
                continue
            mod_title = mod.title.strip()
            if mod_title.lower() not in existing_set:
                p_id = f"c{idx}"
                concepts.append(
                    {
                        "proposal_id": p_id,
                        "label": mod_title,
                        "definition": mod.description or f"Conceptual focus and historical mechanics for {mod_title}.",
                        "concept_type": "process",
                        "level": "topic",
                        "parent_proposal_id": root_id,
                        "module_positions": [mod.position],
                        "module_role": "introduces" if mod.position == 1 else "develops",
                    }
                )
                idx += 1

            for obj in mod.learning_objectives or []:
                obj_text = str(obj).strip()
                if len(obj_text) > 4 and obj_text.lower() not in existing_set and len(concepts) < 10:
                    p_id = f"c{idx}"
                    concepts.append(
                        {
                            "proposal_id": p_id,
                            "label": obj_text[:80],
                            "definition": f"Core curriculum competency: {obj_text}.",
                            "concept_type": "method",
                            "level": "subtopic",
                            "parent_proposal_id": concepts[-1]["proposal_id"] if concepts else root_id,
                            "module_positions": [mod.position],
                            "module_role": "develops",
                        }
                    )
                    idx += 1

        if source_snippets and len(concepts) < 8:
            for snippet in source_snippets[:3]:
                clean_snippet = re.sub(r"\[.*?\]:", "", snippet).strip()
                first_line = clean_snippet.split("\n")[0][:60].strip()
                if len(first_line) > 5 and first_line.lower() not in existing_set and len(concepts) < 10:
                    p_id = f"c{idx}"
                    concepts.append(
                        {
                            "proposal_id": p_id,
                            "label": first_line,
                            "definition": f"Primary source evidence: {clean_snippet[:180]}...",
                            "concept_type": "entity",
                            "level": "atomic_concept",
                            "parent_proposal_id": concepts[-1]["proposal_id"] if concepts else root_id,
                            "module_positions": [modules_to_process[0].position] if modules_to_process else [],
                            "module_role": "develops",
                        }
                    )
                    idx += 1

        while len(concepts) < 3:
            p_id = f"c{idx}"
            fallback_label = f"{course.domain} disciplinary focus {idx}"
            concepts.append(
                {
                    "proposal_id": p_id,
                    "label": fallback_label,
                    "definition": f"Critical evaluation of evidence in {course.domain}.",
                    "concept_type": "method",
                    "level": "topic",
                    "parent_proposal_id": root_id or (concepts[0]["proposal_id"] if concepts else None),
                    "module_positions": [1],
                    "module_role": "develops",
                }
            )
            idx += 1

        prerequisites = []
        for i in range(1, len(concepts)):
            prerequisites.append(
                {
                    "prerequisite_proposal_id": concepts[i - 1]["proposal_id"],
                    "dependent_proposal_id": concepts[i]["proposal_id"],
                    "rationale": "Sequential curriculum scaffolding.",
                }
            )

        return ConceptGraphProposal(
            course_rationale="Grounded concept hierarchy derived from module curriculum and uploaded source evidence.",
            concepts=concepts,
            prerequisites=prerequisites,
        )

    async def generate_proposal(
        self,
        course: Any,
        instruction: str | None = None,
        module_id: str | None = None,
    ) -> tuple[ConceptGraphProposal, str]:
        """Generate a teacher-reviewable high-to-low concept graph from course materials and sources."""
        from fiosra.mvp.database import AsyncSessionLocal
        from sqlalchemy import text

        # Query existing concepts to avoid duplicate generation
        existing_query = """
        MATCH (concept:Concept {course_id: $course_id})
        WHERE coalesce(concept.status, 'approved') <> 'superseded'
        RETURN concept.concept_id AS concept_id, concept.label AS label, concept.level AS level
        """
        async with self.client.get_session() as session:
            res = await session.run(existing_query, {"course_id": str(course.course_id)})
            existing_concepts = [dict(r) for r in await res.data()]
        existing_labels = {c["label"].lower() for c in existing_concepts}

        # Query source chunks for rich grounding
        source_snippets: list[str] = []
        async with AsyncSessionLocal() as pg_session:
            if module_id:
                sql = text("""
                    SELECT title, substring(content, 1, 300) as snippet 
                    FROM syllabus_chunks 
                    WHERE course_id = CAST(:cid AS UUID) AND module_id = CAST(:mid AS UUID) 
                    ORDER BY chunk_id LIMIT 12
                """)
                rows = (await pg_session.execute(sql, {"cid": str(course.course_id), "mid": str(module_id)})).fetchall()
            else:
                sql = text("""
                    SELECT title, substring(content, 1, 300) as snippet 
                    FROM syllabus_chunks 
                    WHERE course_id = CAST(:cid AS UUID) 
                    ORDER BY chunk_id LIMIT 16
                """)
                rows = (await pg_session.execute(sql, {"cid": str(course.course_id)})).fetchall()
            source_snippets = [f"[{r[0]}]: {r[1].strip()}" for r in rows if r[1]]

        target_module = next((m for m in course.modules if str(m.module_id) == str(module_id)), None) if module_id else None

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() == "deterministic":
            return (
                self._deterministic_proposal(
                    course, target_module=target_module, existing_labels=existing_labels, source_snippets=source_snippets
                ),
                "deterministic course structure",
            )

        modules_payload = [
            {
                "position": module.position,
                "title": module.title,
                "description": module.description,
                "learning_objectives": module.learning_objectives,
            }
            for module in ([target_module] if target_module else course.modules)
            if module
        ]

        system_prompt = (
            "You are a curriculum knowledge engineer. Derive a concise, genuine semantic concept graph from a course syllabus and primary sources. "
            "Do not merely repeat module titles. Create high-level themes, lower-level topics, and atomic concepts where justified. "
            "Use only evidence in the supplied course, syllabus, and source materials. Propose an acyclic CONTAINS hierarchy and only defensible prerequisites. "
            "CRITICAL: Do NOT duplicate or repeat existing concepts. Only propose genuinely new concepts. "
            "The educator will validate all proposals before they are saved. Respond only with JSON matching the supplied schema."
        )
        user_prompt = json.dumps(
            {
                "course_title": course.title,
                "domain": course.domain,
                "syllabus_context": course.syllabus_context or "",
                "target_scope": f"Unit {target_module.position}: {target_module.title}" if target_module else "All Modules",
                "modules": modules_payload,
                "existing_concepts": [c["label"] for c in existing_concepts],
                "primary_source_excerpts": source_snippets[:10],
                "instructions": {
                    "concept_count": "4 to 8",
                    "hierarchy": "Use course_theme -> strand -> topic -> subtopic -> atomic_concept as appropriate.",
                    "module_positions": [target_module.position] if target_module else [m.position for m in course.modules],
                    "teacher_direction": instruction or "Ground concepts in the provided syllabus and primary source excerpts.",
                },
            },
            ensure_ascii=False,
        )
        request = CompletionRequest(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="curriculum_concept_graph_proposal",
            max_tokens=1200,
            temperature=0.2,
            timeout_seconds=25.0,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "curriculum_concept_graph_proposal",
                    "schema": ConceptGraphProposal.model_json_schema(),
                },
            },
        )
        try:
            result = await LiteLLMProvider.from_settings().complete(request)
            parsed = self._proposal_json(result.content)
            if not parsed:
                raise ConceptGraphError("The configured model did not return a readable concept graph proposal.")
            proposal = self._sanitize_proposal(ConceptGraphProposal.model_validate(parsed))
            self._validate_proposal(proposal)
            return proposal, f"{result.provider}/{result.model}"
        except Exception as error:  # noqa: BLE001 - reviewable fallback protects teacher workflow
            logger.warning("Concept graph proposal fell back to deterministic structure: %s", error)
            return (
                self._deterministic_proposal(
                    course, target_module=target_module, existing_labels=existing_labels, source_snippets=source_snippets
                ),
                f"deterministic fallback ({type(error).__name__})",
            )

    @staticmethod
    def _sanitize_proposal(proposal: ConceptGraphProposal) -> ConceptGraphProposal:
        """Repair recoverable local-model edge references without inventing concept content."""
        payload = proposal.model_dump()
        concept_ids = {concept["proposal_id"] for concept in payload["concepts"]}
        root_id = next(
            (concept["proposal_id"] for concept in payload["concepts"] if concept["level"] == "course_theme"),
            payload["concepts"][0]["proposal_id"],
        )

        parents: dict[str, str | None] = {}
        for concept in payload["concepts"]:
            parent_id = concept.get("parent_proposal_id")
            if parent_id not in concept_ids or parent_id == concept["proposal_id"]:
                parent_id = root_id if concept["proposal_id"] != root_id else None
            concept["parent_proposal_id"] = parent_id
            parents[concept["proposal_id"]] = parent_id

        for concept in payload["concepts"]:
            current = concept["proposal_id"]
            visited = {current}
            parent_id = parents[current]
            while parent_id:
                if parent_id in visited:
                    concept["parent_proposal_id"] = None
                    parents[current] = None
                    break
                visited.add(parent_id)
                parent_id = parents.get(parent_id)

        accepted_prerequisites: list[dict[str, Any]] = []
        adjacency: dict[str, set[str]] = {concept_id: set() for concept_id in concept_ids}

        def reaches(start: str, target: str) -> bool:
            pending = [start]
            visited: set[str] = set()
            while pending:
                current = pending.pop()
                if current == target:
                    return True
                if current in visited:
                    continue
                visited.add(current)
                pending.extend(adjacency[current] - visited)
            return False

        for link in payload["prerequisites"]:
            source = link["prerequisite_proposal_id"]
            target = link["dependent_proposal_id"]
            if source not in concept_ids or target not in concept_ids or source == target:
                continue
            if reaches(target, source):
                continue
            adjacency[source].add(target)
            accepted_prerequisites.append(link)
        payload["prerequisites"] = accepted_prerequisites
        return ConceptGraphProposal.model_validate(payload)

    @staticmethod
    def _validate_proposal(proposal: ConceptGraphProposal) -> None:
        concept_ids = {concept.proposal_id for concept in proposal.concepts}
        if len(concept_ids) != len(proposal.concepts):
            raise ConceptGraphError("The generated proposal contains duplicate concept identifiers.")
        parents = {concept.proposal_id: concept.parent_proposal_id for concept in proposal.concepts}
        for concept_id, parent_id in parents.items():
            if parent_id is not None and parent_id not in concept_ids:
                raise ConceptGraphError("A generated concept refers to a missing parent.")
            visited = {concept_id}
            current = parent_id
            while current:
                if current in visited:
                    raise ConceptGraphError("The generated concept hierarchy contains a cycle.")
                visited.add(current)
                current = parents.get(current)
        adjacency: dict[str, list[str]] = {concept_id: [] for concept_id in concept_ids}
        for link in proposal.prerequisites:
            if link.prerequisite_proposal_id not in concept_ids or link.dependent_proposal_id not in concept_ids:
                raise ConceptGraphError("A generated prerequisite refers to a missing concept.")
            adjacency[link.prerequisite_proposal_id].append(link.dependent_proposal_id)
        for concept_id in concept_ids:
            stack = [(concept_id, {concept_id})]
            while stack:
                current, visited = stack.pop()
                for child in adjacency[current]:
                    if child in visited:
                        raise ConceptGraphError("The generated prerequisite graph contains a cycle.")
                    stack.append((child, visited | {child}))

    async def approve_proposal(self, course: Any, proposal: ConceptGraphProposal) -> dict[str, Any]:
        """Commit only teacher-submitted proposal nodes and valid edges into the active graph."""
        self._validate_proposal(proposal)
        await self.sync_course_structure(course)
        concept_ids: dict[str, str] = {}
        for proposed in proposal.concepts:
            concept = await self.create_concept(
                str(course.course_id),
                proposed.label,
                proposed.definition,
                proposed.concept_type,
                proposed.level,
            )
            concept_ids[proposed.proposal_id] = concept["concept_id"]
        for proposed in proposal.concepts:
            if proposed.parent_proposal_id and proposed.parent_proposal_id in concept_ids:
                try:
                    await self.add_contains(
                        str(course.course_id),
                        concept_ids[proposed.parent_proposal_id],
                        concept_ids[proposed.proposal_id],
                    )
                except Exception as e:
                    logger.debug("Contains relationship skipped or exists: %s", e)
            for position in proposed.module_positions:
                module = next((item for item in course.modules if item.position == position), None)
                if module:
                    await self.link_module(
                        str(course.course_id),
                        str(module.module_id),
                        concept_ids[proposed.proposal_id],
                        proposed.module_role,
                    )
        for prerequisite in proposal.prerequisites:
            if prerequisite.prerequisite_proposal_id in concept_ids and prerequisite.dependent_proposal_id in concept_ids:
                try:
                    await self.add_prerequisite(
                        str(course.course_id),
                        concept_ids[prerequisite.prerequisite_proposal_id],
                        concept_ids[prerequisite.dependent_proposal_id],
                    )
                except Exception as e:
                    logger.debug("Prerequisite skipped or exists: %s", e)

        # Automatically bind existing source chunks as evidence for newly approved concepts
        try:
            await self.relink_course_sources(str(course.course_id))
        except Exception as e:
            logger.warning("Source relinking warning during proposal approval: %s", e)

        return await self.get_course_graph(str(course.course_id))

    async def relink_course_sources(self, course_id: str) -> int:
        """Connects all existing SourceChunk nodes for a course to active Concepts via EVIDENCES edges."""
        from fiosra.mvp.database import AsyncSessionLocal
        from sqlalchemy import text

        concept_query = """
        MATCH (concept:Concept {course_id: $course_id})
        WHERE coalesce(concept.status, 'approved') <> 'superseded'
        RETURN concept.concept_id AS concept_id, concept.label AS label
        """
        async with self.client.get_session() as session:
            c_res = await session.run(concept_query, {"course_id": str(course_id)})
            concept_candidates = [dict(r) for r in await c_res.data()]
            if not concept_candidates:
                return 0

        async with AsyncSessionLocal() as pg_session:
            pg_res = await pg_session.execute(
                text("SELECT chunk_id, content FROM syllabus_chunks WHERE course_id = CAST(:cid AS UUID)"),
                {"cid": str(course_id)},
            )
            chunks_data = pg_res.fetchall()

        if not chunks_data:
            return 0

        links: list[dict[str, Any]] = []
        for chunk_row in chunks_data:
            chunk_id = str(chunk_row[0])
            content_lower = (chunk_row[1] or "").lower()
            for candidate in concept_candidates:
                terms = {
                    term
                    for term in re.findall(r"[a-z0-9]{4,}", candidate["label"].lower())
                }
                matching_terms = [term for term in terms if term in content_lower]
                if not matching_terms:
                    continue
                confidence = round(min(0.95, 0.35 + 0.2 * len(matching_terms)), 2)
                links.append({
                    "chunk_id": chunk_id,
                    "concept_id": candidate["concept_id"],
                    "confidence": confidence,
                })

        if not links:
            return 0

        batch_query = """
        UNWIND $links AS item
        MATCH (chunk:SourceChunk {chunk_id: item.chunk_id})
        MATCH (concept:Concept {concept_id: item.concept_id, course_id: $course_id})
        MERGE (chunk)-[edge:EVIDENCES]->(concept)
        SET edge.method = 'lexical_concept_match',
            edge.confidence = item.confidence,
            edge.updated_at = datetime()
        """
        async with self.client.get_session() as session:
            for i in range(0, len(links), 500):
                batch = links[i : i + 500]
                await session.run(batch_query, {"course_id": str(course_id), "links": batch})

        return len(links)

    async def hydrate_course_graph(
        self,
        course: Any,
        module_id: str | None = None,
        instruction: str | None = None,
    ) -> dict[str, Any]:
        """
        One-click end-to-end hydration of the course concept graph:
        1. Synthesizes a grounded proposal from course modules & primary source documents.
        2. Approves and commits only new, deduplicated concept nodes and DAG edges.
        3. Relinks existing source chunks in Neo4j as evidence.
        4. Returns the hydrated concept graph.
        """
        proposal, _ = await self.generate_proposal(course, instruction=instruction, module_id=module_id)
        await self.approve_proposal(course, proposal)
        await self.relink_course_sources(str(course.course_id))
        return await self.get_course_graph(str(course.course_id))

    async def get_course_graph(self, course_id: str) -> dict[str, Any]:
        query = """
        MATCH (course:Course {course_id: $course_id})
        OPTIONAL MATCH (course)-[:HAS_CONCEPT]->(concept:Concept)
        WHERE coalesce(concept.status, 'approved') <> 'superseded'
        WITH course, collect(DISTINCT concept { 
            .concept_id, .label, .definition, .concept_type, .level, .status, .bloom_level 
        }) AS concepts
        
        OPTIONAL MATCH (source:Concept {course_id: $course_id})-[edge:CONTAINS|PREREQUISITE_OF|REQUIRES]->(target:Concept {course_id: $course_id})
        WHERE coalesce(source.status, 'approved') <> 'superseded' AND coalesce(target.status, 'approved') <> 'superseded'
        WITH course, concepts, collect(DISTINCT CASE WHEN edge IS NULL THEN NULL ELSE {
            source: coalesce(source.concept_id, source.kc_id), 
            target: coalesce(target.concept_id, target.kc_id), 
            relation: type(edge)
        } END) AS raw_edges
        
        OPTIONAL MATCH (module:Module {course_id: $course_id})-[module_edge:INTRODUCES|DEVELOPS|ASSESSES]->(linked:Concept {course_id: $course_id})
        WHERE coalesce(linked.status, 'approved') <> 'superseded'
        WITH course, concepts, raw_edges, collect(DISTINCT CASE WHEN module_edge IS NULL THEN NULL ELSE {
            module_id: module.module_id, 
            concept_id: coalesce(linked.concept_id, linked.kc_id), 
            role: toLower(type(module_edge))
        } END) AS raw_module_links
        
        OPTIONAL MATCH (chunk:SourceChunk {course_id: $course_id})-[source_edge:EVIDENCES]->(evidenced)
        WHERE coalesce(evidenced.status, 'approved') <> 'superseded'
        WITH course, concepts, raw_edges, raw_module_links, collect(DISTINCT CASE WHEN source_edge IS NULL THEN NULL ELSE {
            chunk_id: chunk.chunk_id, concept_id: coalesce(evidenced.concept_id, evidenced.kc_id), method: source_edge.method, excerpt: source_edge.excerpt
        } END) AS raw_source_links
        
        // Misconceptions & Socratic Probes Pedagogical Expansion
        OPTIONAL MATCH (k:KnowledgeComponent {course_id: $course_id})-[:ASSOCIATED_WITH]->(misc:Misconception)
        WHERE coalesce(k.status, 'approved') <> 'superseded' AND coalesce(misc.status, 'approved') <> 'superseded'
        WITH course, concepts, raw_edges, raw_module_links, raw_source_links,
             collect(DISTINCT CASE WHEN misc IS NULL THEN NULL ELSE misc {
                 concept_id: misc.misconception_id,
                 label: misc.name,
                 definition: misc.flawed_rule,
                 concept_type: 'misconception',
                 level: 'misconception',
                 remediation_hint: misc.remediation_hint,
                 status: coalesce(misc.status, 'approved'),
                 kc_id: k.kc_id
             } END) AS misconception_nodes,
             collect(DISTINCT CASE WHEN misc IS NULL THEN NULL ELSE {
                 source: k.kc_id,
                 target: misc.misconception_id,
                 relation: 'ASSOCIATED_WITH'
             } END) AS misconception_edges
             
        OPTIONAL MATCH (misc:Misconception {course_id: $course_id})-[:PROBED_BY]->(p:SocraticProbe)
        WHERE coalesce(misc.status, 'approved') <> 'superseded' AND coalesce(p.status, 'approved') <> 'superseded'
        WITH course, concepts, raw_edges, raw_module_links, raw_source_links, 
             misconception_nodes, misconception_edges,
             collect(DISTINCT CASE WHEN p IS NULL THEN NULL ELSE p {
                 probe_id: p.probe_id,
                 misconception_id: misc.misconception_id,
                 rung: p.rung,
                 probe_text: p.probe_text,
                 rationale: p.rationale,
                 status: coalesce(p.status, 'approved')
             } END) AS probes

        RETURN concepts, raw_edges, raw_module_links, raw_source_links,
               misconception_nodes, misconception_edges, probes
        """
        async with self.client.get_session() as session:
            result = await session.run(query, {"course_id": str(course_id)})
            row = await result.single()
        if not row:
            return {
                "course_id": str(course_id),
                "nodes": [],
                "edges": [],
                "module_links": [],
                "source_links": [],
                "probes": [],
                "stats": {"concepts": 0, "misconceptions": 0, "socratic_probes": 0, "edges": 0, "module_links": 0, "source_links": 0},
            }

        nodes = [dict(item) for item in row["concepts"] if item and item.get("concept_id")]
        edges = [dict(item) for item in row["raw_edges"] if item and item.get("source")]
        module_links = [dict(item) for item in row["raw_module_links"] if item and item.get("concept_id")]
        source_links = [dict(item) for item in row["raw_source_links"] if item and item.get("concept_id")]

        misconception_nodes = [dict(item) for item in row.get("misconception_nodes", []) if item and item.get("concept_id")]
        misconception_edges = [dict(item) for item in row.get("misconception_edges", []) if item and item.get("source")]
        probes = [dict(item) for item in row.get("probes", []) if item and item.get("probe_id")]

        seen_node_ids = {n["concept_id"] for n in nodes}
        for mn in misconception_nodes:
            if mn["concept_id"] not in seen_node_ids:
                nodes.append(mn)
                seen_node_ids.add(mn["concept_id"])

        seen_edges = {(e["source"], e["target"], e.get("relation")) for e in edges}
        for me in misconception_edges:
            edge_key = (me["source"], me["target"], me.get("relation"))
            if edge_key not in seen_edges:
                edges.append(me)
                seen_edges.add(edge_key)

        # Socratic Probes as first-class network nodes
        for p in probes:
            p_node = {
                "concept_id": p["probe_id"],
                "label": f"Rung {p.get('rung', 0)} Probe",
                "definition": p.get("probe_text", ""),
                "concept_type": "socratic_probe",
                "level": "socratic_probe",
                "rung": p.get("rung", 0),
                "rationale": p.get("rationale"),
                "misconception_id": p.get("misconception_id"),
                "status": p.get("status", "pending_review"),
            }
            if p_node["concept_id"] not in seen_node_ids:
                nodes.append(p_node)
                seen_node_ids.add(p_node["concept_id"])

            if p.get("misconception_id"):
                pe = {
                    "source": p["misconception_id"],
                    "target": p["probe_id"],
                    "relation": "PROBED_BY",
                }
                edge_key = (pe["source"], pe["target"], pe["relation"])
                if edge_key not in seen_edges:
                    edges.append(pe)
                    seen_edges.add(edge_key)

        # Compute degree centrality for node radius scaling in Obsidian Graph
        degree_map: dict[str, int] = {}
        for e in edges:
            s, t = e["source"], e["target"]
            degree_map[s] = degree_map.get(s, 0) + 1
            degree_map[t] = degree_map.get(t, 0) + 1
        for n in nodes:
            n["degree"] = degree_map.get(n["concept_id"], 1)

        return {
            "course_id": str(course_id),
            "nodes": nodes,
            "edges": edges,
            "module_links": module_links,
            "source_links": source_links,
            "probes": probes,
            "stats": {
                "concepts": len([n for n in nodes if n.get("concept_type") not in ("misconception", "socratic_probe", "module")]),
                "misconceptions": len(misconception_nodes),
                "socratic_probes": len(probes),
                "edges": len(edges),
                "module_links": len(module_links),
                "source_links": len(source_links),
            },
        }

    async def match_claim_concepts(
        self,
        course_id: str,
        claim_text: str,
        limit: int = 2,
    ) -> list[dict[str, str]]:
        """Return approved concepts whose teacher-validated language overlaps a claim.

        This is a deliberately conservative retrieval step, not a claim-truth
        classifier. A concept match tells the Socratic agent what relationship to
        probe; it never determines whether the learner's claim is correct.
        """
        claim_terms = set(re.findall(r"[a-z0-9]{4,}", claim_text.lower()))
        if not claim_terms:
            return []
        query = """
        MATCH (concept:Concept {course_id: $course_id, status: 'approved'})
        RETURN concept.concept_id AS concept_id,
               concept.label AS label,
               concept.definition AS definition,
               concept.level AS level
        """
        async with self.client.get_session() as session:
            result = await session.run(query, {"course_id": str(course_id)})
            candidates = [dict(record) for record in await result.data()]

        scored: list[tuple[int, dict[str, str]]] = []
        for candidate in candidates:
            label_terms = set(re.findall(r"[a-z0-9]{4,}", str(candidate.get("label") or "").lower()))
            definition_terms = set(re.findall(r"[a-z0-9]{4,}", str(candidate.get("definition") or "").lower()))
            score = 3 * len(claim_terms & label_terms) + len(claim_terms & definition_terms)
            if score:
                scored.append(
                    (
                        score,
                        {
                            "concept_id": str(candidate["concept_id"]),
                            "label": str(candidate["label"]),
                            "definition": str(candidate.get("definition") or ""),
                            "level": str(candidate.get("level") or ""),
                        },
                    )
                )
        return [candidate for _, candidate in sorted(scored, key=lambda item: (-item[0], item[1]["label"]))[:limit]]


concept_graph_service = ConceptGraphService()
