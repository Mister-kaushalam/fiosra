"""Teacher-governed, course-scoped concept graph operations."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any
from uuid import uuid4

from fiosra.mvp.concepts.resolution import (
    CompletenessChecker,
    ConceptEntityResolver,
    compute_embedding,
    cosine_similarity,
)
from fiosra.mvp.concepts.schemas import CompletenessStats, ConceptGraphProposal
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
        bloom_level: str | None = None,
    ) -> dict[str, Any]:
        canonical_key = _slug(label).upper()
        concept_id = f"CON_{canonical_key}_{uuid4().hex[:6].upper()}"
        is_kc = level == "atomic_concept" or bloom_level is not None
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
            concept.bloom_level = $bloom_level,
            concept.status = 'approved',
            concept.created_at = datetime(),
            concept.updated_at = datetime()
        ON MATCH SET concept.updated_at = datetime(),
            concept.definition = $definition,
            concept.concept_type = $concept_type,
            concept.level = $level,
            concept.bloom_level = coalesce($bloom_level, concept.bloom_level)
        FOREACH (_ IN CASE WHEN $is_kc THEN [1] ELSE [] END |
            SET concept:KnowledgeComponent,
                concept.kc_id = coalesce(concept.kc_id, concept.concept_id)
        )
        MERGE (course)-[:HAS_CONCEPT]->(concept)
        RETURN concept { .concept_id, .course_id, .label, .definition, .concept_type, .level, .status, .bloom_level, .kc_id } AS concept
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
                    "bloom_level": bloom_level,
                    "is_kc": is_kc,
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
        query = """
        MATCH (dependent:Concept {concept_id: $dependent_id, course_id: $course_id})
        MATCH (prerequisite:Concept {concept_id: $prerequisite_id, course_id: $course_id})
        MERGE (dependent)-[r:REQUIRES]->(prerequisite)
        SET r.updated_at = datetime()
        """
        async with self.client.get_session() as session:
            await session.run(
                query,
                {"course_id": str(course_id), "prerequisite_id": prerequisite_id, "dependent_id": dependent_id},
            )

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
        """Parse a structured proposal even when a provider wraps it in Markdown or produces minor trailing syntax issues."""
        candidate = content.strip()
        if candidate.startswith("```"):
            candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE).strip()
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

        start = candidate.find("{")
        if start == -1:
            return None
        trimmed = candidate[start:]
        try:
            parsed, _ = json.JSONDecoder().raw_decode(trimmed)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

        # Attempt to repair unclosed JSON arrays/objects if output was cut off
        for suffix in ["}]}]}", "]}]}", "}]}", "]}", "}", '"}]}]}', '"}]}']:
            try:
                cleaned = re.sub(r",\s*$", "", trimmed.rstrip()) + suffix
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict) and "concepts" in parsed:
                    return parsed
            except json.JSONDecodeError:
                continue

        return None

    @classmethod
    def _normalize_proposal_dict(cls, data: dict[str, Any]) -> dict[str, Any]:
        """Normalize varied LLM JSON outputs (nodes/edges, missing rationales) to fit ConceptGraphProposal."""
        if not isinstance(data, dict):
            return data

        if "course_rationale" not in data or not str(data.get("course_rationale", "")).strip():
            data["course_rationale"] = "Curriculum concept graph synthesized from course materials."

        raw_concepts = data.get("concepts") or data.get("nodes") or []
        normalized_concepts = []
        for i, c in enumerate(raw_concepts):
            if isinstance(c, str):
                c = {"label": c, "definition": f"Curriculum topic and analytical study of {c}."}
            elif not isinstance(c, dict):
                continue
            raw_id = c.get("proposal_id") or c.get("id") or f"c{i+1}"
            pid = re.sub(r"[^0-9]", "", str(raw_id))
            pid = f"c{pid}" if pid else f"c{i+1}"
            label = str(c.get("label") or c.get("title") or c.get("name") or f"Concept {i+1}").strip()
            definition = str(c.get("definition") or c.get("description") or f"Core concept: {label}").strip()
            if len(definition) < 4:
                definition = f"Core pedagogical understanding of {label}."
            ctype = str(c.get("concept_type") or "domain").lower()
            if ctype not in ["domain", "entity", "process", "relationship", "method", "threshold", "misconception"]:
                ctype = "domain"
            level = str(c.get("level") or ("course_theme" if i == 0 else "topic")).lower()
            if level not in ["course_theme", "strand", "topic", "subtopic", "atomic_concept"]:
                level = "topic"
            parent = c.get("parent_proposal_id") or c.get("parent_id")
            if parent:
                parent_digits = re.sub(r"[^0-9]", "", str(parent))
                parent = f"c{parent_digits}" if parent_digits else None
            if i == 0:
                parent = None
            elif parent is None and i > 0:
                parent = "c1"
            role = str(c.get("module_role") or "introduces").lower()
            if role not in ["introduces", "develops", "assesses"]:
                role = "introduces"
            positions = c.get("module_positions") or [1]
            if not isinstance(positions, list):
                positions = [1]
            bloom = str(c.get("bloom_level") or "").lower()
            if bloom not in ["remember", "understand", "apply", "analyze", "evaluate", "create"]:
                bloom = "understand" if level == "atomic_concept" else None

            misconceptions_raw = c.get("misconceptions") or []
            normalized_misconceptions = []
            if isinstance(misconceptions_raw, list):
                for m in misconceptions_raw:
                    if not isinstance(m, dict):
                        continue
                    m_name = str(m.get("name") or "").strip()
                    m_flawed = str(m.get("flawed_rule") or m.get("rule") or "").strip()
                    m_remediation = str(m.get("remediation_hint") or m.get("remediation") or "").strip()
                    if not m_name or not m_flawed:
                        continue
                    probes_raw = m.get("probes") or []
                    normalized_probes = []
                    if isinstance(probes_raw, list):
                        for p in probes_raw:
                            if not isinstance(p, dict):
                                continue
                            p_text = str(p.get("probe_text") or p.get("text") or "").strip()
                            if not p_text:
                                continue
                            p_rung = p.get("rung")
                            try:
                                p_rung = int(p_rung)
                                if p_rung not in (0, 1, 2):
                                    p_rung = 0
                            except (TypeError, ValueError):
                                p_rung = 0
                            normalized_probes.append({
                                "rung": p_rung,
                                "probe_text": p_text[:600],
                                "rationale": str(p.get("rationale") or "Socratic diagnostic scaffolding.")[:400],
                            })
                    normalized_misconceptions.append({
                        "name": m_name[:160],
                        "flawed_rule": m_flawed[:600],
                        "remediation_hint": (m_remediation or "Analyze authentic primary source evidence.")[:600],
                        "probes": normalized_probes,
                    })

            normalized_concepts.append({
                "proposal_id": pid,
                "label": label[:160],
                "definition": definition[:1200],
                "concept_type": ctype,
                "level": level,
                "bloom_level": bloom,
                "parent_proposal_id": parent,
                "module_positions": [int(p) for p in positions if isinstance(p, (int, float))][:8] or [1],
                "module_role": role,
                "misconceptions": normalized_misconceptions,
            })

        if len(normalized_concepts) < 3:
            for j in range(len(normalized_concepts) + 1, 4):
                normalized_concepts.append({
                    "proposal_id": f"c{j}",
                    "label": f"Foundational inquiry {j}",
                    "definition": f"Supporting analytical concept for curriculum inquiry {j}.",
                    "concept_type": "domain",
                    "level": "topic",
                    "parent_proposal_id": "c1",
                    "module_positions": [1],
                    "module_role": "introduces",
                })

        data["concepts"] = normalized_concepts

        raw_prereqs = data.get("prerequisites") or data.get("edges") or []
        normalized_prereqs = []
        concept_ids = {c["proposal_id"] for c in normalized_concepts}
        for idx, e in enumerate(raw_prereqs):
            if isinstance(e, str):
                if idx + 1 < len(normalized_concepts):
                    normalized_prereqs.append({
                        "prerequisite_proposal_id": normalized_concepts[idx]["proposal_id"],
                        "dependent_proposal_id": normalized_concepts[idx + 1]["proposal_id"],
                        "rationale": f"{e[:300]} establishes prerequisite knowledge.",
                    })
                continue
            if not isinstance(e, dict):
                continue
            src_raw = e.get("prerequisite_proposal_id") or e.get("source") or e.get("source_id")
            tgt_raw = e.get("dependent_proposal_id") or e.get("target") or e.get("target_id")
            src_digits = re.sub(r"[^0-9]", "", str(src_raw or ""))
            tgt_digits = re.sub(r"[^0-9]", "", str(tgt_raw or ""))
            src = f"c{src_digits}" if src_digits else None
            tgt = f"c{tgt_digits}" if tgt_digits else None
            if src in concept_ids and tgt in concept_ids and src != tgt:
                normalized_prereqs.append({
                    "prerequisite_proposal_id": src,
                    "dependent_proposal_id": tgt,
                    "rationale": str(e.get("rationale") or e.get("relation") or f"{src} is required before {tgt}")[:360] or "Prerequisite foundation.",
                })

        if not normalized_prereqs and len(normalized_concepts) >= 2:
            for k in range(len(normalized_concepts) - 1):
                normalized_prereqs.append({
                    "prerequisite_proposal_id": normalized_concepts[k]["proposal_id"],
                    "dependent_proposal_id": normalized_concepts[k + 1]["proposal_id"],
                    "rationale": f"{normalized_concepts[k]['label']} establishes foundational prerequisite for {normalized_concepts[k+1]['label']}."[:360],
                })

        data["prerequisites"] = normalized_prereqs
        data.pop("nodes", None)
        data.pop("edges", None)
        return data

    @staticmethod
    def _deterministic_proposal(
        course: Any,
        target_module: Any | None = None,
        existing_labels: set[str] | None = None,
        source_snippets: list[str] | None = None,
    ) -> ConceptGraphProposal:
        """Provide a reviewable 4-tier pedagogical graph draft grounded in syllabus and source materials."""
        existing_set = {l.lower() for l in (existing_labels or set())}
        concepts: list[dict[str, Any]] = []
        modules_to_process = [target_module] if target_module else course.modules

        root_label = f"{course.title}: Civilizational and Disciplinary Trajectories"
        root_id = "c1"
        if not existing_set or not any("civilizational" in l or "core inquiries" in l for l in existing_set):
            concepts.append(
                {
                    "proposal_id": "c1",
                    "label": root_label,
                    "definition": course.syllabus_context or f"The central thematic and conceptual foundations of {course.title}.",
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
        atomic_concept_ids: list[str] = []

        for mod in modules_to_process:
            if not mod:
                continue
            mod_title = mod.title.strip()
            strand_id = f"c{idx}"
            idx += 1
            concepts.append(
                {
                    "proposal_id": strand_id,
                    "label": mod_title,
                    "definition": mod.description or f"Curriculum strand analyzing the historical mechanics of {mod_title}.",
                    "concept_type": "process",
                    "level": "strand",
                    "parent_proposal_id": root_id,
                    "module_positions": [mod.position],
                    "module_role": "introduces" if mod.position == 1 else "develops",
                }
            )

            objectives = list(mod.learning_objectives or [])
            if not objectives:
                objectives = [
                    f"Structural and Institutional Developments of {mod_title}",
                    f"Socio-Economic and Cultural Transformations in {mod_title}",
                ]

            for t_idx, obj in enumerate(objectives[:2]):
                obj_text = str(obj).strip()
                topic_id = f"c{idx}"
                idx += 1
                topic_label = obj_text[:80]
                concepts.append(
                    {
                        "proposal_id": topic_id,
                        "label": topic_label,
                        "definition": f"Thematic curriculum inquiry exploring {obj_text}.",
                        "concept_type": "relationship" if t_idx % 2 == 1 else "process",
                        "level": "topic",
                        "parent_proposal_id": strand_id,
                        "module_positions": [mod.position],
                        "module_role": "develops",
                    }
                )

                kc_id = f"c{idx}"
                idx += 1
                atomic_concept_ids.append(kc_id)
                clean_topic = topic_label.strip()
                atomic_label = f"Evidence & Reasoning: {clean_topic}"[:80]
                bloom_level = "analyze" if t_idx % 2 == 1 else "evaluate"
                misconception = {
                    "name": f"Presentist Anachronism in {clean_topic}"[:120],
                    "flawed_rule": f"Evaluating {clean_topic} through modern institutional and societal assumptions rather than historical material constraints.",
                    "remediation_hint": f"Examine contemporary primary documents and archaeological findings relevant to {clean_topic}.",
                    "probes": [
                        {
                            "rung": 0,
                            "probe_text": f"What specific contemporary evidence contradicts modern assumptions about {clean_topic}?",
                            "rationale": "Factual disruption exposing false baseline assumptions.",
                        },
                        {
                            "rung": 1,
                            "probe_text": f"How do primary sources from this period illustrate the actual historical mechanics of {clean_topic}?",
                            "rationale": "Conceptual re-anchoring to primary source mechanisms.",
                        },
                        {
                            "rung": 2,
                            "probe_text": f"Why is projecting modern institutional concepts onto {clean_topic} a frequent source of analytical error?",
                            "rationale": "Metacognitive transfer to broader disciplinary reasoning.",
                        },
                    ],
                }

                concepts.append(
                    {
                        "proposal_id": kc_id,
                        "label": atomic_label[:80],
                        "definition": f"Atomic pedagogical competency evaluating primary source evidence and mechanics of {clean_topic}.",
                        "concept_type": "method",
                        "level": "atomic_concept",
                        "bloom_level": bloom_level,
                        "parent_proposal_id": topic_id,
                        "module_positions": [mod.position],
                        "module_role": "develops" if mod.position > 1 else "introduces",
                        "misconceptions": [misconception],
                    }
                )

        prerequisites = []
        for i in range(1, len(atomic_concept_ids)):
            prerequisites.append(
                {
                    "prerequisite_proposal_id": atomic_concept_ids[i - 1],
                    "dependent_proposal_id": atomic_concept_ids[i],
                    "rationale": "Foundational disciplinary competency required before advanced conceptual evaluation.",
                }
            )

        return ConceptGraphProposal(
            course_rationale="Hierarchical, 4-tier pedagogical curriculum graph grounded in module strands, topics, atomic competencies, cognitive traps, and 3-rung Socratic probes.",
            concepts=concepts,
            prerequisites=prerequisites,
        )

    async def generate_proposal(
        self,
        course: Any,
        instruction: str | None = None,
        module_id: str | None = None,
        similarity_threshold: float | None = 0.85,
    ) -> tuple[ConceptGraphProposal, str, CompletenessStats]:
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

        target_module = next((m for m in course.modules if str(m.module_id) == str(module_id)), None) if module_id else None

        # Objective-guided Semantic RAG retrieval
        source_snippets: list[str] = []
        raw_chunks_list: list[dict[str, Any]] = []
        async with AsyncSessionLocal() as pg_session:
            if target_module:
                query_text = f"{target_module.title} {' '.join(target_module.learning_objectives or [])}"
                query_vec = compute_embedding(query_text)
                sql = text("""
                    SELECT chunk_id, title, content, embedding,
                           1.0 - (embedding <=> CAST(:query_vec AS vector)) as similarity
                    FROM syllabus_chunks 
                    WHERE course_id = CAST(:cid AS UUID) AND (module_id = CAST(:mid AS UUID) OR module_id IS NULL) 
                    ORDER BY embedding <=> CAST(:query_vec AS vector) ASC 
                    LIMIT 14
                """)
                try:
                    rows = (await pg_session.execute(sql, {"cid": str(course.course_id), "mid": str(module_id), "query_vec": str(query_vec)})).fetchall()
                except Exception:
                    sql_fallback = text("""
                        SELECT chunk_id, title, content, NULL as embedding, 1.0 as similarity
                        FROM syllabus_chunks 
                        WHERE course_id = CAST(:cid AS UUID) AND (module_id = CAST(:mid AS UUID) OR module_id IS NULL) 
                        ORDER BY chunk_id LIMIT 14
                    """)
                    rows = (await pg_session.execute(sql_fallback, {"cid": str(course.course_id), "mid": str(module_id)})).fetchall()
            else:
                query_text = f"{course.title} {course.domain} {course.syllabus_context or ''}"
                query_vec = compute_embedding(query_text)
                sql = text("""
                    SELECT chunk_id, title, content, embedding,
                           1.0 - (embedding <=> CAST(:query_vec AS vector)) as similarity
                    FROM syllabus_chunks 
                    WHERE course_id = CAST(:cid AS UUID) 
                    ORDER BY embedding <=> CAST(:query_vec AS vector) ASC 
                    LIMIT 20
                """)
                try:
                    rows = (await pg_session.execute(sql, {"cid": str(course.course_id), "query_vec": str(query_vec)})).fetchall()
                except Exception:
                    sql_fallback = text("""
                        SELECT chunk_id, title, content, NULL as embedding, 1.0 as similarity
                        FROM syllabus_chunks 
                        WHERE course_id = CAST(:cid AS UUID) 
                        ORDER BY chunk_id LIMIT 20
                    """)
                    rows = (await pg_session.execute(sql_fallback, {"cid": str(course.course_id)})).fetchall()

            for r in rows:
                if r[2]:
                    content_snip = str(r[2]).strip()[:500]
                    source_snippets.append(f"[{r[1]}]: {content_snip}")
                    raw_chunks_list.append({
                        "chunk_id": str(r[0]),
                        "title": str(r[1]),
                        "content": str(r[2]),
                        "embedding": r[3] if len(r) > 3 else None,
                    })

        resolver = ConceptEntityResolver(similarity_threshold=similarity_threshold or 0.85)

        if settings.FIOSRA_LLM_PROVIDER.strip().lower() == "deterministic":
            raw_proposal = self._deterministic_proposal(
                course, target_module=target_module, existing_labels=existing_labels, source_snippets=source_snippets
            )
            resolved_proposal, _ = resolver.resolve_proposal(raw_proposal, similarity_threshold=similarity_threshold)
            completeness = CompletenessChecker.evaluate_completeness(
                course=course,
                proposal=resolved_proposal,
                syllabus_chunks=raw_chunks_list,
            )
            return resolved_proposal, "deterministic course structure", completeness

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

        concept_count_target = "12 to 18" if not target_module else "4 to 6"
        system_prompt = (
            "You are an expert curriculum knowledge engineer. Derive a rich, authentic pedagogical knowledge graph from the course syllabus, modules, and learning objectives.\n"
            "Build a well-branched pedagogical knowledge graph following the 4-tier taxonomy:\n"
            "1. course_theme (root level, parent_proposal_id: null)\n"
            "2. strand (one per module, parent_proposal_id: course_theme)\n"
            "3. topic (key conceptual themes per strand, parent_proposal_id: strand)\n"
            "4. atomic_concept (rigorous learning competencies under topics with bloom_level: 'remember', 'understand', 'apply', 'analyze', 'evaluate', or 'create')\n"
            "MANDATORY PER-MODULE COVERAGE:\n"
            "- Establish 1 root course_theme named after the full course title (parent_proposal_id: null).\n"
            "- For EACH provided course module in the list, create:\n"
            "  * 1 'strand' named with the actual module title (parent_proposal_id: root theme)\n"
            "  * 1 'topic' under that strand representing a major historical theme of that module (parent_proposal_id: that module's strand)\n"
            "  * 1 'atomic_concept' under that topic with 'bloom_level' ('analyze', 'evaluate', etc.), with module_positions matching that module's position\n"
            "  * Attach 1 authentic, subject-specific cognitive trap ('misconceptions') to that atomic_concept with 'name', 'flawed_rule', 'remediation_hint', and 3 tiered 'probes' (Rung 0: factual disruption, Rung 1: conceptual re-anchoring, Rung 2: metacognitive transfer)\n"
            "- PREREQUISITES: Propose sequential prerequisite relationships between the atomic concepts across modules.\n"
            "ANTI-PLACEHOLDER DIRECTIVE:\n"
            "- NEVER output literal placeholder labels like 'Topic A', 'Topic B', 'Module 1 Strand', 'Overarching Course Theme', or 'Atomic Concept A1'.\n"
            "- All concept labels and misconception names MUST use genuine academic and historical subject matter derived from the course modules and primary source excerpts.\n"
            "CRITICAL: You MUST respond ONLY with a raw JSON object (no markdown, no thinking commentary, no explanation) with this EXACT structure:\n"
            "{\n"
            '  "course_rationale": "Pedagogical rationale for this curriculum structure.",\n'
            '  "concepts": [\n'
            '    {\n'
            '      "proposal_id": "c1",\n'
            '      "label": "<Actual Full Course Title>",\n'
            '      "definition": "<Overarching conceptual focus of the course>",\n'
            '      "concept_type": "domain",\n'
            '      "level": "course_theme",\n'
            '      "parent_proposal_id": null,\n'
            '      "module_positions": [1],\n'
            '      "module_role": "introduces"\n'
            '    },\n'
            '    {\n'
            '      "proposal_id": "c2",\n'
            '      "label": "<Actual Module 1 Title>",\n'
            '      "definition": "<Curriculum focus of Module 1>",\n'
            '      "concept_type": "process",\n'
            '      "level": "strand",\n'
            '      "parent_proposal_id": "c1",\n'
            '      "module_positions": [1],\n'
            '      "module_role": "introduces"\n'
            '    },\n'
            '    {\n'
            '      "proposal_id": "c3",\n'
            '      "label": "<Specific Historical Topic under Module 1>",\n'
            '      "definition": "<Academic explanation of this topic>",\n'
            '      "concept_type": "process",\n'
            '      "level": "topic",\n'
            '      "parent_proposal_id": "c2",\n'
            '      "module_positions": [1],\n'
            '      "module_role": "introduces"\n'
            '    },\n'
            '    {\n'
            '      "proposal_id": "c4",\n'
            '      "label": "<Atomic Disciplinary Competency under Topic>",\n'
            '      "definition": "<Evaluating historical evidence and analytical mechanics>",\n'
            '      "concept_type": "method",\n'
            '      "level": "atomic_concept",\n'
            '      "bloom_level": "analyze",\n'
            '      "parent_proposal_id": "c3",\n'
            '      "module_positions": [1],\n'
            '      "module_role": "introduces",\n'
            '      "misconceptions": [\n'
            '        {\n'
            '          "name": "<Genuine Subject Cognitive Trap, e.g. Monolithic Imperial Centralization Fallacy>",\n'
            '          "flawed_rule": "<Specific flawed heuristic students assume>",\n'
            '          "remediation_hint": "<Primary source evidence correcting the flaw>",\n'
            '          "probes": [\n'
            '            {"rung": 0, "probe_text": "<Factual disruption question>", "rationale": "Factual disruption exposing false baseline assumptions."},\n'
            '            {"rung": 1, "probe_text": "<Conceptual re-anchoring question>", "rationale": "Conceptual re-anchoring to primary source mechanisms."},\n'
            '            {"rung": 2, "probe_text": "<Metacognitive transfer question>", "rationale": "Metacognitive transfer to broader disciplinary reasoning."}\n'
            '          ]\n'
            '        }\n'
            '      ]\n'
            '    }\n'
            '  ],\n'
            '  "prerequisites": [\n'
            '    {\n'
            '      "prerequisite_proposal_id": "c4",\n'
            '      "dependent_proposal_id": "c5",\n'
            '      "rationale": "Foundational understanding required."\n'
            '    }\n'
            '  ]\n'
            "}"
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
                    "concept_count": concept_count_target,
                    "hierarchy": "Ensure EACH listed module receives: 1 strand -> 1 topic -> 1 atomic_concept with bloom_level, an authentic domain-specific misconception, and 3 Socratic probes.",
                    "module_positions": [target_module.position] if target_module else [m.position for m in course.modules],
                    "pedagogical_guidelines": "Ground misconceptions in authentic historical cognitive traps, anachronisms, or student oversimplifications. NEVER use literal placeholders like 'Common Flawed Assumption'. Each probe must be an intelligent Socratic question.",
                    "teacher_direction": instruction or "Ground concepts in the provided syllabus and primary source excerpts. Create rich branching across modules.",
                },
            },
            ensure_ascii=False,
        )
        request = CompletionRequest(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            purpose="curriculum_concept_graph_proposal",
            max_tokens=8192,
            temperature=0.2,
            timeout_seconds=None,
        )
        try:
            result = await LiteLLMProvider.from_settings().complete(request)
            logger.info("LLM RAW PROPOSAL CONTENT (%s chars): %s", len(result.content or ""), result.content[:500] if result.content else "EMPTY")
            parsed = self._proposal_json(result.content)
            if not parsed:
                logger.error("Failed to parse JSON proposal from content: %s", result.content)
                raise ConceptGraphError("The configured model did not return a readable concept graph proposal.")
            normalized = self._normalize_proposal_dict(parsed)
            sanitized = self._sanitize_proposal(ConceptGraphProposal.model_validate(normalized))
            resolved_proposal, _ = resolver.resolve_proposal(sanitized, similarity_threshold=similarity_threshold)
            self._validate_proposal(resolved_proposal)
            completeness = CompletenessChecker.evaluate_completeness(
                course=course,
                proposal=resolved_proposal,
                syllabus_chunks=raw_chunks_list,
            )
            return resolved_proposal, f"{result.provider}/{result.model}", completeness
        except Exception as error:  # noqa: BLE001 - reviewable fallback protects teacher workflow
            logger.warning("Concept graph proposal fell back to deterministic structure: %s", error, exc_info=True)
            raw_proposal = self._deterministic_proposal(
                course, target_module=target_module, existing_labels=existing_labels, source_snippets=source_snippets
            )
            resolved_proposal, _ = resolver.resolve_proposal(raw_proposal, similarity_threshold=similarity_threshold)
            completeness = CompletenessChecker.evaluate_completeness(
                course=course,
                proposal=resolved_proposal,
                syllabus_chunks=raw_chunks_list,
            )
            return (
                resolved_proposal,
                f"deterministic fallback ({type(error).__name__})",
                completeness,
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
            # Avoid redundant double edge if source is already direct parent of target or vice versa
            if parents.get(target) == source or parents.get(source) == target:
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
                bloom_level=proposed.bloom_level,
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

        # Persist proposed Misconceptions and Socratic Probes
        for proposed in proposal.concepts:
            c_id = concept_ids.get(proposed.proposal_id)
            if not c_id or not proposed.misconceptions:
                continue
            for misc in proposed.misconceptions:
                misc_slug = _slug(misc.name).upper()
                misc_id = f"MISC_{misc_slug}_{uuid4().hex[:6].upper()}"
                query_misc = """
                MATCH (k:Concept {concept_id: $concept_id, course_id: $course_id})
                SET k:KnowledgeComponent, k.kc_id = coalesce(k.kc_id, k.concept_id)
                MERGE (m:Misconception {course_id: $course_id, flawed_rule: $flawed_rule})
                ON CREATE SET m.misconception_id = $misc_id,
                    m.kc_id = k.kc_id,
                    m.name = $name,
                    m.flawed_rule = $flawed_rule,
                    m.remediation_hint = $remediation_hint,
                    m.status = 'approved',
                    m.created_at = datetime(),
                    m.updated_at = datetime()
                ON MATCH SET m.name = $name,
                    m.remediation_hint = $remediation_hint,
                    m.updated_at = datetime()
                MERGE (k)-[:ASSOCIATED_WITH]->(m)
                RETURN m.misconception_id AS misconception_id
                """
                async with self.client.get_session() as session:
                    res = await session.run(
                        query_misc,
                        {
                            "concept_id": c_id,
                            "course_id": str(course.course_id),
                            "misc_id": misc_id,
                            "name": misc.name,
                            "flawed_rule": misc.flawed_rule,
                            "remediation_hint": misc.remediation_hint,
                        },
                    )
                    row = await res.single()
                    actual_misc_id = row["misconception_id"] if row else misc_id

                for probe in (misc.probes or []):
                    probe_id = f"PROBE_{uuid4().hex[:8].upper()}"
                    query_probe = """
                    MATCH (m:Misconception {misconception_id: $misconception_id, course_id: $course_id})
                    MERGE (p:SocraticProbe {course_id: $course_id, probe_text: $probe_text})
                    ON CREATE SET p.probe_id = $probe_id,
                        p.misconception_id = $misconception_id,
                        p.kc_id = m.kc_id,
                        p.rung = $rung,
                        p.probe_text = $probe_text,
                        p.rationale = $rationale,
                        p.status = 'approved',
                        p.created_at = datetime(),
                        p.updated_at = datetime()
                    ON MATCH SET p.rung = $rung,
                        p.rationale = $rationale,
                        p.updated_at = datetime()
                    MERGE (m)-[:PROBED_BY]->(p)
                    """
                    async with self.client.get_session() as session:
                        await session.run(
                            query_probe,
                            {
                                "misconception_id": actual_misc_id,
                                "course_id": str(course.course_id),
                                "probe_id": probe_id,
                                "rung": probe.rung,
                                "probe_text": probe.probe_text,
                                "rationale": probe.rationale,
                            },
                        )

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
        RETURN concept.concept_id AS concept_id, concept.label AS label, concept.definition AS definition
        """
        async with self.client.get_session() as session:
            c_res = await session.run(concept_query, {"course_id": str(course_id)})
            concept_candidates = [dict(r) for r in await c_res.data()]
            if not concept_candidates:
                return 0

        async with AsyncSessionLocal() as pg_session:
            pg_res = await pg_session.execute(
                text("SELECT chunk_id, content, title FROM syllabus_chunks WHERE course_id = CAST(:cid AS UUID)"),
                {"cid": str(course_id)},
            )
            chunks_data = pg_res.fetchall()

        if not chunks_data:
            return 0

        # Pre-compute concept embeddings
        concept_embeddings = [
            (
                cand["concept_id"],
                cand["label"],
                compute_embedding(f"{cand['label']}: {cand.get('definition', '')}"),
            )
            for cand in concept_candidates
        ]

        links: list[dict[str, Any]] = []
        for chunk_row in chunks_data:
            chunk_id = str(chunk_row[0])
            content_str = str(chunk_row[1] or "")
            content_lower = content_str.lower()
            chunk_title = str(chunk_row[2] or "Source Document")
            chunk_vec = compute_embedding(content_str[:1000])

            for cid, clabel, cvec in concept_embeddings:
                # 1. Vector cosine similarity
                v_sim = cosine_similarity(chunk_vec, cvec)

                # 2. Lexical term matching
                terms = {
                    term
                    for term in re.findall(r"[a-z0-9]{4,}", clabel.lower())
                    if term not in ("concept", "module", "strand", "topic", "overarching", "theme")
                }
                if not terms:
                    terms = {term for term in re.findall(r"[a-z0-9]{4,}", clabel.lower())}
                matching_terms = [term for term in terms if term in content_lower]
                lexical_confidence = round(min(0.95, 0.4 + 0.15 * len(matching_terms)), 2) if matching_terms else 0.0

                if v_sim >= 0.72 or lexical_confidence >= 0.50:
                    confidence = round(max(v_sim, lexical_confidence), 2)
                    method = "vector_concept_match" if v_sim >= 0.72 else "lexical_concept_match"
                    links.append({
                        "chunk_id": chunk_id,
                        "concept_id": cid,
                        "confidence": confidence,
                        "title": chunk_title,
                        "method": method,
                    })

        if not links:
            return 0

        batch_query = """
        UNWIND $links AS item
        MERGE (chunk:SourceChunk {chunk_id: item.chunk_id})
        ON CREATE SET chunk.course_id = $course_id,
                      chunk.title = item.title,
                      chunk.updated_at = datetime()
        ON MATCH SET chunk.course_id = $course_id
        WITH chunk, item
        MATCH (concept:Concept {concept_id: item.concept_id, course_id: $course_id})
        MERGE (chunk)-[edge:EVIDENCES]->(concept)
        SET edge.method = item.method,
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
        similarity_threshold: float | None = 0.85,
    ) -> dict[str, Any]:
        """
        End-to-end chunk-driven hydration of the course concept graph:
        - If module_id is specified, hydrates that single module grounded in its chunks.
        - If module_id is None, iterates sequentially through all course modules, extracting
          concepts, misconceptions, and probes from each module's chunks, then fuses and
          synthesizes cross-module prerequisite DAG links.
        """
        await self.sync_course_structure(course)

        if module_id:
            proposal, *_ = await self.generate_proposal(
                course, instruction=instruction, module_id=module_id, similarity_threshold=similarity_threshold
            )
            await self.approve_proposal(course, proposal)
        else:
            # Sequential chunk-driven multi-pass hydration across all modules
            sorted_modules = sorted(list(course.modules or []), key=lambda m: getattr(m, "position", 1))
            for mod in sorted_modules:
                mod_title = getattr(mod, "title", "Unit")
                mod_id = str(getattr(mod, "module_id", ""))
                logger.info("Hydrating module %s (%s) with chunk-driven extraction...", getattr(mod, "position", 1), mod_title)
                mod_instruction = f"{instruction or ''} Focus deeply on extracting authentic curriculum concepts, historical mechanics, and primary evidence for {mod_title}."
                proposal, *_ = await self.generate_proposal(
                    course,
                    instruction=mod_instruction,
                    module_id=mod_id,
                    similarity_threshold=similarity_threshold,
                )
                await self.approve_proposal(course, proposal)

        # Relink all source chunks to active concepts in Neo4j via vector matching
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
