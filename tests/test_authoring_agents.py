import pytest
from httpx import ASGITransport, AsyncClient

from fiosra.mvp.authoring.schemas import (
    AssignmentDraftRequest,
    AssignmentDraftRevisionRequest,
    CourseDraftRequest,
    CourseDraftRevisionRequest,
    CourseDraftSpec,
    DraftAssignmentMilestoneSpec,
    DraftModuleSpec,
    PublishCourseDraftRequest,
)
from fiosra.mvp.authoring.service import (
    _extract_json_block,
    assignment_authoring_service,
    course_authoring_service,
)
from fiosra.mvp.main import app


def test_extract_json_block_parses_nested_fenced_payload():
    response = '''```json
    {"draft": {"title": "Nested Draft", "modules": [{"title": "Unit 1"}]}}
    ```'''

    assert _extract_json_block(response) == {
        "draft": {"title": "Nested Draft", "modules": [{"title": "Unit 1"}]}
    }


@pytest.mark.asyncio
async def test_course_draft_synthesis_and_revision():
    # 1. Synthesize course draft
    req = CourseDraftRequest(
        materials_text="""
        Course: Early Modern Maritime Commerce (1600-1750)
        Topics:
        - Week 1: Atlantic Trade Networks and Merchant Guilds
        - Week 2: Joint Stock Companies and Navigational Technologies
        - Week 3: Imperial Tariffs, Smuggling, and Colonial Governance
        Readings:
        - Navigation Acts of 1651
        - East India Company Charters
        """,
        title_hint="Early Modern Maritime Commerce",
        domain="History",
    )
    draft = await course_authoring_service.generate_course_draft(req)
    assert draft.title != ""
    assert len(draft.modules) >= 2
    assert draft.domain == "History"
    assert len(draft.modules[0].learning_objectives) >= 1

    # 2. Revise course draft with feedback
    rev_req = CourseDraftRevisionRequest(
        current_draft=draft,
        review_comments="Add module 4 focusing specifically on Maritime Insurance and Lloyd's Coffee House.",
        conversation_history=[{"role": "user", "content": "Initial draft generated"}],
    )
    revision_resp = await course_authoring_service.revise_course_draft(rev_req)
    assert revision_resp.revised_draft is not None
    assert revision_resp.changes_summary != ""
    assert len(revision_resp.revised_draft.modules) >= len(draft.modules)


@pytest.mark.asyncio
async def test_course_draft_publishing_flow():
    draft = CourseDraftSpec(
        title="Historiography of the Industrial Revolution",
        domain="History",
        overview="Critical inquiry into energy transitions, labor conditions, and institutional dynamics.",
        target_audience="Undergraduate",
        modules=[
            DraftModuleSpec(
                title="Module 1: Steam Power and Enclosure",
                description="Analysis of demographic shifts and technological adoption.",
                learning_objectives=["Critique agrarian enclosure narratives", "Examine caloric energy balance"],
                position=1,
                knowledge_components=["KC_HIST_ENCLOSURE", "KC_HIST_STEAM"],
                suggested_assignments=[
                    DraftAssignmentMilestoneSpec(
                        title="Enclosure Records Analysis",
                        description="Examine parliamentary enclosure petitions.",
                        primary_sources=["Parliamentary Enclosure Act of 1773"],
                    )
                ],
            )
        ],
    )

    publish_req = PublishCourseDraftRequest(
        draft=draft,
        author_id="prof_somerville_author",
    )
    published_course = await course_authoring_service.publish_course_draft(publish_req)
    assert published_course.course_id is not None
    assert published_course.title == "Historiography of the Industrial Revolution"
    assert len(published_course.modules) == 1
    assert published_course.modules[0].title == "Module 1: Steam Power and Enclosure"


