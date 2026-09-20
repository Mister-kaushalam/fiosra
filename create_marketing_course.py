"""End-to-end Course Creation & Knowledge Graph Hydration for Principles of Marketing."""

import asyncio
import json
import logging
import sys
import uuid
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from fiosra.mvp.concepts.schemas import ConceptGraphProposal
from fiosra.mvp.concepts.service import ConceptGraphService, _slug
from fiosra.mvp.courses.models import Course, Module, SyllabusChunk
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.neo4j_client import neo4j_client
from fiosra.mvp.storage import document_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def get_pdf_path() -> Path:
    candidates = [
        Path("/app/BUS_C150_Principles_of_Marketing.pdf"),
        Path("BUS_C150_Principles_of_Marketing.pdf"),
        Path("/Users/anupamasadanandan/Downloads/BUS C150 Principles of Marketing.pdf"),
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]
JSON_SOURCE = Path("principles_of_marketing_knowledge_graph.json")

MODULE_DEFS = [
    {
        "position": 1,
        "title": "Marketing Foundations and Strategy",
        "description": "Chapters 1–2: Value creation, the marketing process and environment, customer relationships, strategic planning, portfolios, marketing plans, performance metrics, and ethics.",
        "learning_objectives": [
            "Define marketing and trace its core value exchange process",
            "Analyze macro and micro environmental forces impacting marketing decisions",
            "Evaluate strategic planning frameworks (BCG Matrix, Ansoff Grid, SWOT)",
            "Develop ethical and socially responsible marketing strategies",
        ],
    },
    {
        "position": 2,
        "title": "Markets, Buyer Behavior, Research, and Diversity",
        "description": "Chapters 3–8: Consumer and organizational decisions, segmentation, targeting and positioning, research and intelligence, global markets, diversity and inclusion.",
        "learning_objectives": [
            "Deconstruct consumer decision journeys and B2B organizational buying centers",
            "Apply segmentation bases to select viable target markets and construct perceptual positioning maps",
            "Design marketing research methodologies using primary and secondary data",
            "Formulate international market entry strategies and culturally responsive marketing practices",
        ],
    },
    {
        "position": 3,
        "title": "Products, Innovation, Services, and Pricing",
        "description": "Chapters 9–12: Offerings and brands, product life cycles, innovation and adoption, services and quality, costs, demand, and pricing decisions.",
        "learning_objectives": [
            "Manage product layers, brand equity, and new product development stages",
            "Formulate life-cycle strategies and bridge diffusion of innovation chasms",
            "Address unique service characteristics (intangibility, inseparability, variability, perishability)",
            "Determine profit-maximizing prices balancing price elasticity, cost structures, and competitive dynamics",
        ],
    },
    {
        "position": 4,
        "title": "Integrated Marketing Communications and Selling",
        "description": "Chapters 13–16: Integrated marketing communications, advertising, public relations, digital and social media marketing, direct marketing, and personal selling.",
        "learning_objectives": [
            "Synthesize omnichannel promotional mixes aligning with customer journey touchpoints",
            "Evaluate digital advertising, social media engagement metrics, and SEO/SEM performance",
            "Implement consultative and relationship selling processes",
            "Design public relations and crisis communication frameworks",
        ],
    },
    {
        "position": 5,
        "title": "Distribution, Retailing, and Sustainable Marketing",
        "description": "Chapters 17–19: Marketing channels, supply chain logistics, retailing, wholesaling, and sustainable societal marketing.",
        "learning_objectives": [
            "Structure multi-tier marketing channels and resolve vertical/horizontal channel conflicts",
            "Optimize supply chain physical distribution, warehousing, and inventory management",
            "Analyze retail omni-channel formats, merchandising, and store positioning",
            "Implement circular economy, ethical supply chain, and sustainable marketing practices",
        ],
    },
]


