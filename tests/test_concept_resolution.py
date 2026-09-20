import unittest
from pydantic import BaseModel

from fiosra.mvp.concepts.resolution import CompletenessChecker, ConceptEntityResolver, compute_embedding, cosine_similarity
from fiosra.mvp.concepts.schemas import (
    CompletenessStats,
    ConceptGraphProposal,
    ConceptProposalNode,
    MisconceptionProposal,
    PrerequisiteProposal,
    SocraticProbeProposal,
)


class MockModule(BaseModel):
    module_id: str
    position: int
    title: str
    description: str | None = None
    learning_objectives: list[str] = []


class MockCourse(BaseModel):
    course_id: str
    title: str
    domain: str
    syllabus_context: str | None = None
    modules: list[MockModule] = []


def test_cosine_similarity_computation():
    vec_a = compute_embedding("Feudal agrarian and manorial production")
    vec_b = compute_embedding("Feudal agrarian and manorial production")
    vec_c = compute_embedding("Quantum electrodynamics in subatomic physics")

    sim_identical = cosine_similarity(vec_a, vec_b)
    sim_different = cosine_similarity(vec_a, vec_c)

    assert sim_identical > 0.99
    assert sim_different < sim_identical


def test_entity_resolver_clusters_and_merges_synonyms():
    probe = SocraticProbeProposal(
        rung=0,
        probe_text="What primary evidence shows feudal estate mechanics?",
        rationale="Exposing baseline assumptions.",
    )
    misc = MisconceptionProposal(
        name="Monolithic Feudalism Fallacy",
        flawed_rule="Assuming all European feudal systems operated under identical legal rules.",
        remediation_hint="Review distinct regional charters across Normandy and Saxony.",
        probes=[probe],
    )

    node1 = ConceptProposalNode(
        proposal_id="c1",
        label="Medieval European Studies",
        definition="The overarching study of medieval socio-political and economic structures.",
        level="course_theme",
        module_positions=[1],
    )
    node2 = ConceptProposalNode(
        proposal_id="c2",
        label="Feudal Agrarian Economy",
        definition="The manorial system of agricultural production and peasant labor obligations in medieval Europe.",
        level="topic",
        parent_proposal_id="c1",
        module_positions=[1],
        misconceptions=[misc],
    )
    # Duplicate concept with slightly varied label and definition
    node3 = ConceptProposalNode(
        proposal_id="c3",
        label="Feudal Agrarian Economy & Manorial Labor",
        definition="The manorial system of agricultural production and peasant labor obligations in medieval Europe.",
        level="topic",
        parent_proposal_id="c1",
        module_positions=[2],
    )
    node4 = ConceptProposalNode(
        proposal_id="c4",
        label="Urban Guild Regulations",
        definition="Craft guild monopolies, apprentice hierarchy, and urban commercial privileges.",
        level="topic",
        parent_proposal_id="c1",
        module_positions=[2],
    )

    prereq = PrerequisiteProposal(
        prerequisite_proposal_id="c2",
        dependent_proposal_id="c4",
        rationale="Agricultural surplus required for urban craft expansion.",
    )
    # Prerequisite referring to the duplicate node c3
    prereq_dup = PrerequisiteProposal(
        prerequisite_proposal_id="c3",
        dependent_proposal_id="c4",
        rationale="Labor surplus foundation.",
    )

    proposal = ConceptGraphProposal(
        course_rationale="Pedagogical structure of medieval economic systems.",
        concepts=[node1, node2, node3, node4],
        prerequisites=[prereq, prereq_dup],
    )

    resolver = ConceptEntityResolver(similarity_threshold=0.80)
    resolved, id_remap = resolver.resolve_proposal(proposal)

    # c2 and c3 should have been merged
    assert len(resolved.concepts) == 3
    concept_labels = [c.label for c in resolved.concepts]
    assert "Medieval European Studies" in concept_labels
    assert "Urban Guild Regulations" in concept_labels

    # Check merged node properties
    merged_node = next(c for c in resolved.concepts if "Feudal Agrarian" in c.label)
    assert set(merged_node.module_positions) == {1, 2}
    assert len(merged_node.misconceptions) >= 1
    assert any("Monolithic Feudalism" in m.name for m in merged_node.misconceptions)

    # Check that ID remap accurately redirected c3 to c2 (or canonical ID)
    canonical_id = id_remap["c3"]
    assert canonical_id in [c.proposal_id for c in resolved.concepts]

    # Check that prerequisite links were deduplicated and remapped
    assert len(resolved.prerequisites) == 1
    assert resolved.prerequisites[0].prerequisite_proposal_id == canonical_id
    assert resolved.prerequisites[0].dependent_proposal_id == "c4"


def test_completeness_checker_evaluates_coverage():
    course = MockCourse(
        course_id="course-123",
        title="Medieval History",
        domain="History",
        syllabus_context="Comprehensive medieval curriculum.",
        modules=[
            MockModule(
                module_id="mod-1",
                position=1,
                title="Early Middle Ages",
                learning_objectives=["Analyze manorial agriculture", "Evaluate monastic scriptoria"],
            ),
            MockModule(
                module_id="mod-2",
                position=2,
                title="High Middle Ages",
                learning_objectives=["Understand urban guilds and charter expansion"],
            ),
        ],
    )

    proposal = ConceptGraphProposal(
        course_rationale="Curriculum proposal.",
        concepts=[
            ConceptProposalNode(
                proposal_id="c1",
                label="Medieval History",
                definition="Civilizational trajectories of medieval Europe.",
                level="course_theme",
                module_positions=[1, 2],
            ),
            ConceptProposalNode(
                proposal_id="c2",
                label="Manorial Agriculture and Peasantry",
                definition="Analyze manorial agriculture and agrarian production systems.",
                level="topic",
                parent_proposal_id="c1",
                module_positions=[1],
            ),
            ConceptProposalNode(
                proposal_id="c3",
                label="Monastic Scriptoria and Knowledge Preservation",
                definition="Evaluate monastic scriptoria role in preserving classical manuscripts.",
                level="topic",
                parent_proposal_id="c1",
                module_positions=[1],
            ),
            ConceptProposalNode(
                proposal_id="c4",
                label="Urban Guilds and Commercial Charters",
                definition="Understand urban guilds and charter expansion in medieval burghs.",
                level="topic",
                parent_proposal_id="c1",
                module_positions=[2],
            ),
        ],
        prerequisites=[
            PrerequisiteProposal(
                prerequisite_proposal_id="c2",
                dependent_proposal_id="c4",
                rationale="Agrarian baseline required before urban expansion.",
            )
        ],
    )

    chunks = [
        {"chunk_id": "chk-1", "title": "Manorial Records", "content": "Manorial agriculture and peasant labor obligations in agrarian production."},
        {"chunk_id": "chk-2", "title": "Scriptorium Codex", "content": "Monastic scriptoria and manuscript copying and classical texts preservation."},
        {"chunk_id": "chk-3", "title": "Guild Charter", "content": "Urban craft guilds and mercantile charters in medieval burghs."},
    ]

    stats = CompletenessChecker.evaluate_completeness(
        course=course,
        proposal=proposal,
        syllabus_chunks=chunks,
    )

    assert stats.module_coverage_pct == 100.0
    assert stats.objective_coverage_pct == 100.0
    assert stats.evidence_recall_pct == 100.0
    assert stats.is_complete is True
    assert len(stats.unmapped_chunk_ids) == 0
