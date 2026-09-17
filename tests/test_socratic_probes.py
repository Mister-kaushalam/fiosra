import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from fiosra.mvp.config import settings
from fiosra.mvp.llm.orchestrator import GenerationMetadata, GuardedGeneration, llm_orchestrator
from fiosra.mvp.main import app
from fiosra.mvp.socratic_probe_service import socratic_probe_service
from tests.test_learning_canvas import create_published_grounded_assignment
from tests.test_learning_documents import paragraph_block


async def create_document_session(client: AsyncClient) -> tuple[dict, dict, dict]:
    assignment, _source_chunk_id = await create_published_grounded_assignment(client)
    session_response = await client.post(
        "/events/session",
        json={
            "student_id": f"probe_student_{uuid.uuid4().hex[:8]}",
            "assignment_id": assignment["assignment_id"],
            "current_question_id": assignment["question_id"],
        },
    )
    session = session_response.json()
    headers = {"X-Fiosra-Session-Token": session["access_token"]}
    document_response = await client.get(
        f"/learning-documents/sessions/{session['session_id']}", headers=headers
    )
    assert document_response.status_code == 200
    return assignment, session, document_response.json()


async def save_meaningful_paragraph(
    client: AsyncClient,
    session: dict,
    document: dict,
    headers: dict[str, str],
    suffix: str = "",
) -> tuple[dict, dict]:
    prose = (
        "The drainage channels indicate deliberate coordination across connected homes because "
        "their repeated alignment requires shared construction decisions, although the surviving "
        "evidence does not identify which institution organized the labour. "
        f"{suffix}"
    )
    paragraph = next(
        (block for block in document["blocks"] if block["block_type"] == "paragraph"),
        None,
    )
    changed = paragraph_block(
        paragraph["block_id"] if paragraph else str(uuid.uuid4()),
        paragraph["position"] if paragraph else 1,
        prose,
        paragraph["section_id"] if paragraph else "page_1",
    )
    saved_response = await client.put(
        f"/learning-documents/sessions/{session['session_id']}",
        headers=headers,
        json={
            "base_revision": document["document_revision"],
            "upserts": [changed],
            "deleted_block_ids": [],
        },
    )
    assert saved_response.status_code == 200
    return saved_response.json(), changed


def stub_live_concept_probe(monkeypatch) -> None:
    """Keep lifecycle tests deterministic while proving questions require a live agent."""
    async def concepts_for_claim(_assignment_id, _claim_text):
        return [{
            "concept_id": "coordination",
            "label": "Civic coordination",
            "definition": "Collective organization of shared infrastructure.",
            "level": "topic",
        }]

    async def live_question(**_kwargs):
        return GuardedGeneration(
            content="What relationship in your claim shows civic coordination rather than an isolated household decision?",
            metadata=GenerationMetadata(provider="test", model="test-concept-agent", used_live_provider=True),
        )

    monkeypatch.setattr(socratic_probe_service, "_concepts_for_claim", concepts_for_claim)
    monkeypatch.setattr(llm_orchestrator, "enhance", live_question)


