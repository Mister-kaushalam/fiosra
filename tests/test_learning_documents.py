import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from fiosra.mvp.main import app
from tests.test_learning_canvas import create_published_grounded_assignment


def paragraph_block(block_id: str, position: int, text: str, section_id: str = "reasoning") -> dict:
    return {
        "block_id": block_id,
        "block_type": "paragraph",
        "position": position,
        "section_id": section_id,
        "author_type": "student",
        "content": {
            "type": "paragraph",
            "attrs": {"blockId": block_id, "sectionId": section_id, "authorType": "student"},
            "content": [{"type": "text", "text": text}],
        },
    }


@pytest.mark.asyncio
async def test_long_form_document_starts_blank_and_requires_session_capability():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assignment, _source_chunk_id = await create_published_grounded_assignment(client)
        session_response = await client.post(
            "/events/session",
            json={
                "student_id": f"document_student_{uuid.uuid4().hex[:8]}",
                "assignment_id": assignment["assignment_id"],
                "current_question_id": assignment["question_id"],
            },
        )
        session = session_response.json()
        session_id = session["session_id"]
        headers = {"X-Fiosra-Session-Token": session["access_token"]}

        forbidden = await client.get(f"/learning-documents/sessions/{session_id}")
        assert forbidden.status_code == 403
        assert forbidden.json()["detail"]["code"] == "SESSION_AUTHORIZATION"
        assert forbidden.json()["detail"]["correlation_id"]

        state_response = await client.get(f"/learning-documents/sessions/{session_id}", headers=headers)
        assert state_response.status_code == 200
        state = state_response.json()
        assert state["session_id"] == session_id
        assert state["document_revision"] == 0
        assert state["blocks"] == []

        changed = paragraph_block(
            str(uuid.uuid4()),
            1,
            "The drainage pattern supports an inference about coordination but not its institution.",
            "page_1",
        )
        sync_response = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={"base_revision": 0, "upserts": [changed], "deleted_block_ids": []},
        )
        assert sync_response.status_code == 200
        synced = sync_response.json()
        assert synced["document_revision"] == 1
        restored = next(block for block in synced["blocks"] if block["block_id"] == changed["block_id"])
        assert restored["plaintext"] == changed["content"]["content"][0]["text"]
        assert restored["revision"] == 1

        stale_response = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={"base_revision": 0, "upserts": [changed], "deleted_block_ids": []},
        )
        assert stale_response.status_code == 409

        invalid_block = paragraph_block(str(uuid.uuid4()), 99, "Untrusted identity.")
        invalid_block["content"]["attrs"]["blockId"] = str(uuid.uuid4())
        invalid_response = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={"base_revision": 1, "upserts": [invalid_block], "deleted_block_ids": []},
        )
        assert invalid_response.status_code == 422


@pytest.mark.asyncio
async def test_long_document_accepts_many_incremental_blocks_without_document_wide_cap():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assignment, _source_chunk_id = await create_published_grounded_assignment(client)
        session_response = await client.post(
            "/events/session",
            json={
                "student_id": f"long_document_student_{uuid.uuid4().hex[:8]}",
                "assignment_id": assignment["assignment_id"],
                "current_question_id": assignment["question_id"],
            },
        )
        session = session_response.json()
        session_id = session["session_id"]
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        initial = (await client.get(f"/learning-documents/sessions/{session_id}", headers=headers)).json()

        # 125 independently addressable paragraphs at 240 words each approximate a
        # 100-page double-spaced essay without one giant request field or an 8K cap.
        paragraph_text = "evidence " * 240
        blocks = [
            paragraph_block(str(uuid.uuid4()), position, paragraph_text)
            for position in range(1, 126)
        ]
        sync_response = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={"base_revision": initial["document_revision"], "upserts": blocks, "deleted_block_ids": []},
        )
        assert sync_response.status_code == 200
        synced = sync_response.json()
        assert synced["document_revision"] == 1
        assert len(synced["blocks"]) == 125
        assert sum(len(block["plaintext"]) for block in synced["blocks"]) > 200_000

        replay = await client.get(f"/events/session/{session_id}", headers=headers)
        event_types = [event["event_type"] for event in replay.json()["events"]]
        assert "learning_document_initialized" in event_types
        assert "learning_document_synced" in event_types

        submitted = await client.post(f"/events/session/{session_id}/submit", headers=headers)
        assert submitted.status_code == 200
        blocked_update = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={"base_revision": 1, "upserts": [blocks[0]], "deleted_block_ids": []},
        )
        assert blocked_update.status_code == 409


