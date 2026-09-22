"""PDF Generator for student assignment submissions.

Generates clean, academic-grade PDF documents using PyMuPDF (Story & DocumentWriter)
containing exclusively the student's authored assignment submission and metadata.
"""

from __future__ import annotations

import html
import io
import logging
from typing import Any

import pymupdf

logger = logging.getLogger(__name__)


def generate_submission_pdf(
    student_id: str,
    assignment_title: str,
    submitted_at: str | None,
    status: str,
    canvas_sections: list[dict[str, Any]] | None = None,
    rubric_evidence: list[dict[str, Any]] | None = None,  # retained for backward compatibility, omitted from PDF
    grade_info: dict[str, Any] | None = None,  # retained for backward compatibility, omitted from PDF
    course_title: str | None = None,
    session_id: str | None = None,
    document_blocks: list[dict[str, Any]] | None = None,
    source_references: list[dict[str, Any]] | None = None,
) -> bytes:
    """Render a clean, sovereign academic PDF of the student's submitted assignment work only."""
    stream = io.BytesIO()
    writer = pymupdf.DocumentWriter(stream)

    safe_title = html.escape(assignment_title or "Assignment Submission")
    safe_student = html.escape(student_id or "Anonymous Student")
    safe_status = html.escape((status or "submitted").upper())
    safe_date = html.escape(submitted_at or "In Progress")
    safe_course = html.escape(course_title or "Course Curriculum")
    safe_session = html.escape(str(session_id)[:8] if session_id else "")

    work_html = ""

    # Priority 1: Authored document blocks (from the long-form editor)
    if document_blocks:
        blocks_content = []
        for block in document_blocks:
            b_type = (block.get("block_type") or "paragraph").lower()
            text_val = (block.get("plaintext") or "").strip()
            if not text_val:
                continue

            escaped_text = html.escape(text_val).replace("\n", "<br>")
            if b_type == "heading":
                attrs = block.get("content", {}).get("attrs", {}) if isinstance(block.get("content"), dict) else {}
                level = attrs.get("level", 2)
                font_size = "18px" if level == 1 else ("15px" if level == 2 else "13px")
                blocks_content.append(
                    f"<h{level} style='font-size: {font_size}; font-weight: bold; color: #0f172a; "
                    f"margin: 18px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;'>"
                    f"{escaped_text}</h{level}>"
                )
            elif b_type == "blockquote":
                blocks_content.append(
                    f"<blockquote style='border-left: 3px solid #6366f1; background: #f8fafc; "
                    f"padding: 8px 14px; margin: 10px 0; color: #334155; font-style: italic; font-size: 12px;'>"
                    f"{escaped_text}</blockquote>"
                )
            elif b_type in ("bulletlist", "bullet_list", "orderedlist", "ordered_list", "listitem", "list_item"):
                blocks_content.append(
                    f"<div style='margin-left: 18px; margin-bottom: 6px; font-size: 13px; line-height: 1.6; color: #1e293b;'>"
                    f"&bull; {escaped_text}</div>"
                )
            else:
                blocks_content.append(
                    f"<p style='font-size: 13px; line-height: 1.65; color: #1e293b; margin: 0 0 12px 0;'>"
                    f"{escaped_text}</p>"
                )

        if blocks_content:
            work_html = "".join(blocks_content)

    # Priority 2: Canvas sections (if blocks not available or as fallback)
    if not work_html and canvas_sections:
        sections_markup = []
        for idx, sec in enumerate(canvas_sections, 1):
            title = html.escape(sec.get("title") or f"Section {idx}")
            prompt = html.escape(sec.get("prompt") or "")
            raw_text = sec.get("text") or ""
            text = html.escape(raw_text).replace("\n", "<br>")
            rev = sec.get("revision", 1)

            sections_markup.append(f"""
            <div style="margin-bottom: 18px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 18px; background: #ffffff;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px;">
                <h3 style="font-size: 14px; font-weight: bold; color: #0f172a; margin: 0;">{idx}. {title}</h3>
                <span style="font-size: 11px; color: #64748b; font-weight: 500;">Revision {rev}</span>
              </div>
              {f"<div style='background:#f8fafc; border-left: 3px solid #64748b; padding: 8px 12px; margin-bottom: 12px; font-size: 12px; color: #475569; font-style: italic;'><b>Prompt:</b> {prompt}</div>" if prompt else ""}
              <div style="font-size: 13px; line-height: 1.6; color: #1e293b;">{text or "<i>No text authored for this section.</i>"}</div>
            </div>
            """)
        work_html = "".join(sections_markup)

    # Fallback if no content exists yet
    if not work_html:
        work_html = (
            "<div style='padding: 24px; text-align: center; color: #64748b; font-style: italic; "
            "border: 1px dashed #cbd5e1; border-radius: 6px; margin-bottom: 20px;'>"
            "No authored document sections recorded for this session."
            "</div>"
        )

    # Cited sources / evidence references (if any)
    sources_html = ""
    if source_references:
        source_items = "".join([
            f"<div style='margin-bottom: 8px; font-size: 12px; color: #334155;'>"
            f"<b>{html.escape(s.get('source_title', 'Source'))}</b>"
            f"{(' &bull; <span style=\"color:#64748b;\">' + html.escape(str(s.get('citation'))) + '</span>') if s.get('citation') else ''}"
            f"{('<div style=\"margin-top:2px; color:#475569; font-style:italic; font-size:11px;\">“' + html.escape(str(s.get('excerpt'))[:250]) + '”</div>') if s.get('excerpt') else ''}"
            f"</div>"
            for s in source_references
        ])
        sources_html = f"""
        <div style="margin-top: 24px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 18px; background: #f8fafc;">
          <h3 style="font-size: 13px; font-weight: bold; color: #0f172a; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
            Cited Evidence &amp; References
          </h3>
          {source_items}
        </div>
        """

    full_html = f"""
    <div style="font-family: sans-serif; color: #1e293b; padding: 10px;">
      <!-- Header Banner -->
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #2563eb; font-weight: bold; margin-bottom: 4px;">
          {safe_course} &bull; Student Submission Record
        </div>
        <h1 style="font-size: 20px; font-weight: bold; color: #0f172a; margin: 0 0 8px 0;">{safe_title}</h1>
        <div style="font-size: 12px; color: #475569; display: flex; gap: 16px;">
          <span>Student ID: <b>{safe_student}</b></span>
          <span>&bull;</span>
          <span>Submission Status: <b>{safe_status}</b></span>
          <span>&bull;</span>
          <span>Date: <b>{safe_date}</b></span>
          {f"<span>&bull;</span><span>Session: <b>{safe_session}</b></span>" if safe_session else ""}
        </div>
      </div>

      <!-- Authored Assignment Work Only -->
      <div style="margin-bottom: 16px;">
        <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.6px; color: #334155; margin: 0 0 14px 0;">
          Authored Assignment Work
        </h2>
        {work_html}
      </div>

      <!-- Cited References (if any) -->
      {sources_html}

      <!-- Footer Stamp -->
      <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #94a3b8; text-align: center;">
        Fiosra Sovereign Reasoning &amp; Educator Evaluation Architecture &bull; Cryptographic Event Audit Trail
      </div>
    </div>
    """

    story = pymupdf.Story(html=full_html)
    mediabox = pymupdf.Rect(0, 0, 612, 792)  # Standard Letter
    where = pymupdf.Rect(36, 36, 576, 756)  # 0.5in margins

    def rectfn(rect_num: int, filled: pymupdf.Rect) -> tuple[pymupdf.Rect, pymupdf.Rect, Any]:
        return mediabox, where, None

    story.write(writer, rectfn)
    writer.close()
    return stream.getvalue()
