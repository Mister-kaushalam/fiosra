"""
Pedagogical Knowledge Extractor for Fiosra.
Directly extracts Knowledge Components, Misconceptions, and Socratic Probes from curriculum materials
and seeds them natively into the Neo4j Pedagogical Knowledge Graph.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any
from uuid import UUID, uuid4

import httpx

from fiosra.mvp.config import settings
from fiosra.mvp.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized[:36] or "item"


class PedagogicalExtractor:
    """
    Extracts educational ontology entities (KnowledgeComponents, Misconceptions, SocraticProbes)
    from course materials and maps them directly into Neo4j.
    """

    @staticmethod
    def _deterministic_pedagogical_plan(
        course_title: str,
        module_title: str,
        domain: str,
        sample_text: str,
    ) -> dict[str, Any]:
        """Fallback rule-based extraction ensuring offline reliability and test stability."""
        slug_mod = _slug(module_title).upper()
        
        kc1_id = f"KC_{slug_mod}_FOUNDATION_{uuid4().hex[:6].upper()}"
        kc2_id = f"KC_{slug_mod}_ANALYSIS_{uuid4().hex[:6].upper()}"
        
        misc1_id = f"MISC_{slug_mod}_001_{uuid4().hex[:6].upper()}"
        misc2_id = f"MISC_{slug_mod}_002_{uuid4().hex[:6].upper()}"

        return {
            "knowledge_components": [
                {
                    "kc_id": kc1_id,
                    "label": f"Foundational Principles of {module_title}",
                    "definition": f"Core chronological and structural concepts grounding {module_title} in {domain}.",
                    "bloom_level": "understand",
                    "domain": domain,
                    "prerequisites": [],
                },
                {
                    "kc_id": kc2_id,
                    "label": f"Source Reasoning & Historical Dialectics in {module_title}",
                    "definition": f"Critical evaluation of evidence, competing interpretations, and causal claims in {module_title}.",
                    "bloom_level": "analyze",
                    "domain": domain,
                    "prerequisites": [kc1_id],
                },
            ],
            "misconceptions": [
                {
                    "misconception_id": misc1_id,
                    "kc_id": kc1_id,
                    "name": f"Monolithic Causation Fallacy in {module_title}",
                    "flawed_rule": f"Attributing complex historical shifts in {module_title} to a single individual or isolated event rather than structural institutional factors.",
                    "remediation_hint": f"Prompt the student to examine economic and administrative structures alongside individual actions in {module_title}.",
                },
                {
                    "misconception_id": misc2_id,
                    "kc_id": kc2_id,
                    "name": f"Presentism & Inscriptional Over-Generalization",
                    "flawed_rule": "Treating a localized primary document or proclamation as proof of universal consensus across the entire subcontinent.",
                    "remediation_hint": "Ask the student to identify the specific geographic and social scope of the primary source before making universal claims.",
                },
            ],
            "socratic_probes": [
                {
                    "probe_id": f"PROBE_{slug_mod}_M1_R0",
                    "misconception_id": misc1_id,
                    "kc_id": kc1_id,
                    "rung": 0,
                    "probe_text": "Look at the institutional context: which economic or administrative factors were at play before this event occurred?",
                    "rationale": "Metacognitive probe prompting the student to reflect on multi-causal context.",
                },
                {
                    "probe_id": f"PROBE_{slug_mod}_M1_R1",
                    "misconception_id": misc1_id,
                    "kc_id": kc1_id,
                    "rung": 1,
                    "probe_text": "Does our course material show that other regional groups or economic interests were acting independently?",
                    "rationale": "Conceptual probe directing attention to diverse historical actors.",
                },
                {
                    "probe_id": f"PROBE_{slug_mod}_M2_R0",
                    "misconception_id": misc2_id,
                    "kc_id": kc2_id,
                    "rung": 0,
                    "probe_text": "Before asserting this as a universal pattern, what does the document state about who wrote it and where it was issued?",
                    "rationale": "Metacognitive check on document provenance and scope.",
                },
                {
                    "probe_id": f"PROBE_{slug_mod}_M2_R1",
                    "misconception_id": misc2_id,
                    "kc_id": kc2_id,
                    "rung": 1,
                    "probe_text": "Contrast this source with records from other regions in that period: do they reflect identical conditions?",
                    "rationale": "Conceptual probe to challenge presentist over-generalization.",
                },
            ],
        }

    async def extract_pedagogical_ontology(
        self,
        course_title: str,
        module_title: str,
        domain: str,
        text_content: str,
    ) -> dict[str, Any]:
        """
        Uses LLM (Ollama / LiteLLM) to extract structured Knowledge Components,
        Misconceptions, and Socratic Probes from source text.
        """
        if settings.FIOSRA_LLM_PROVIDER.strip().lower() == "deterministic":
            return self._deterministic_pedagogical_plan(course_title, module_title, domain, text_content)

        system_prompt = (
            "You are an expert curriculum and cognitive knowledge engineer for an intelligent Socratic tutoring system. "
            "Given curriculum materials, your task is to extract an actionable Pedagogical Knowledge Graph to probe students. "
            "You must extract:\n"
            "1. knowledge_components: 2 to 4 core competencies the student must master.\n"
            "2. misconceptions: 1 to 2 common cognitive traps, flawed mental models, or over-simplifications for each KC.\n"
            "3. socratic_probes: 2 rungs of diagnostic Socratic questions for each misconception (rung 0: metacognitive reflection, rung 1: conceptual challenge).\n"
            "Return ONLY a valid JSON object matching the requested schema. No markdown formatting, no commentary."
        )

        user_prompt = f"""