@pytest.mark.asyncio
async def test_submission_binds_one_saved_revision_and_replays_idempotently():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assignment, _source_chunk_id = await create_published_grounded_assignment(client)
        session_response = await client.post(
            "/events/session",
            json={
                "student_id": f"submission_student_{uuid.uuid4().hex[:8]}",
                "assignment_id": assignment["assignment_id"],
                "current_question_id": assignment["question_id"],
            },
        )
        session = session_response.json()
        session_id = session["session_id"]
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        initial = await client.get(f"/learning-documents/sessions/{session_id}", headers=headers)
        block = paragraph_block(
            str(uuid.uuid4()),
            1,
            "The source supports a limited claim because it documents a specific institutional change.",
            "page_1",
        )
        saved = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={
                "base_revision": initial.json()["document_revision"],
                "upserts": [block],
                "deleted_block_ids": [],
            },
        )
        assert saved.status_code == 200
        saved_revision = saved.json()["document_revision"]

        stale_submit = await client.post(
            f"/events/session/{session_id}/submit",
            headers={**headers, "Idempotency-Key": "submission-test-key"},
            json={"document_revision": saved_revision - 1},
        )
        assert stale_submit.status_code == 409
        assert stale_submit.json()["detail"]["code"] == "SUBMISSION_BLOCKED"

        first_submit = await client.post(
            f"/events/session/{session_id}/submit",
            headers={**headers, "Idempotency-Key": "submission-test-key"},
            json={"document_revision": saved_revision},
        )
        assert first_submit.status_code == 200
        first_body = first_submit.json()
        assert first_body["document_revision"] == saved_revision
        assert first_body["idempotent_replay"] is False
        assert first_body["submitted_at"]

        replay_submit = await client.post(
            f"/events/session/{session_id}/submit",
            headers={**headers, "Idempotency-Key": "submission-test-key"},
            json={"document_revision": saved_revision},
        )
        assert replay_submit.status_code == 200
        replay_body = replay_submit.json()
        assert replay_body["idempotent_replay"] is True
        assert replay_body["document_revision"] == saved_revision
        assert replay_body["submitted_at"] == first_body["submitted_at"]

        replay = await client.get(f"/events/session/{session_id}", headers=headers)
        assert replay.status_code == 200
        assert replay.json()["session"]["status"] == "submitted"
        assert replay.json()["session"]["submitted_document_revision"] == saved_revision
        assert replay.json()["session"]["submitted_at"] == first_body["submitted_at"]
        assert [event["event_type"] for event in replay.json()["events"]].count("student_submitted_for_review") == 1


@pytest.mark.asyncio
async def test_selected_source_persists_and_can_be_linked_without_a_model_call():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assignment, _source_chunk_id = await create_published_grounded_assignment(client)
        source = assignment["published"]["source_pack"][0]
        session_response = await client.post(
            "/events/session",
            json={
                "student_id": f"source_reference_student_{uuid.uuid4().hex[:8]}",
                "assignment_id": assignment["assignment_id"],
                "current_question_id": assignment["question_id"],
            },
        )
        session = session_response.json()
        session_id = session["session_id"]
        headers = {"X-Fiosra-Session-Token": session["access_token"]}
        initial = await client.get(f"/learning-documents/sessions/{session_id}", headers=headers)
        assert initial.status_code == 200
        block = paragraph_block(
            str(uuid.uuid4()),
            1,
            "The excavation report documents repeated drainage alignment, which may support a limited inference about coordination.",
            "page_1",
        )
        saved = await client.put(
            f"/learning-documents/sessions/{session_id}",
            headers=headers,
            json={
                "base_revision": initial.json()["document_revision"],
                "upserts": [block],
                "deleted_block_ids": [],
            },
        )
        assert saved.status_code == 200

        added = await client.post(
            f"/learning-documents/sessions/{session_id}/source-references",
            headers=headers,
            json={"source_id": source["source_id"]},
        )
        assert added.status_code == 200
        reference = added.json()["source_references"][0]
        assert reference["source_id"] == source["source_id"]
        assert reference["title"] == source["title"]
        assert reference["linked_block_ids"] == []

        linked = await client.post(
            f"/learning-documents/sessions/{session_id}/source-references/{source['source_id']}/links",
            headers=headers,
            json={"block_id": block["block_id"]},
        )
        assert linked.status_code == 200
        assert linked.json()["source_references"][0]["linked_block_ids"] == [block["block_id"]]

        restored = await client.get(f"/learning-documents/sessions/{session_id}", headers=headers)
        assert restored.status_code == 200
        assert restored.json()["source_references"][0]["source_id"] == source["source_id"]
        assert restored.json()["source_references"][0]["linked_block_ids"] == [block["block_id"]]

        located = await client.post(
            f"/learning-documents/sessions/{session_id}/assigned-evidence",
            headers=headers,
            json={"block_id": block["block_id"], "claim_text": block["content"]["content"][0]["text"]},
        )
        assert located.status_code == 200
        locator = located.json()
        assert locator["candidates"][0]["source_id"] == source["source_id"]
        assert "do not establish the conclusion" in locator["message"].lower()

        rejected = await client.post(
            f"/learning-documents/sessions/{session_id}/source-references",
            headers=headers,
            json={"source_id": "not-assigned"},
        )
        assert rejected.status_code == 422
        assert rejected.json()["detail"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_student_catalog_uses_the_same_published_assignment_projection_as_the_workspace():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assignment, _source_chunk_id = await create_published_grounded_assignment(client)
        courses = (await client.get("/courses")).json()
        course = next(
            course for course in courses
            if any(
                item["assignment_id"] == assignment["assignment_id"]
                for module in course["modules"]
                for item in module["assignments"]
            )
        )
        student_id = f"catalog_student_{uuid.uuid4().hex[:8]}"

        available = await client.get(f"/courses/student-catalog?student_id={student_id}")
        assert available.status_code == 200
        catalog_course = next(item for item in available.json() if item["course_id"] == course["course_id"])
        assert catalog_course["is_available"] is True
        assert catalog_course["is_enrolled"] is False
        assert catalog_course["active_assignment"]["assignment_id"] == assignment["assignment_id"]
        assert catalog_course["active_assignment"]["title"] == assignment["published"]["title"]
        assert catalog_course["active_assignment"]["prompt"] == assignment["published"]["task"]["prompt"]

        enrolled = await client.post(
            f"/courses/{course['course_id']}/enroll", json={"student_id": student_id}
        )
        assert enrolled.status_code == 201
        after_enrollment = await client.get(f"/courses/student-catalog?student_id={student_id}")
        catalog_course = next(item for item in after_enrollment.json() if item["course_id"] == course["course_id"])
        assert catalog_course["is_enrolled"] is True
        assert catalog_course["active_assignment"]["assignment_id"] == assignment["assignment_id"]