@pytest.mark.asyncio
async def test_assignment_draft_synthesis_revision_and_publish():
    # 1. Synthesize assignment draft
    req = AssignmentDraftRequest(
        task_topic="The Causes of the 1789 French Fiscal Collapse",
        domain="History",
    )
    draft = await assignment_authoring_service.generate_assignment_draft(req)
    assert draft.title != ""
    assert len(draft.hint_ladder) == 3
    assert draft.hint_ladder[0].rung == 1
    assert draft.hint_ladder[1].rung == 2
    assert draft.hint_ladder[2].rung == 3
    assert len(draft.cognitive_traps) >= 1

    # 2. Revise assignment draft
    rev_req = AssignmentDraftRevisionRequest(
        current_draft=draft,
        review_comments="Make the first hint emphasize Calonne's Assembly of Notables rather than general debt.",
    )
    rev_resp = await assignment_authoring_service.revise_assignment_draft(rev_req)
    assert rev_resp.revised_draft is not None
    assert rev_resp.changes_summary != ""

    # 3. Publish course and assignment through HTTP API
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Publish a course first
        c_res = await ac.post(
            "/authoring/courses/publish",
            json={
                "draft": {
                    "title": "French Revolution Seminar",
                    "domain": "History",
                    "overview": "In-depth seminar on 1789-1799.",
                    "target_audience": "Advanced",
                    "modules": [
                        {
                            "title": "Module 1: Fiscal Origins",
                            "description": "Examine structural debt.",
                            "learning_objectives": ["Identify fiscal deficits"],
                            "position": 1,
                            "knowledge_components": ["KC_HIST_FRENCH_DEBT"],
                            "suggested_assignments": [],
                            "change_status": "unchanged",
                        }
                    ],
                },
                "author_id": "prof_educator",
            },
        )
        assert c_res.status_code == 201
        course_data = c_res.json()
        module_id = course_data["modules"][0]["module_id"]
        course_id = course_data["course_id"]

        proposal_res = await ac.post(
            "/authoring/assignments/propose",
            json={
                "task_topic": "Source-grounded inquiry into fiscal deficits",
                "course_id": course_id,
                "module_id": module_id,
                "domain": "History",
                "pedagogical_focus": "Develop a coherent explanation from the selected course materials.",
            },
        )
        assert proposal_res.status_code == 200
        proposal = proposal_res.json()
        assert proposal["draft"]["title"]
        assert proposal["scaffold"]["clarified_prompt"]
        assert len(proposal["scaffold"]["hint_ladder"]) >= 3
        assert len(proposal["scaffold"]["rubric_rules"]) >= 3

        # Publish assignment to that module
        a_res = await ac.post(
            "/authoring/assignments/publish",
            json={
                "course_id": course_id,
                "module_id": module_id,
                "draft": rev_resp.revised_draft.model_dump(),
                "author_id": "prof_educator",
            },
        )
        assert a_res.status_code == 201
        assign_data = a_res.json()
        assert assign_data["assignment_id"] is not None
        assert assign_data["status"] == "published"

        # 4. Test dedicated topic-grounded rubric synthesis endpoint
        rubric_res = await ac.post(
            "/authoring/assignments/synthesize-rubric",
            json={
                "title": "Inquiry: Regional Dynasties and Temple Architectural Legitimacy",
                "prompt": "Analyze how Brihadisvara and Hampi temple architecture reflected changing religious and political power structures.",
                "deliverable": "Source-grounded analytical essay (750–1000 words)",
                "scope": "Medieval South India (9th to 16th centuries)",
                "domain": "History",
                "course_id": course_id,
                "module_id": module_id,
                "sources": [
                    {"title": "History_of_India.pdf", "citation": "Chola Inscriptions & Temple Epigraphy"},
                ],
                "learning_goals": ["Explain the institutional mechanisms of royal temple patronage."],
            },
        )
        assert rubric_res.status_code == 200
        rubric_data = rubric_res.json()
        assert "public_rubric" in rubric_data
        criteria = rubric_data["public_rubric"]
        assert len(criteria) == 3
        # Weights must sum to 100
        assert sum(c["weight"] for c in criteria) == 100.0
        # Check that each criterion has 3 distinct levels
        for crit in criteria:
            assert len(crit["levels"]) == 3
            level_ids = [lvl["level_id"] for lvl in crit["levels"]]
            assert "developing" in level_ids
            assert "secure" in level_ids
            assert "strong" in level_ids
            # Level descriptions must not be empty and must be topic-aware
            for lvl in crit["levels"]:
                assert len(lvl["description"]) > 10
            assert crit["self_review_prompt"] is not None
