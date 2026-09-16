import pytest
from uuid import uuid4

from fiosra.mvp.graph_service import graph_service
from fiosra.mvp.courses.pedagogical_extractor import pedagogical_extractor
from fiosra.mvp.concepts.service import concept_graph_service
from fiosra.mvp.dialogue_engine import dialogue_engine


@pytest.mark.asyncio
async def test_pedagogical_ontology_extraction_and_seeding():
    """Verify that pedagogical_extractor builds KCs, Misconceptions, and Probes in Neo4j."""
    course_id = f"course_{uuid4().hex[:8]}"
    module_id = f"module_{uuid4().hex[:8]}"

    # 1. Seed Course and Module nodes in Neo4j
    cypher = """
    MERGE (c:Course {course_id: $course_id})
    SET c.title = 'Test Pedagogical Course', c.domain = 'History'
    MERGE (m:Module {module_id: $module_id})
    SET m.title = 'Test Module', m.course_id = $course_id
    MERGE (c)-[:COMPOSED_OF]->(m)
    """
    async with graph_service.client.get_session() as session:
        await session.run(cypher, {"course_id": course_id, "module_id": module_id})

    # 2. Run pedagogical extractor with sample historical text
    sample_text = """
    The Treaty of Allahabad in 1765 marked the beginning of East India Company political rule in India.
    Under Robert Clive, the Mughal Emperor Shah Alam II granted the Diwani rights of Bengal, Bihar, and Orissa
    to the Company. This established the Dual System of government, causing economic disruption and draining wealth.
    """
    result = await pedagogical_extractor.extract_and_seed(
        course_id=course_id,
        course_title="Test Pedagogical Course",
        module_id=module_id,
        module_title="Test Module",
        domain="History",
        text_content=sample_text,
    )

    assert result["knowledge_components"] > 0
    assert result["misconceptions"] > 0
    assert result["socratic_probes"] > 0

    # 3. Verify dual-labeling: KnowledgeComponent is queryable as Concept
    course_graph = await concept_graph_service.get_course_graph(course_id)
    assert len(course_graph["nodes"]) > 0
    assert course_graph["stats"]["misconceptions"] > 0
    assert course_graph["stats"]["socratic_probes"] > 0

    # Verify that edges contain ASSOCIATED_WITH
    assoc_edges = [e for e in course_graph["edges"] if e["relation"] == "ASSOCIATED_WITH"]
    assert len(assoc_edges) > 0


@pytest.mark.asyncio
async def test_student_pedagogical_telemetry_and_probing():
    """Verify student belief tracking, probe delivery, and mastery in Neo4j."""
    student_id = f"student_{uuid4().hex[:8]}"
    session_id = f"session_{uuid4().hex[:8]}"
    misc_id = f"MISC_{uuid4().hex[:8]}"
    kc_id = f"KC_{uuid4().hex[:8]}"
    probe_id = f"probe_{uuid4().hex[:8]}"

    # Seed the test misconception and KC
    cypher = """
    MERGE (k:KnowledgeComponent {kc_id: $kc_id})
    SET k.label = 'Diwani Administration'
    MERGE (m:Misconception {misconception_id: $misc_id})
    SET m.name = 'Trade vs Sovereignty Trap', m.flawed_rule = 'EIC was purely a commercial company'
    MERGE (k)-[:ASSOCIATED_WITH]->(m)
    """
    async with graph_service.client.get_session() as session:
        await session.run(cypher, {"kc_id": kc_id, "misc_id": misc_id})

    # 1. Record student belief (misconception flagged)
    await graph_service.record_student_belief(student_id=student_id, misconception_id=misc_id)

    # Check state
    state = await graph_service.get_student_pedagogical_state(student_id)
    assert any(m["misconception_id"] == misc_id for m in state["active_misconceptions"])
    assert kc_id not in state["mastered_kcs"]

    # 2. Record probe delivery
    await graph_service.record_probe_delivery(session_id=session_id, probe_id=probe_id, student_id=student_id)

    # 3. Record student mastery (resolving the misconception)
    await graph_service.record_student_mastery(
        student_id=student_id,
        kc_id=kc_id,
        cleared_misconception_id=misc_id,
    )

    # Check state after mastery
    updated_state = await graph_service.get_student_pedagogical_state(student_id)
    assert kc_id in updated_state["mastered_kcs"]
    assert not any(m["misconception_id"] == misc_id for m in updated_state["active_misconceptions"])
