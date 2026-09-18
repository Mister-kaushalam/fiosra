import io
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from fiosra.mvp.main import app
from fiosra.mvp.storage import document_storage


@pytest.mark.asyncio
async def test_document_persistent_storage_and_streaming():
    pdf_path = Path(__file__).parent / "fixtures" / "harappa_excavation_report.pdf"
    pdf_bytes = pdf_path.read_bytes()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create Course
        c_res = await ac.post(
            "/courses",
            json={
                "title": "HIST-202: Indus Valley Document Storage Corpus",
                "domain": "History",
                "created_by": "prof_archaeology",
            },
        )
        assert c_res.status_code == 201
        course_id = c_res.json()["course_id"]

        # 2. Add Module
        m_res = await ac.post(
            f"/courses/{course_id}/modules",
            json={
                "title": "Unit 01: Excavation Documents",
                "position": 1,
            },
        )
        assert m_res.status_code == 201
        module_id = m_res.json()["module_id"]

        # 3. Upload PDF file
        files = {
            "file": ("harappa_excavation_report.pdf", pdf_bytes, "application/pdf")
        }
        upload_res = await ac.post(
            f"/courses/{course_id}/modules/{module_id}/resources/upload",
            files=files,
            data={"title": "Harappan Archaeological Survey Report"},
        )
        assert upload_res.status_code == 201
        chunks = upload_res.json()
        assert len(chunks) >= 1
        assert chunks[0]["document_id"] is not None
        document_id = chunks[0]["document_id"]

        # 4. List Documents for Course
        docs_res = await ac.get(f"/courses/{course_id}/documents")
        assert docs_res.status_code == 200
        docs = docs_res.json()
        assert len(docs) == 1
        doc = docs[0]
        assert doc["document_id"] == document_id
        assert doc["title"] == "Harappan Archaeological Survey Report"
        assert doc["filename"] == "harappa_excavation_report.pdf"
        assert doc["file_size"] == len(pdf_bytes)
        assert doc["chunks_count"] >= 1
        assert doc["download_url"] == f"/courses/{course_id}/documents/{document_id}/file"

        # Filter by module_id
        mod_docs_res = await ac.get(f"/courses/{course_id}/documents?module_id={module_id}")
        assert mod_docs_res.status_code == 200
        assert len(mod_docs_res.json()) == 1

        # 5. Fetch Document Binary File (Streaming)
        file_res = await ac.get(f"/courses/{course_id}/documents/{document_id}/file")
        assert file_res.status_code == 200
        assert file_res.headers.get("content-type") == "application/pdf"
        assert "inline" in file_res.headers.get("content-disposition", "")
        assert file_res.content == pdf_bytes

        # 6. Delete Document
        del_res = await ac.delete(f"/courses/{course_id}/documents/{document_id}")
        assert del_res.status_code == 204

        # Verify Document no longer returned
        after_docs = await ac.get(f"/courses/{course_id}/documents")
        assert len(after_docs.json()) == 0

        # Verify File endpoint returns 404
        after_file = await ac.get(f"/courses/{course_id}/documents/{document_id}/file")
        assert after_file.status_code == 404