async def create_course_and_modules(proposal: ConceptGraphProposal) -> Course:
    async with AsyncSessionLocal() as session:
        # Check if course exists
        res = await session.execute(
            select(Course)
            .options(selectinload(Course.modules))
            .where(Course.title == "BUS C150 Principles of Marketing")
        )
        course = res.scalar_one_or_none()

        if not course:
            course = Course(
                course_id=uuid.uuid4(),
                title="BUS C150 Principles of Marketing",
                domain="Marketing and Business",
                created_by="prof_somerville",
                syllabus_context=proposal.course_rationale,
            )
            session.add(course)
            await session.flush()
            logger.info(f"Created Course: {course.title} (ID: {course.course_id})")
        else:
            logger.info(f"Found existing Course: {course.title} (ID: {course.course_id})")

        # Create modules if missing
        mods_res = await session.execute(
            select(Module).where(Module.course_id == course.course_id)
        )
        existing_mods = mods_res.scalars().all()
        existing_positions = {m.position: m for m in existing_mods}
        for m_def in MODULE_DEFS:
            if m_def["position"] not in existing_positions:
                mod = Module(
                    module_id=uuid.uuid4(),
                    course_id=course.course_id,
                    title=m_def["title"],
                    description=m_def["description"],
                    learning_objectives=m_def["learning_objectives"],
                    position=m_def["position"],
                )
                session.add(mod)
                logger.info(f"Added Module {mod.position}: {mod.title}")

        await session.commit()

        # Re-fetch course with refreshed modules
        res = await session.execute(
            select(Course)
            .options(selectinload(Course.modules))
            .where(Course.course_id == course.course_id)
        )
        course = res.scalar_one()
        return course


async def ingest_pdf_document(course: Course, pdf_path: Path) -> uuid.UUID | None:
    if not pdf_path.exists():
        logger.warning(f"PDF file not found at {pdf_path}. Skipping PDF attachment.")
        return None

    content = pdf_path.read_bytes()
    doc_id = uuid.uuid4()
    rel_path, file_size = document_storage.save_document(
        course_id=course.course_id,
        document_id=doc_id,
        filename=pdf_path.name,
        content=content,
    )
    logger.info(f"Saved PDF to document storage: {rel_path} ({file_size / (1024*1024):.1f} MB)")

    async with AsyncSessionLocal() as session:
        # Check if document already registered
        res = await session.execute(
            text("SELECT document_id FROM course_documents WHERE course_id = :cid AND filename = :fn"),
            {"cid": str(course.course_id), "fn": pdf_path.name},
        )
        row = res.mappings().first()
        if row:
            logger.info(f"Course document already registered in DB (ID: {row['document_id']})")
            return row["document_id"]

        await session.execute(
            text("""
                INSERT INTO course_documents (
                    document_id, course_id, title, filename, file_path, file_size,
                    mime_type, resource_type, source_url, created_at
                ) VALUES (
                    :document_id, :course_id, :title, :filename, :file_path, :file_size,
                    :mime_type, :resource_type, :source_url, NOW()
                )
            """),
            {
                "document_id": doc_id,
                "course_id": str(course.course_id),
                "title": "OpenStax Principles of Marketing (2023 Edition)",
                "filename": pdf_path.name,
                "file_path": rel_path,
                "file_size": file_size,
                "mime_type": "application/pdf",
                "resource_type": "pdf",
                "source_url": "https://openstax.org/details/books/principles-marketing",
            },
        )
        await session.commit()
        logger.info(f"Registered CourseDocument in database: {doc_id}")
        return doc_id