@pytest.mark.asyncio
async def test_proactive_probe_is_authorized_idempotent_and_records_response(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_PROBE_QUIET_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_PROBE_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    stub_live_concept_probe(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        saved, changed = await save_meaningful_paragraph(client, session, document, headers)
        evaluate_url = f"/learning-documents/sessions/{session['session_id']}/probes/evaluate"

        forbidden = await client.post(
            evaluate_url,
            json={"document_revision": saved["document_revision"], "changed_block_ids": [changed["block_id"]]},
        )
        assert forbidden.status_code == 403

        stale = await client.post(
            evaluate_url,
            headers=headers,
            json={"document_revision": 0, "changed_block_ids": [changed["block_id"]]},
        )
        assert stale.status_code == 409

        evaluated = await client.post(
            evaluate_url,
            headers=headers,
            json={
                "document_revision": saved["document_revision"],
                "changed_block_ids": [changed["block_id"]],
            },
        )
        assert evaluated.status_code == 200
        result = evaluated.json()
        assert len(result["created"]) == 1
        probe = result["created"][0]
        assert probe["block_id"] == changed["block_id"]
        assert probe["status"] == "offered"
        assert probe["evidence_state"] == "unverified"
        assert probe["question"].endswith("?")
        assert "answer" not in probe["question"].lower()
        assert probe["generation_metadata"]["used_live_provider"] is True
        assert probe["concept_label"] == "Civic coordination"

        duplicate = await client.post(
            evaluate_url,
            headers=headers,
            json={
                "document_revision": saved["document_revision"],
                "changed_block_ids": [changed["block_id"]],
            },
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["created"] == []
        assert len(duplicate.json()["pending"]) == 1

        invalid_response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/{probe['probe_id']}/responses",
            headers=headers,
            json={"response_text": "Too short"},
        )
        assert invalid_response.status_code == 422

        response_text = (
            "The repeated alignment matters because a single household could not independently "
            "maintain the connected channels across the neighbourhood."
        )
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/{probe['probe_id']}/responses",
            headers=headers,
            json={"response_text": response_text},
        )
        assert response.status_code == 200
        submitted_probe = response.json()["probe"]
        assert submitted_probe["status"] == "responded"
        assert submitted_probe["evidence_state"] == "evidence_submitted"
        assert submitted_probe["response_text"] == response_text
        assert "not an automatic grade" in response.json()["message"].lower()

        dossier = await client.get(f"/evidence/dossier/{session['session_id']}")
        assert dossier.status_code == 200
        proactive_evidence = dossier.json()["proactive_socratic_evidence"]
        assert len(proactive_evidence) == 1
        assert proactive_evidence[0]["question"] == probe["question"]
        assert proactive_evidence[0]["response_text"] == response_text
        assert proactive_evidence[0]["evidence_state"] == "evidence_submitted"

        listed = await client.get(
            f"/learning-documents/sessions/{session['session_id']}/probes", headers=headers
        )
        assert listed.status_code == 200
        assert listed.json()["probes"] == []
        assert listed.json()["evidence_summary"]["evidence_submitted"] == 1

        replay = await client.get(f"/events/session/{session['session_id']}", headers=headers)
        event_payloads = [event["payload"] for event in replay.json()["events"]]
        assert any(event["event_type"] == "socratic_probe_offered" for event in replay.json()["events"])
        assert any(event["event_type"] == "socratic_probe_response_submitted" for event in replay.json()["events"])
        assert all(response_text not in str(payload) for payload in event_payloads)


@pytest.mark.asyncio
async def test_probe_defer_and_material_document_revision_supersede_prior_question(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_PROBE_QUIET_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_PROBE_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    stub_live_concept_probe(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        first_saved, first_changed = await save_meaningful_paragraph(client, session, document, headers)
        evaluate_url = f"/learning-documents/sessions/{session['session_id']}/probes/evaluate"
        first_evaluation = await client.post(
            evaluate_url,
            headers=headers,
            json={
                "document_revision": first_saved["document_revision"],
                "changed_block_ids": [first_changed["block_id"]],
            },
        )
        first_probe = first_evaluation.json()["created"][0]

        deferred = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/{first_probe['probe_id']}/defer",
            headers=headers,
        )
        assert deferred.status_code == 200
        assert deferred.json()["probe"]["status"] == "deferred"
        assert "fully editable" in deferred.json()["message"].lower()

        current_document = await client.get(
            f"/learning-documents/sessions/{session['session_id']}", headers=headers
        )
        assert current_document.status_code == 200
        revised, revised_changed = await save_meaningful_paragraph(
            client,
            session,
            current_document.json(),
            headers,
            suffix="This revised qualification makes the causal inference appropriately cautious.",
        )
        reevaluated = await client.post(
            evaluate_url,
            headers=headers,
            json={
                "document_revision": revised["document_revision"],
                "changed_block_ids": [revised_changed["block_id"]],
            },
        )
        assert reevaluated.status_code == 200
        next_probe = reevaluated.json()["created"]
        assert len(next_probe) == 1
        assert next_probe[0]["probe_id"] != first_probe["probe_id"]
        assert next_probe[0]["source_block_revision"] == 2

        dismissed = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/{next_probe[0]['probe_id']}/dismiss",
            headers=headers,
        )
        assert dismissed.status_code == 200
        assert dismissed.json()["probe"]["status"] == "dismissed"
        assert "automatic penalty" in dismissed.json()["message"].lower()


@pytest.mark.asyncio
async def test_probes_reject_nonmember_blocks_and_submitted_sessions(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_PROBE_QUIET_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        evaluate_url = f"/learning-documents/sessions/{session['session_id']}/probes/evaluate"
        unknown_block = await client.post(
            evaluate_url,
            headers=headers,
            json={"document_revision": document["document_revision"], "changed_block_ids": [str(uuid.uuid4())]},
        )
        assert unknown_block.status_code == 422

        submitted = await client.post(f"/events/session/{session['session_id']}/submit", headers=headers)
        assert submitted.status_code == 200
        blocked = await client.get(
            f"/learning-documents/sessions/{session['session_id']}/probes", headers=headers
        )
        assert blocked.status_code == 409


@pytest.mark.asyncio
async def test_concept_probe_is_not_offered_when_the_live_model_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_PROBE_QUIET_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_PROBE_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")

    async def concepts_for_claim(_assignment_id, _claim_text):
        return [{
            "concept_id": "coordination",
            "label": "Civic coordination",
            "definition": "Collective organization of shared infrastructure.",
            "level": "topic",
        }]

    monkeypatch.setattr(socratic_probe_service, "_concepts_for_claim", concepts_for_claim)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        saved, changed = await save_meaningful_paragraph(client, session, document, headers)
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/evaluate",
            headers=headers,
            json={"document_revision": saved["document_revision"], "changed_block_ids": [changed["block_id"]]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["created"] == []
        assert body["pending"] == []
        assert "temporarily unavailable" in body["availability_notice"].lower()


@pytest.mark.asyncio
async def test_source_reference_request_opens_assigned_materials_without_model_text(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers=headers,
            json={
                "sentence": "I need to develop an argument.",
                "student_reply": "give me source for reference",
                "move_type": "socratic",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert "open" in body["oracle_reply"].lower()
        assert body["interactive_actions"][0]["action_type"] == "cite_source"
        assert "source proves" not in body["oracle_reply"].lower()


@pytest.mark.asyncio
async def test_epistemic_classify_sentences(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        classify_url = f"/learning-documents/sessions/{session['session_id']}/probes/epistemic-classify"

        sentences = [
            "Remote work inherently maximizes organizational efficiency.",
            "This assumes all team members possess high autonomy.",
            "According to the 2023 remote productivity dataset, output rose by 12%.",
            "Because asynchronous communication reduces meeting fragmentation, deep work intervals increase.",
            "Therefore, physical offices will become completely obsolete.",
        ]

        text_corpus = " ".join(sentences)
        response = await client.post(
            classify_url,
            headers=headers,
            json={"text": text_corpus, "oracle_pressure": "socratic"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["sentences"]) >= 4
        types = [item["epistemic_type"] for item in data["sentences"]]
        assert "claim" in types or "assumption" in types
        assert "evidence" in types
        # Verify sentences returned are typed
        for item in data["sentences"]:
            assert item["sentence"]
            assert item["epistemic_type"] in ["claim", "evidence", "reasoning", "assumption", "premature_closure"]


@pytest.mark.asyncio
async def test_sentence_inquire_reports_when_a_live_model_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        inquire_url = f"/learning-documents/sessions/{session['session_id']}/probes/sentence-inquire"

        response = await client.post(
            inquire_url,
            headers=headers,
            json={
                "sentence": "Therefore, physical offices will become completely obsolete.",
                "epistemic_type": "premature_closure",
                "surrounding_context": "Remote work increases deep focus. Therefore, physical offices will become completely obsolete.",
                "move_type": "challenge",
                "oracle_pressure": "socratic",
            },
        )
        assert response.status_code == 503
        data = response.json()
        assert data["detail"]["code"] == "MODEL_UNAVAILABLE"
        assert data["detail"]["retryable"] is True
        assert "unavailable" in data["detail"]["message"].lower()
        assert "draft has not changed" in data["detail"]["message"].lower()
        assert data["detail"]["correlation_id"]


@pytest.mark.asyncio
async def test_dialectical_turn_socratic_oracle(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        turn_url = f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn"

        # A live Enquirer does not substitute deterministic tutoring when no
        # model is configured.
        response_incomplete = await client.post(
            turn_url,
            headers=headers,
            json={
                "sentence": "Therefore, physical offices will become completely obsolete.",
                "epistemic_type": "premature_closure",
                "history": [
                    {
                        "role": "oracle",
                        "content": "What empirical evidence supports your claim that physical offices will become completely obsolete?",
                    }
                ],
                "student_reply": "I just think everyone likes working from home more.",
                "move_type": "challenge",
            },
        )
        assert response_incomplete.status_code == 503
        data1 = response_incomplete.json()
        assert data1["detail"]["code"] == "MODEL_UNAVAILABLE"
        assert data1["detail"]["retryable"] is True
        assert "unavailable" in data1["detail"]["message"].lower()
        assert "draft has not changed" in data1["detail"]["message"].lower()


@pytest.mark.asyncio
async def test_continuation_requires_a_live_answer_blind_planning_question(monkeypatch):
    """Brief follow-ups must use the conversation, never a fixed dismissal."""
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")

    async def answer_instead_of_question(**_kwargs):
        return GuardedGeneration(
            content=(
                '{"oracle_reply":"The policy ended traditional governance and caused the war.",'
                '"helper_delegation":null,"interactive_actions":[]}'
            ),
            metadata=GenerationMetadata(provider="test", model="test", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", answer_instead_of_question)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers=headers,
            json={
                "sentence": "The policy changed political authority.",
                "student_reply": "tell me",
                "move_type": "socratic",
                "history": [
                    {
                        "role": "oracle",
                        "content": "You could compare succession rules with the policy's intended integration.",
                    }
                ],
            },
        )
        assert response.status_code == 503
        detail = response.json()["detail"]
        assert detail["code"] == "MODEL_UNAVAILABLE"
        assert "unavailable" in detail["message"].lower()
        assert "draft has not changed" in detail["message"].lower()


@pytest.mark.asyncio
async def test_continuation_returns_a_live_contextual_planning_question(monkeypatch):
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")

    async def planning_question(**_kwargs):
        return GuardedGeneration(
            content=(
                '{"oracle_reply":"Would comparing succession rules with the policy’s promise of integration give you a clearer first section?",'
                '"helper_delegation":null,"interactive_actions":[]}'
            ),
            metadata=GenerationMetadata(provider="test", model="test", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", planning_question)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers=headers,
            json={
                "sentence": "The policy changed political authority.",
                "student_reply": "tell me",
                "move_type": "socratic",
                "history": [
                    {
                        "role": "oracle",
                        "content": "You could compare succession rules with the policy's intended integration.",
                    }
                ],
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["oracle_reply"].endswith("?")
        assert body["current_probe_category"] == "creative"


@pytest.mark.asyncio
async def test_brainstorm_repairs_then_returns_a_student_follow_up(monkeypatch):
    """The brainstorming tool repairs a malformed live response before surfacing it."""
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    attempts = 0

    async def brainstorming_response(**_kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            content = (
                '{"oracle_reply":"Explore the tension between formal legal change and local authority.",'
                '"helper_delegation":null,"interactive_actions":[]}'
            )
        else:
            content = (
                '{"oracle_reply":"You could compare formal legal change with continuing local authority, '
                'or examine how succession rules tested the policy in practice. Which tension would you like to develop first?",'
                '"helper_delegation":null,"interactive_actions":[]}'
            )
        return GuardedGeneration(
            content=content,
            metadata=GenerationMetadata(provider="test", model="test", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", brainstorming_response)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers=headers,
            json={
                "sentence": "The policy changed political authority.",
                "student_reply": "/brainstorm",
                "move_type": "socratic",
            },
        )

    assert response.status_code == 200
    assert attempts == 2
    assert response.json()["oracle_reply"].endswith("?")


@pytest.mark.asyncio
async def test_reference_request_opens_assigned_materials_without_model_inference(monkeypatch):
    """Informal reference requests must remain available when the live model is not."""
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers={"X-Fiosra-Session-Token": session["access_token"]},
            json={
                "sentence": "The policy changed political authority.",
                "student_reply": "any references?",
                "move_type": "socratic",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["current_probe_category"] == "source"
    assert body["interactive_actions"][0]["action_type"] == "cite_source"
    assert "open" in body["oracle_reply"].lower()


@pytest.mark.asyncio
async def test_generic_dialogue_cannot_create_canvas_sections(monkeypatch):
    """Only an explicit learner structure request may stage a canvas modification."""
    monkeypatch.setattr(settings, "FIOSRA_LLM_PROVIDER", "deterministic")

    async def unsolicited_canvas_action(**_kwargs):
        return GuardedGeneration(
            content=(
                '{"oracle_reply":"Hello. What part of the assignment would you like to explore?",'
                '"helper_delegation":{"action":"scaffold_sections",'
                '"section_titles":["First section","Second section"]},'
                '"interactive_actions":[]}'
            ),
            metadata=GenerationMetadata(provider="test", model="test", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", unsolicited_canvas_action)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _assignment, session, _document = await create_document_session(client)
        response = await client.post(
            f"/learning-documents/sessions/{session['session_id']}/probes/dialectical-turn",
            headers={"X-Fiosra-Session-Token": session["access_token"]},
            json={
                "sentence": "The policy changed political authority.",
                "student_reply": "hi",
                "move_type": "socratic",
            },
        )

    assert response.status_code == 200
    assert response.json()["helper_action"] is None