Course: {course_title}
Module: {module_title}
Domain: {domain}

Curriculum Material Excerpt:
\"\"\"{text_content[:3500]}\"\"\"

Extract the Pedagogical Graph as JSON:
{{
  "knowledge_components": [
    {{
      "kc_id": "KC_...",
      "label": "Short concept title",
      "definition": "Clear conceptual definition",
      "bloom_level": "understand | analyze | evaluate | apply",
      "domain": "{domain}",
      "prerequisites": []
    }}
  ],
  "misconceptions": [
    {{
      "misconception_id": "MISC_...",
      "kc_id": "KC_...",
      "name": "Name of cognitive trap",
      "flawed_rule": "The incorrect reasoning rule the student applies",
      "remediation_hint": "How the tutor guides the student out of this trap"
    }}
  ],
  "socratic_probes": [
    {{
      "probe_id": "PROBE_...",
      "misconception_id": "MISC_...",
      "kc_id": "KC_...",
      "rung": 0,
      "probe_text": "Metacognitive Socratic question",
      "rationale": "Why this probe challenges the misconception"
    }}
  ]
}}
"""

        try:
            ollama_url = f"{settings.OLLAMA_API_BASE}/api/generate"
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(
                    ollama_url,
                    json={
                        "model": settings.OLLAMA_MODEL.replace("ollama/", ""),
                        "system": system_prompt,
                        "prompt": user_prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                if res.status_code == 200:
                    raw_text = res.json().get("response", "")
                    parsed = json.loads(raw_text)
                    if parsed.get("knowledge_components"):
                        return parsed
        except Exception as e:
            logger.warning(f"LLM extraction fallback to deterministic plan: {e}")

        return self._deterministic_pedagogical_plan(course_title, module_title, domain, text_content)

    async def seed_pedagogical_graph(
        self,
        course_id: UUID | str,
        module_id: UUID | str,
        course_title: str,
        module_title: str,
        domain: str,
        ontology_data: dict[str, Any],
    ) -> dict[str, int]:
        """
        Executes native Cypher queries to persist the full pedagogical ontology in Neo4j.
        """
        c_id = str(course_id)
        m_id = str(module_id)

        kcs = ontology_data.get("knowledge_components", [])
        misconceptions = ontology_data.get("misconceptions", [])
        probes = ontology_data.get("socratic_probes", [])

        # 1. Structural Course & Module Nodes
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

        # 2. Knowledge Components (dual labeled as :KnowledgeComponent:Concept for frontend compatibility)
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
            k.status = 'approved',
            k.updated_at = datetime()
        WITH k
        MATCH (m:Module {module_id: $module_id})
        MERGE (m)-[:DEVELOPS]->(k)
        WITH k
        MATCH (c:Course {course_id: $course_id})
        MERGE (c)-[:HAS_CONCEPT]->(k)
        """

        # 3. Prerequisite DAG
        prereq_cypher = """
        UNWIND $kcs AS item
        UNWIND item.prerequisites AS prereq_id
        MATCH (target:KnowledgeComponent {kc_id: item.kc_id})
        MATCH (prereq:KnowledgeComponent {kc_id: prereq_id})
        WHERE target.kc_id <> prereq.kc_id
        MERGE (target)-[:REQUIRES]->(prereq)
        MERGE (prereq)-[:PREREQUISITE_OF]->(target)
        """

        # 4. Misconceptions
        misc_cypher = """
        UNWIND $misconceptions AS item
        MERGE (misc:Misconception {misconception_id: item.misconception_id})
        SET misc.kc_id = item.kc_id,
            misc.name = item.name,
            misc.flawed_rule = item.flawed_rule,
            misc.remediation_hint = item.remediation_hint,
            misc.course_id = $course_id,
            misc.updated_at = datetime()
        WITH misc, item
        MATCH (k:KnowledgeComponent {kc_id: item.kc_id})
        MERGE (k)-[:ASSOCIATED_WITH]->(misc)
        """

        # 5. Socratic Probes
        probe_cypher = """
        UNWIND $probes AS item
        MERGE (p:SocraticProbe {probe_id: item.probe_id})
        SET p.misconception_id = item.misconception_id,
            p.kc_id = item.kc_id,
            p.rung = item.rung,
            p.probe_text = item.probe_text,
            p.rationale = item.rationale,
            p.course_id = $course_id,
            p.updated_at = datetime()
        WITH p, item
        MATCH (misc:Misconception {misconception_id: item.misconception_id})
        MERGE (misc)-[:PROBED_BY]->(p)
        """

        async with neo4j_client.get_session() as session:
            await session.run(
                structure_cypher,
                {
                    "course_id": c_id,
                    "module_id": m_id,
                    "course_title": course_title,
                    "module_title": module_title,
                    "domain": domain,
                },
            )
            if kcs:
                await session.run(kc_cypher, {"kcs": kcs, "course_id": c_id, "module_id": m_id, "domain": domain})
                await session.run(prereq_cypher, {"kcs": kcs})
            if misconceptions:
                await session.run(misc_cypher, {"misconceptions": misconceptions, "course_id": c_id})
            if probes:
                await session.run(probe_cypher, {"probes": probes, "course_id": c_id})

        counts = {
            "knowledge_components": len(kcs),
            "misconceptions": len(misconceptions),
            "socratic_probes": len(probes),
        }
        logger.info(f"Seeded pedagogical graph for course {c_id} module {m_id}: {counts}")
        return counts

    async def extract_and_seed(
        self,
        course_id: UUID | str,
        module_id: UUID | str,
        course_title: str,
        module_title: str,
        domain: str,
        text_content: str,
    ) -> dict[str, int]:
        """High-level pipeline: extracts pedagogical ontology from text and writes it directly to Neo4j."""
        ontology_data = await self.extract_pedagogical_ontology(
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            text_content=text_content,
        )
        return await self.seed_pedagogical_graph(
            course_id=course_id,
            module_id=module_id,
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            ontology_data=ontology_data,
        )


pedagogical_extractor = PedagogicalExtractor()