async def batch_hydrate_neo4j(course: Course, proposal: ConceptGraphProposal) -> None:
    svc = ConceptGraphService()
    await svc.sync_course_structure(course)
    logger.info("✓ Course and Module structure synced to Neo4j")

    course_id_str = str(course.course_id)
    module_pos_to_id = {m.position: str(m.module_id) for m in course.modules}

    # 1. Prepare Concept rows
    concept_rows = []
    parent_edges = []
    module_edges = []
    misc_rows = []
    probe_rows = []

    concept_id_map: dict[str, str] = {}
    for c in proposal.concepts:
        # Stable deterministic ID per concept proposal
        c_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{course_id_str}:{c.proposal_id}"))
        concept_id_map[c.proposal_id] = c_uuid

        concept_rows.append({
            "concept_id": c_uuid,
            "course_id": course_id_str,
            "canonical_key": _slug(c.label),
            "label": c.label,
            "definition": c.definition,
            "concept_type": c.concept_type,
            "level": c.level,
            "bloom_level": c.bloom_level,
            "status": "approved",
        })

        if c.parent_proposal_id:
            parent_edges.append({
                "parent_id": c.parent_proposal_id,
                "child_id": c.proposal_id,
            })

        for pos in c.module_positions:
            if pos in module_pos_to_id:
                module_edges.append({
                    "module_id": module_pos_to_id[pos],
                    "concept_id": c_uuid,
                    "role": c.module_role,
                })

        for misc in c.misconceptions:
            m_slug = _slug(misc.name).upper()
            m_id = f"MISC_{m_slug}_{uuid.uuid4().hex[:6].upper()}"
            misc_rows.append({
                "concept_id": c_uuid,
                "course_id": course_id_str,
                "misconception_id": m_id,
                "name": misc.name,
                "flawed_rule": misc.flawed_rule,
                "remediation_hint": misc.remediation_hint,
            })

            for probe in misc.probes:
                p_id = f"PROBE_{uuid.uuid4().hex[:8].upper()}"
                probe_rows.append({
                    "misconception_id": m_id,
                    "course_id": course_id_str,
                    "probe_id": p_id,
                    "probe_text": probe.probe_text,
                    "rung": probe.rung,
                    "rationale": probe.rationale,
                })

    prereq_edges = []
    for p in proposal.prerequisites:
        if p.prerequisite_proposal_id in concept_id_map and p.dependent_proposal_id in concept_id_map:
            prereq_edges.append({
                "source_id": concept_id_map[p.prerequisite_proposal_id],
                "target_id": concept_id_map[p.dependent_proposal_id],
                "rationale": p.rationale,
            })

    resolved_parent_edges = [
        {"parent_id": concept_id_map[e["parent_id"]], "child_id": concept_id_map[e["child_id"]]}
        for e in parent_edges
        if e["parent_id"] in concept_id_map and e["child_id"] in concept_id_map
    ]

    logger.info(f"Prepared batch data:")
    logger.info(f"  Concepts:        {len(concept_rows)}")
    logger.info(f"  Parent edges:    {len(resolved_parent_edges)}")
    logger.info(f"  Module links:    {len(module_edges)}")
    logger.info(f"  Prerequisites:   {len(prereq_edges)}")
    logger.info(f"  Misconceptions:  {len(misc_rows)}")
    logger.info(f"  Socratic Probes: {len(probe_rows)}")

    # 2. Insert Concepts in Batches of 500
    batch_size = 500
    logger.info("Ingesting Concepts into Neo4j...")
    async with neo4j_client.get_session() as session:
        for i in range(0, len(concept_rows), batch_size):
            chunk = concept_rows[i:i + batch_size]
            await session.run("""
                UNWIND $batch AS c
                MERGE (n:Concept {concept_id: c.concept_id, course_id: c.course_id})
                SET n:KnowledgeComponent,
                    n.kc_id = c.concept_id,
                    n.canonical_key = c.canonical_key,
                    n.label = c.label,
                    n.definition = c.definition,
                    n.concept_type = c.concept_type,
                    n.level = c.level,
                    n.bloom_level = c.bloom_level,
                    n.status = c.status,
                    n.updated_at = datetime()
                WITH n, c
                MATCH (course:Course {course_id: c.course_id})
                MERGE (course)-[:HAS_CONCEPT]->(n)
            """, {"batch": chunk})
            logger.info(f"  Inserted concepts {i + 1} to {min(i + batch_size, len(concept_rows))}")

        # 3. Insert Parent-Child CONTAINS Edges
        logger.info("Ingesting CONTAINS hierarchy edges...")
        for i in range(0, len(resolved_parent_edges), batch_size):
            chunk = resolved_parent_edges[i:i + batch_size]
            await session.run("""
                UNWIND $batch AS edge
                MATCH (p:Concept {concept_id: edge.parent_id})
                MATCH (c:Concept {concept_id: edge.child_id})
                MERGE (p)-[:CONTAINS]->(c)
            """, {"batch": chunk})

        # 4. Insert Module Links
        logger.info("Ingesting Module links...")
        for i in range(0, len(module_edges), batch_size):
            chunk = module_edges[i:i + batch_size]
            await session.run("""
                UNWIND $batch AS link
                MATCH (m:Module {module_id: link.module_id})
                MATCH (c:Concept {concept_id: link.concept_id})
                MERGE (m)-[:INTRODUCES]->(c)
            """, {"batch": chunk})

        # 5. Insert Prerequisite Edges
        logger.info("Ingesting Prerequisite edges...")
        if prereq_edges:
            await session.run("""
                UNWIND $batch AS p
                MATCH (src:Concept {concept_id: p.source_id})
                MATCH (tgt:Concept {concept_id: p.target_id})
                MERGE (src)-[r:PREREQUISITE_OF]->(tgt)
                SET r.rationale = p.rationale
            """, {"batch": prereq_edges})

        # 6. Insert Misconceptions
        logger.info("Ingesting Misconceptions...")
        for i in range(0, len(misc_rows), batch_size):
            chunk = misc_rows[i:i + batch_size]
            await session.run("""
                UNWIND $batch AS m
                MATCH (k:Concept {concept_id: m.concept_id, course_id: m.course_id})
                MERGE (misc:Misconception {course_id: m.course_id, flawed_rule: m.flawed_rule})
                ON CREATE SET misc.misconception_id = m.misconception_id,
                    misc.kc_id = k.kc_id,
                    misc.name = m.name,
                    misc.remediation_hint = m.remediation_hint,
                    misc.status = 'approved',
                    misc.created_at = datetime(),
                    misc.updated_at = datetime()
                ON MATCH SET misc.name = m.name,
                    misc.remediation_hint = m.remediation_hint,
                    misc.updated_at = datetime()
                MERGE (k)-[:ASSOCIATED_WITH]->(misc)
            """, {"batch": chunk})

        # 7. Insert Socratic Probes
        logger.info("Ingesting Socratic Probes...")
        for i in range(0, len(probe_rows), batch_size):
            chunk = probe_rows[i:i + batch_size]
            await session.run("""
                UNWIND $batch AS p
                MATCH (misc:Misconception {misconception_id: p.misconception_id, course_id: p.course_id})
                MERGE (probe:SocraticProbe {course_id: p.course_id, probe_text: p.probe_text})
                ON CREATE SET probe.probe_id = p.probe_id,
                    probe.misconception_id = p.misconception_id,
                    probe.rung = p.rung,
                    probe.rationale = p.rationale,
                    probe.status = 'approved',
                    probe.created_at = datetime()
                ON MATCH SET probe.rung = p.rung,
                    probe.rationale = p.rationale
                MERGE (misc)-[:PROBED_BY]->(probe)
            """, {"batch": chunk})

    # Summary Stats
    summary = await svc.get_course_graph(course_id_str)
    print("\n" + "=" * 60)
    print("🎉 KNOWLEDGE GRAPH HYDRATION COMPLETE!")
    print("=" * 60)
    print(f"Course:       {course.title}")
    print(f"Course ID:    {course.course_id}")
    print(f"Domain:       {course.domain}")
    print(f"Total Nodes:  {len(summary.get('nodes', []))}")
    print(f"Total Edges:  {len(summary.get('edges', []))}")
    print(f"Total Probes: {len(summary.get('probes', []))}")
    print(f"UI Graph URL: http://localhost:8080/ui/#/knowledge-graph?course_id={course.course_id}")
    print("=" * 60 + "\n")


async def main() -> None:
    logger.info("Loading knowledge_graph_ir.json...")
    ir_data = json.loads(JSON_SOURCE.read_text(encoding="utf-8"))
    proposal = ConceptGraphProposal.model_validate(ir_data)
    logger.info(f"Validated IR: {len(proposal.concepts)} concepts, {len(proposal.prerequisites)} prerequisites")

    # 1. PostgreSQL Course & Modules
    course = await create_course_and_modules(proposal)

    # 2. Ingest PDF Document
    pdf_file = get_pdf_path()
    await ingest_pdf_document(course, pdf_file)

    # 3. Hydrate Neo4j Knowledge Graph
    await batch_hydrate_neo4j(course, proposal)


if __name__ == "__main__":
    asyncio.run(main())
