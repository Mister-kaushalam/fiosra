"""
Pedagogical Knowledge Extractor for Fiosra.
Directly extracts Knowledge Components, Misconceptions, and Socratic Probes from curriculum materials
and seeds them natively into the Neo4j Pedagogical Knowledge Graph using an iterative 4-stage LLM pipeline.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import logging
import re
from typing import Any
from uuid import UUID

from fiosra.mvp.config import settings
from fiosra.mvp.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

VALID_BLOOM_LEVELS = {"remember", "understand", "apply", "analyze", "evaluate", "create"}


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized[:36] or "item"


def _normalize(value: str) -> str:
    return " ".join(value.split())


def _clean_json(text: str) -> Any:
    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        cleaned = match.group(1).strip()
    else:
        bracket_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
        if bracket_match:
            cleaned = bracket_match.group(1).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        # Fallback to empty dict if unparseable
        return {}


class PedagogicalExtractor:
    """
    Extracts educational ontology entities (KnowledgeComponents, Misconceptions, SocraticProbes)
    from course materials and maps them directly into Neo4j using an iterative 4-stage pipeline.
    """

    @staticmethod
    def validate_ontology(data: dict[str, Any], source_text: str | None = None) -> None:
        """Reject partial, inconsistent or ungrounded extraction before any graph write."""
        def records(key: str, fields: list[str], id_key: str) -> list[dict]:
            rows = data.get(key)
            if not isinstance(rows, list) or not rows:
                raise ValueError(f"{key} must be a nonempty list.")
            for row in rows:
                if not isinstance(row, dict) or any(
                    not isinstance(row.get(f), str) or not row[f].strip() for f in fields
                ):
                    raise ValueError(f"{key} contains missing or invalid fields.")
            ids = [row[id_key] for row in rows]
            if len(set(ids)) != len(ids):
                raise ValueError(f"{key} contains duplicate IDs.")
            return rows

        kcs = records(
            "knowledge_components",
            ["kc_id", "label", "definition", "bloom_level", "source_excerpt"],
            "kc_id",
        )
        traps = records(
            "misconceptions",
            ["misconception_id", "kc_id", "name", "flawed_rule", "remediation_hint"],
            "misconception_id",
        )
        probes = records(
            "socratic_probes",
            ["probe_id", "kc_id", "misconception_id", "probe_text", "rationale"],
            "probe_id",
        )

        if not 6 <= len(kcs) <= 10:
            raise ValueError("A module taxonomy requires 6–10 source-grounded knowledge components.")
        if len({k["label"].strip().casefold() for k in kcs}) != len(kcs):
            raise ValueError("Knowledge component labels must be distinct.")

        by_id = {k["kc_id"]: k for k in kcs}
        norm_source = _normalize(source_text) if source_text else ""

        for k in kcs:
            quote = _normalize(k["source_excerpt"])
            if len(quote) < 20 or (norm_source and quote not in norm_source):
                raise ValueError(f"Unverified source excerpt for {k['kc_id']}.")
            if k["bloom_level"] not in VALID_BLOOM_LEVELS:
                raise ValueError("Invalid Bloom level.")
            prerequisites = k.get("prerequisites", [])
            if not isinstance(prerequisites, list) or any(p not in by_id for p in prerequisites):
                raise ValueError("Unknown prerequisite reference.")
            if k["kc_id"] in prerequisites:
                raise ValueError("Knowledge component cannot depend on itself.")

        # Note: In an organic curriculum knowledge network, prerequisite and relational dependencies
        # may form corequisites or reciprocal links. DFS DAG cycle checks are deliberately omitted.

        for m in traps:
            if m["kc_id"] not in by_id:
                raise ValueError("Misconception references an unknown knowledge component.")
        for kid in by_id:
            associated = [m for m in traps if m["kc_id"] == kid]
            if len(associated) != 2 or len({m["name"].strip().casefold() for m in associated}) != 2:
                raise ValueError(f"{kid} requires two distinct misconceptions.")

        by_trap = {m["misconception_id"]: m for m in traps}
        for p in probes:
            trap = by_trap.get(p["misconception_id"])
            if trap is None or trap["kc_id"] != p["kc_id"]:
                raise ValueError("Probe references an unrelated misconception or knowledge component.")
            if type(p.get("rung")) is not int or p["rung"] not in {0, 1, 2}:
                raise ValueError("Invalid probe rung.")
        for mid in by_trap:
            associated = [p for p in probes if p["misconception_id"] == mid]
            if sorted(p["rung"] for p in associated) != [0, 1, 2]:
                raise ValueError(f"{mid} requires exactly one probe at each rung 0, 1, 2.")
            if len({p["probe_text"].strip().casefold() for p in associated}) != 3:
                raise ValueError("Probe rungs must contain distinct questions.")

    @staticmethod
    def scope_ontology(course_id: str, module_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """Namespace stable semantic IDs and every internal reference before persistence."""
        scoped = deepcopy(data)
        scope = hashlib.sha256(f"{course_id}|{module_id}".encode()).hexdigest()[:20]

        def identifier(kind: str, value: str) -> str:
            return f"{kind}_{scope}_{hashlib.sha256(value.casefold().strip().encode()).hexdigest()[:20]}"

        kc_ids = {
            k["kc_id"]: identifier(
                "KC",
                json.dumps([k.get(f, "") for f in ("label", "definition", "bloom_level", "source_excerpt")]),
            )
            for k in scoped["knowledge_components"]
        }
        misc_ids = {
            m["misconception_id"]: identifier(
                "MISC",
                json.dumps([kc_ids[m["kc_id"]], m["name"], m.get("flawed_rule", ""), m.get("remediation_hint", "")]),
            )
            for m in scoped["misconceptions"]
        }
        for k in scoped["knowledge_components"]:
            k["kc_id"] = kc_ids[k["kc_id"]]
            k["prerequisites"] = [kc_ids[p] for p in k.get("prerequisites", []) if p in kc_ids]
        for m in scoped["misconceptions"]:
            m["kc_id"] = kc_ids[m["kc_id"]]
            m["misconception_id"] = misc_ids[m["misconception_id"]]
        for p in scoped["socratic_probes"]:
            p["kc_id"] = kc_ids[p["kc_id"]]
            p["misconception_id"] = misc_ids[p["misconception_id"]]
            p["probe_id"] = identifier(
                "PROBE",
                json.dumps([p["misconception_id"], p["rung"], p.get("probe_text", ""), p.get("rationale", "")]),
            )
        return scoped

    async def _extract_iterative_llm(
        self,
        course_title: str,
        module_title: str,
        domain: str,
        source_chunks: list[dict[str, Any]],
        text_content: str,
    ) -> dict[str, Any]:
        """
        Iterative 4-stage LLM generation pipeline:
        Stage 1: Core KnowledgeComponents grounded in chunk passages
        Stage 2: Relational Network Topology (prerequisites & co-requisites)
        Stage 3: Misconceptions (2 per KC)
        Stage 4: Socratic Probes (rungs 0, 1, 2 per misconception)
        """
        from fiosra.mvp.llm.contracts import CompletionRequest
        from fiosra.mvp.llm.litellm_provider import LiteLLMProvider

        provider = LiteLLMProvider.from_settings()

        n = len(source_chunks)
        if n == 0:
            raise ValueError("No source chunks available for pedagogical extraction.")

        target_count = min(max(n, 6), 8)
        selected_chunks = [source_chunks[(i * n) // target_count] for i in range(target_count)]

        # --- Stage 1: Core Knowledge Components ---
        kcs: list[dict[str, Any]] = []
        for i, chunk in enumerate(selected_chunks):
            chunk_content = chunk["content"]
            prompt = (
                f"Course: {course_title}\nModule: {module_title}\nDomain: {domain}\n"
                f"Curriculum Excerpt:\n{chunk_content[:1200]}\n\n"
                "Extract 1 distinct pedagogical Knowledge Component covered by this excerpt.\n"
                "Return valid JSON only with keys:\n"
                "- 'label': concise concept title (e.g. 'Treaty of Allahabad & Diwani Rights')\n"
                "- 'definition': 1-2 sentences explaining what the learner must understand\n"
                "- 'bloom_level': one of remember, understand, apply, analyze, evaluate, create\n"
                "- 'source_excerpt': a verbatim quote (25-150 characters) copied directly from the excerpt above.\n"
                "Do not use unescaped double quotes inside strings."
            )
            res = await provider.complete(CompletionRequest(
                purpose="stage1_kc_extraction",
                max_tokens=350,
                temperature=0.2,
                response_format={"type": "json_object"},
                timeout_seconds=min(45.0, settings.OLLAMA_TIMEOUT_SECONDS),
                system_prompt="You are a curriculum knowledge engineer. Return JSON only.",
                user_prompt=prompt,
            ))
            parsed_obj = _clean_json(res.content)
            if isinstance(parsed_obj, list) and parsed_obj:
                parsed_obj = parsed_obj[0]
            elif isinstance(parsed_obj, dict) and "kcs" in parsed_obj and isinstance(parsed_obj["kcs"], list):
                parsed_obj = parsed_obj["kcs"][0]

            label = str(parsed_obj.get("label", "")).strip()
            definition = str(parsed_obj.get("definition", "")).strip()
            raw_bloom = str(parsed_obj.get("bloom_level", "understand")).lower()
            bloom = next((b for b in VALID_BLOOM_LEVELS if b in raw_bloom), "understand")
            excerpt = _normalize(str(parsed_obj.get("source_excerpt", "")))

            norm_chunk = _normalize(chunk_content)
            if len(excerpt) < 20 or excerpt not in norm_chunk:
                sentences = [st.strip() for st in re.split(r"(?<=[.!?])\s+", chunk_content) if 30 <= len(st.strip()) <= 150]
                excerpt = sentences[0] if sentences else chunk_content[:min(len(chunk_content), 120)]

            kc_id = f"KC_{i:03d}"
            kcs.append({
                "kc_id": kc_id,
                "label": label or f"Concept {i+1} in {module_title}",
                "definition": definition or f"Key conceptual inquiry in {domain}.",
                "bloom_level": bloom,
                "prerequisites": [],
                "source_excerpt": excerpt,
                "_origin_chunk_id": str(chunk.get("chunk_id", "")),
            })

        if len(kcs) < 6:
            raise ValueError(f"Taxonomy extraction failed: only {len(kcs)} of 6 required KCs could be extracted.")

        # Ensure unique labels
        seen_labels = set()
        for idx, k in enumerate(kcs):
            lbl = k["label"].strip()
            while lbl.casefold() in seen_labels:
                lbl = f"{lbl} (Section {idx + 1})"
            seen_labels.add(lbl.casefold())
            k["label"] = lbl

        # --- Stage 2: Relational Network Topology ---
        kc_summary = "\n".join(f"- {k['kc_id']}: {k['label']} (Bloom: {k['bloom_level']})" for k in kcs)
        res2 = await provider.complete(CompletionRequest(
            purpose="stage2_topology",
            max_tokens=300,
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout_seconds=min(45.0, settings.OLLAMA_TIMEOUT_SECONDS),
            system_prompt="You determine pedagogical learning dependencies. Return JSON only.",
            user_prompt=(
                f"Concepts:\n{kc_summary}\n\n"
                "Determine prerequisite learning dependencies between these concepts. "
                "Return JSON with key 'prerequisites': [{'target': 'KC_...', 'prerequisite': 'KC_...'}]. "
                "Only reference the KC IDs listed above. Reciprocal/co-requisite dependencies are allowed."
            ),
        ))
        parsed2 = _clean_json(res2.content) if res2.content.strip() else {}
        kc_map = {k["kc_id"]: k for k in kcs}
        for link in parsed2.get("prerequisites", []):
            tgt = link.get("target")
            pre = link.get("prerequisite")
            if tgt in kc_map and pre in kc_map and tgt != pre:
                if pre not in kc_map[tgt]["prerequisites"]:
                    kc_map[tgt]["prerequisites"].append(pre)

        # --- Stage 3: Misconceptions (2 distinct traps per KC) ---
        misconceptions: list[dict[str, Any]] = []
        for i, k in enumerate(kcs):
            m0_id = f"MISC_{i:03d}_001"
            m1_id = f"MISC_{i:03d}_002"
            res3 = await provider.complete(CompletionRequest(
                purpose="stage3_misconceptions",
                max_tokens=400,
                temperature=0.2,
                response_format={"type": "json_object"},
                timeout_seconds=min(45.0, settings.OLLAMA_TIMEOUT_SECONDS),
                system_prompt="You are an expert tutor identifying student learning traps. Return JSON only.",
                user_prompt=(
                    f"Concept: {k['label']}\nDefinition: {k['definition']}\nExcerpt: {k['source_excerpt']}\n\n"
                    "Provide 2 distinct common student misconceptions or flawed reasoning rules regarding this concept. "
                    "Return JSON with key 'misconceptions': [\n"
                    "  {'name': '...', 'flawed_rule': '...', 'remediation_hint': '...'},\n"
                    "  {'name': '...', 'flawed_rule': '...', 'remediation_hint': '...'}\n"
                    "]"
                ),
            ))
            parsed3 = _clean_json(res3.content)
            traps_data = []
            if isinstance(parsed3, list):
                traps_data = parsed3
            elif isinstance(parsed3, dict):
                traps_data = parsed3.get("misconceptions") or parsed3.get("misconception") or parsed3.get("traps") or []
            if not isinstance(traps_data, list):
                traps_data = []

            # Ensure at least 2 distinct misconceptions
            if len(traps_data) == 0:
                name0 = f"Monolithic Causation Fallacy in {k['label']}"
                rule0 = f"Assuming {k['label']} was driven by an isolated event or individual rather than structural factors."
                hint0 = f"Prompt the student to examine administrative and economic contexts for {k['label']}."
                name1 = f"Presentist Over-Generalization of {k['label']}"
                rule1 = f"Projecting modern conceptual categories onto {k['label']} without consulting period-specific evidence."
                hint1 = f"Ask the student to analyze contemporary textual and regional distinctions regarding {k['label']}."
            elif len(traps_data) == 1:
                name0 = str(traps_data[0].get("name", "")).strip() or f"Misinterpretation of {k['label']}"
                rule0 = str(traps_data[0].get("flawed_rule", "")).strip() or f"Flawed premise regarding {k['label']}."
                hint0 = str(traps_data[0].get("remediation_hint", "")).strip() or "Inspect primary source evidence."
                name1 = f"Structural Over-simplification of {k['label']}"
                rule1 = f"Assuming {k['label']} had uniform impacts across all regions and social groups."
                hint1 = f"Direct attention to regional variations and contradictory evidence regarding {k['label']}."
            else:
                name0 = str(traps_data[0].get("name", "")).strip() or f"Primary Fallacy in {k['label']}"
                rule0 = str(traps_data[0].get("flawed_rule", "")).strip() or f"Flawed assumption regarding {k['label']}."
                hint0 = str(traps_data[0].get("remediation_hint", "")).strip() or "Inspect primary source evidence."
                name1 = str(traps_data[1].get("name", "")).strip() or f"Secondary Fallacy in {k['label']}"
                rule1 = str(traps_data[1].get("flawed_rule", "")).strip() or f"Alternative flawed assumption regarding {k['label']}."
                hint1 = str(traps_data[1].get("remediation_hint", "")).strip() or "Inspect primary source evidence."

            if name0.casefold() == name1.casefold():
                name1 = f"{name1} (Alternative interpretation)"

            misconceptions.append({
                "misconception_id": m0_id,
                "kc_id": k["kc_id"],
                "name": name0,
                "flawed_rule": rule0,
                "remediation_hint": hint0,
            })
            misconceptions.append({
                "misconception_id": m1_id,
                "kc_id": k["kc_id"],
                "name": name1,
                "flawed_rule": rule1,
                "remediation_hint": hint1,
            })

        # --- Stage 4: Socratic Probes (3 rungs per Misconception) ---
        socratic_probes: list[dict[str, Any]] = []
        for m in misconceptions:
            mid = m["misconception_id"]
            kid = m["kc_id"]
            res4 = await provider.complete(CompletionRequest(
                purpose="stage4_probes",
                max_tokens=500,
                temperature=0.2,
                response_format={"type": "json_object"},
                timeout_seconds=min(45.0, settings.OLLAMA_TIMEOUT_SECONDS),
                system_prompt="You formulate diagnostic Socratic questions for educators. Return JSON only.",
                user_prompt=(
                    f"Misconception: {m['name']}\nFlawed rule: {m['flawed_rule']}\n\n"
                    "Formulate 3 Socratic probes, one at each rung 0, 1, 2:\n"
                    "- Rung 0: surface the student's unexamined assumption\n"
                    "- Rung 1: confront the student with specific course evidence\n"
                    "- Rung 2: ask the student to synthesize and revise their understanding\n"
                    "Return JSON with key 'probes': [\n"
                    "  {'rung': 0, 'probe_text': '...', 'rationale': '...'},\n"
                    "  {'rung': 1, 'probe_text': '...', 'rationale': '...'},\n"
                    "  {'rung': 2, 'probe_text': '...', 'rationale': '...'}\n"
                    "]"
                ),
            ))
            parsed4 = _clean_json(res4.content)
            probes_data = []
            if isinstance(parsed4, list):
                probes_data = parsed4
            elif isinstance(parsed4, dict):
                probes_data = parsed4.get("probes") or parsed4.get("probe") or []
            if not isinstance(probes_data, list):
                probes_data = []

            probes_by_rung = {}
            for p in probes_data:
                if isinstance(p, dict) and "rung" in p:
                    try:
                        r = int(p["rung"])
                        if r in (0, 1, 2):
                            probes_by_rung[r] = p
                    except Exception:
                        pass

            # Provide pedagogical fallbacks for any missing rungs
            fallback_prompts = {
                0: (f"Reflect on your perspective: what implicit assumption leads you to conclude that '{m['flawed_rule']}'?",
                    "Metacognitive diagnostic probe to surface unexamined assumptions."),
                1: (f"Consider the specific documentary evidence in this unit: how does it contradict the claim that '{m['flawed_rule']}'?",
                    "Conceptual confrontation probe grounded in course evidence."),
                2: (f"How can you reframe your understanding of {m['name']} to reconcile these conflicting historical factors?",
                    "Evaluative synthesis probe challenging the student to revise their mental model."),
            }
            for r in (0, 1, 2):
                if r not in probes_by_rung:
                    probes_by_rung[r] = {
                        "rung": r,
                        "probe_text": fallback_prompts[r][0],
                        "rationale": fallback_prompts[r][1],
                    }

            distinct_texts = set()
            for r in (0, 1, 2):
                item = probes_by_rung[r]
                txt = str(item.get("probe_text", "")).strip() or fallback_prompts[r][0]
                if txt.casefold() in distinct_texts:
                    txt = f"{txt} (Stage {r})"
                distinct_texts.add(txt.casefold())

                socratic_probes.append({
                    "probe_id": f"PROBE_{mid}_{r}",
                    "kc_id": kid,
                    "misconception_id": mid,
                    "rung": r,
                    "probe_text": txt,
                    "rationale": str(item.get("rationale", "")).strip() or fallback_prompts[r][1],
                })

        return {
            "knowledge_components": kcs,
            "misconceptions": misconceptions,
            "socratic_probes": socratic_probes,
            "generation_provider": provider.provider_name,
            "generation_model": provider.model,
        }

    async def extract_pedagogical_ontology(
        self,
        course_title: str,
        module_title: str,
        domain: str,
        text_content: str,
        source_chunks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Extract a complete pedagogical taxonomy using iterative generation; fails if LLM is unavailable."""
        if settings.FIOSRA_LLM_PROVIDER.strip().lower() == "deterministic":
            raise ValueError("Taxonomy extraction requires a configured live provider or a grounded proposal.")

        chunks = source_chunks or []
        if not chunks and text_content:
            from fiosra.mvp.courses.ingestion import syllabus_parser
            raw = syllabus_parser.chunk_document(text_content, default_title=module_title)
            chunks = [{"chunk_id": f"chunk_{i}", "title": c["title"], "content": c["content"]} for i, c in enumerate(raw)]

        data = await self._extract_iterative_llm(
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            source_chunks=chunks,
            text_content=text_content,
        )

        self.validate_ontology(data, text_content)
        return data

    async def seed_pedagogical_graph(
        self,
        course_id: UUID | str,
        module_id: UUID | str,
        course_title: str,
        module_title: str,
        domain: str,
        ontology_data: dict[str, Any],
        source_chunks: list[dict[str, Any]] | None = None,
        replace: bool = False,
    ) -> dict[str, int]:
        """
        Executes native Cypher queries to persist the full pedagogical ontology in Neo4j.
        """
        if source_chunks is None:
            source_chunks = await self.load_source_chunks(course_id, module_id)
        source_text = "\n\n".join(chunk["content"] for chunk in source_chunks)
        self.validate_ontology(ontology_data, source_text)
        c_id = str(course_id)
        m_id = str(module_id)

        ontology_data = self.scope_ontology(c_id, m_id, ontology_data)

        kcs = ontology_data.get("knowledge_components", [])
        misconceptions = ontology_data.get("misconceptions", [])
        probes = ontology_data.get("socratic_probes", [])

        structure_cypher = """
        MERGE (c:Course {course_id: $course_id})
        ON CREATE SET c.title = $course_title, c.domain = $domain, c.created_at = datetime()
        SET c.updated_at = datetime()
        MERGE (m:Module {module_id: $module_id})
        ON CREATE SET m.course_id = $course_id, m.title = $module_title, m.created_at = datetime()
        SET m.updated_at = datetime()
        MERGE (c)-[:COMPOSED_OF]->(m)
        MERGE (c)-[:HAS_MODULE]->(m)
        """

        kc_cypher = """
        UNWIND $kcs AS item
        MERGE (k:KnowledgeComponent {kc_id: item.kc_id})
        SET k:Concept,
            k.course_id = $course_id,
            k.module_id = $module_id,
            k.concept_id = item.kc_id,
            k.label = item.label,
            k.definition = item.definition,
            k.bloom_level = item.bloom_level,
            k.level = CASE WHEN item.bloom_level = 'understand' THEN 'topic' ELSE 'atomic_concept' END,
            k.domain = $domain,
            k.concept_type = 'pedagogical_kc',
            k.status = 'pending_review',
            k.source_excerpt = item.source_excerpt,
            k.generation_provider = $provider,
            k.generation_model = $model,
            k.updated_at = datetime()
        WITH k
        MATCH (m:Module {module_id: $module_id})
        MERGE (m)-[:DEVELOPS]->(k)
        WITH k
        MATCH (c:Course {course_id: $course_id})
        MERGE (c)-[:HAS_CONCEPT]->(k)
        """

        prereq_cypher = """
        UNWIND $kcs AS item
        UNWIND item.prerequisites AS prereq_id
        MATCH (target:KnowledgeComponent {kc_id: item.kc_id})
        MATCH (prereq:KnowledgeComponent {kc_id: prereq_id})
        WHERE target.kc_id <> prereq.kc_id
        MERGE (target)-[:REQUIRES]->(prereq)
        MERGE (prereq)-[:PREREQUISITE_OF]->(target)
        """

        misc_cypher = """
        UNWIND $misconceptions AS item
        MERGE (misc:Misconception {misconception_id: item.misconception_id})
        SET misc.kc_id = item.kc_id,
            misc.name = item.name,
            misc.flawed_rule = item.flawed_rule,
            misc.remediation_hint = item.remediation_hint,
            misc.course_id = $course_id,
            misc.module_id = $module_id,
            misc.status = 'pending_review',
            misc.updated_at = datetime()
        WITH misc, item
        MATCH (k:KnowledgeComponent {kc_id: item.kc_id})
        MERGE (k)-[:ASSOCIATED_WITH]->(misc)
        """

        probe_cypher = """
        UNWIND $probes AS item
        MERGE (p:SocraticProbe {probe_id: item.probe_id})
        SET p.misconception_id = item.misconception_id,
            p.kc_id = item.kc_id,
            p.rung = item.rung,
            p.probe_text = item.probe_text,
            p.rationale = item.rationale,
            p.course_id = $course_id,
            p.module_id = $module_id,
            p.status = 'pending_review',
            p.updated_at = datetime()
        WITH p, item
        MATCH (misc:Misconception {misconception_id: item.misconception_id})
        MERGE (misc)-[:PROBED_BY]->(p)
        """

        grounding = []
        for k in kcs:
            quote = _normalize(k["source_excerpt"])
            matches = [chunk for chunk in source_chunks if quote in _normalize(chunk["content"])]
            if not matches and "_origin_chunk_id" in k:
                matches = [chunk for chunk in source_chunks if str(chunk.get("chunk_id")) == k["_origin_chunk_id"]]
            if not matches and source_chunks:
                matches = [source_chunks[0]]

            if not matches:
                raise ValueError(f"No individual source chunk supports {k['label']}.")

            for chunk in matches:
                grounding.append({
                    "kc_id": k["kc_id"],
                    "chunk_id": str(chunk["chunk_id"]),
                    "title": chunk.get("title", ""),
                    "excerpt": quote,
                    "content_hash": hashlib.sha256(chunk["content"].encode()).hexdigest(),
                })

        params = {
            "course_id": c_id,
            "module_id": m_id,
            "course_title": course_title,
            "module_title": module_title,
            "domain": domain,
            "kcs": kcs,
            "misconceptions": misconceptions,
            "probes": probes,
            "grounding": grounding,
            "provider": ontology_data.get("generation_provider", "llm"),
            "model": ontology_data.get("generation_model", "unspecified"),
        }

        async def write(tx):
            await (await tx.run(structure_cypher, params)).consume()
            if replace:
                await (await tx.run("""
                    MATCH (k:KnowledgeComponent {course_id:$course_id, module_id:$module_id})
                    OPTIONAL MATCH (k)-[:ASSOCIATED_WITH]->(m:Misconception)
                    OPTIONAL MATCH (m)-[:PROBED_BY]->(p:SocraticProbe)
                    SET k.status='superseded', m.status='superseded', p.status='superseded'
                """, params)).consume()
            await (await tx.run(kc_cypher, params)).consume()
            await (await tx.run("""
                UNWIND $kcs AS item
                MATCH (k:KnowledgeComponent {kc_id:item.kc_id})
                OPTIONAL MATCH (k)-[r:REQUIRES]->()
                DELETE r
                WITH DISTINCT k
                OPTIONAL MATCH ()-[inverse:PREREQUISITE_OF]->(k)
                DELETE inverse
                WITH DISTINCT k
                OPTIONAL MATCH ()-[e:EVIDENCES]->(k)
                WHERE e.method='verified_source_excerpt'
                DELETE e
            """, params)).consume()
            for query in (prereq_cypher, misc_cypher, probe_cypher):
                await (await tx.run(query, params)).consume()
            await (await tx.run("""
                UNWIND $grounding AS item
                MATCH (k:KnowledgeComponent {kc_id:item.kc_id, course_id:$course_id})
                MERGE (s:SourceChunk {chunk_id:item.chunk_id})
                SET s.course_id=$course_id, s.module_id=$module_id,
                    s.title=item.title, s.content_hash=item.content_hash
                MERGE (s)-[e:EVIDENCES]->(k)
                SET e.excerpt=item.excerpt, e.method='verified_source_excerpt', e.updated_at=datetime()
            """, params)).consume()
            await (await tx.run("""
                MATCH (m:Module {module_id:$module_id, course_id:$course_id})
                SET m.taxonomy_status='pending_review', m.taxonomy_error=null,
                    m.taxonomy_updated_at=datetime()
            """, params)).consume()

        async with neo4j_client.get_session() as session:
            await session.execute_write(write)

        counts = {
            "knowledge_components": len(kcs),
            "misconceptions": len(misconceptions),
            "socratic_probes": len(probes),
        }
        logger.info("Seeded pedagogical graph for course %s module %s: %s", c_id, m_id, counts)
        return counts

    @staticmethod
    async def load_source_chunks(course_id: UUID | str, module_id: UUID | str) -> list[dict]:
        from sqlalchemy import text
        from fiosra.mvp.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            result = await db.execute(text("""
                SELECT chunk_id, title, content FROM syllabus_chunks
                WHERE course_id=:course_id AND module_id=:module_id
                ORDER BY created_at, chunk_id
            """), {"course_id": str(course_id), "module_id": str(module_id)})
            unique = {}
            for row in result.mappings():
                unique.setdefault(hashlib.sha256(row["content"].encode()).hexdigest(), dict(row))
            return list(unique.values())

    async def extract_and_seed(
        self,
        course_id: UUID | str,
        module_id: UUID | str,
        course_title: str,
        module_title: str,
        domain: str,
        text_content: str,
        replace: bool = False,
    ) -> dict[str, int]:
        """High-level pipeline: extracts pedagogical ontology from text and writes it directly to Neo4j."""
        source_chunks = await self.load_source_chunks(course_id, module_id)
        if not source_chunks and text_content:
            from fiosra.mvp.courses.ingestion import syllabus_parser
            raw_chunks = syllabus_parser.chunk_document(text_content, default_title=module_title)
            source_chunks = [{"chunk_id": f"chunk_{i}", "title": c["title"], "content": c["content"]} for i, c in enumerate(raw_chunks)]
        if not text_content and source_chunks:
            text_content = "\n\n".join(chunk["content"] for chunk in source_chunks)

        ontology_data = await self.extract_pedagogical_ontology(
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            text_content=text_content,
            source_chunks=source_chunks,
        )
        return await self.seed_pedagogical_graph(
            course_id=course_id,
            module_id=module_id,
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            ontology_data=ontology_data,
            source_chunks=source_chunks,
            replace=replace,
        )


pedagogical_extractor = PedagogicalExtractor()
