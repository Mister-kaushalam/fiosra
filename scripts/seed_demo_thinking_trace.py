#!/usr/bin/env python3
"""Seed Demo Thinking Trace for Julian Hayes on Dara's Coffee Cart (4Ps).

Populates a rich, authentic student learning trace that highlights:
1. Initial premise (library steps, low price)
2. Socratic tutor challenge & marginalia probe (break-even friction & cafe proximity)
3. Student struggle / reflection
4. Cognitive pivot (moving to Science block, higher price) with before/after diff
5. Evidence grounding (41% oat milk survey data, margins)
6. Strategic synthesis (all 4Ps interlocking)
7. Final submission for educator review
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from fiosra.mvp.database import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

COURSE_ID = "8a9fefac-e5b9-49dd-935c-88cfd1929e26"
STUDENT_ID = "julian_hayes"
STUDENT_NAME = "Julian Hayes"


async def seed_demo_trace() -> tuple[str, str]:
    """Seed session and chronological events. Returns (assignment_id, session_id)."""
    async with AsyncSessionLocal() as session:
        # 1. Locate Dara's Coffee Cart assignment
        result = await session.execute(
            text("""
                SELECT assignment_id, title 
                FROM assignments 
                WHERE title ILIKE '%coffee%' OR title ILIKE '%dara%'
                ORDER BY created_at DESC 
                LIMIT 1;
            """)
        )
        row = result.mappings().first()
        if not row:
            raise RuntimeError("Dara's Coffee Cart assignment not found in database. Run seed_daras_coffee_cart.py first.")
        
        assignment_id = str(row["assignment_id"])
        assignment_title = row["title"]
        logger.info(f"Found assignment: '{assignment_title}' ({assignment_id})")

        # 2. Check or create student session
        # Check if Julian Hayes already has a session
        sess_result = await session.execute(
            text("""
                SELECT session_id 
                FROM student_sessions 
                WHERE student_id = :student_id AND assignment_id = :assignment_id
                ORDER BY started_at DESC
                LIMIT 1;
            """),
            {"student_id": STUDENT_ID, "assignment_id": assignment_id}
        )
        existing_sess = sess_result.mappings().first()

        if existing_sess:
            session_id = str(existing_sess["session_id"])
            logger.info(f"Using existing session for {STUDENT_ID}: {session_id}")
            # Clear old events for clean demo state
            await session.execute(
                text("DELETE FROM session_events WHERE session_id = :session_id;"),
                {"session_id": session_id}
            )
            await session.execute(
                text("""
                    UPDATE student_sessions 
                    SET status = 'submitted', last_activity_at = NOW() 
                    WHERE session_id = :session_id;
                """),
                {"session_id": session_id}
            )
        else:
            session_id = str(uuid.uuid4())
            logger.info(f"Creating new session for {STUDENT_ID}: {session_id}")
            await session.execute(
                text("""
                    INSERT INTO student_sessions (
                        session_id, student_id, assignment_id, current_question_id, status, started_at, last_activity_at
                    ) VALUES (
                        :session_id, :student_id, :assignment_id, 'q1', 'submitted', NOW() - INTERVAL '15 minutes', NOW()
                    );
                """),
                {"session_id": session_id, "student_id": STUDENT_ID, "assignment_id": assignment_id}
            )

        # 3. Build chronological sequence of events
        base_time = datetime.now(timezone.utc) - timedelta(minutes=15)

        events = [
            # T+00:00 - Assignment Opened
            {
                "offset_sec": 0,
                "event_type": "assignment_opened",
                "question_id": "q1",
                "payload": {
                    "title": "Dara's Coffee Cart: A First Encounter with the 4Ps",
                }
            },
            # T+00:12 - Case Brief Read
            {
                "offset_sec": 12,
                "event_type": "source_exhibit_read",
                "question_id": "q1",
                "payload": {
                    "title": "Case Brief: Dara's Coffee Cart costs and survey",
                }
            },
            # T+00:45 - OpenStax Read
            {
                "offset_sec": 45,
                "event_type": "source_document_opened",
                "question_id": "q1",
                "payload": {
                    "title": "OpenStax Principles of Marketing §1.2 Marketing Mix",
                    "section": "§1.2",
                }
            },
            # T+02:15 - Initial Premise
            {
                "offset_sec": 135,
                "event_type": "canvas_section_saved",
                "question_id": "q1",
                "payload": {
                    "section_id": "location",
                    "plaintext": "Dara should park at the library steps because 1,200 people pass there every day. She should charge €1.50 to undercut the campus café.",
                    "revision": 1,
                }
            },
            # T+03:40 - Student message to tutor
            {
                "offset_sec": 220,
                "event_type": "student_prompt_submitted",
                "question_id": "q1",
                "payload": {
                    "student_input": "How many cups does Dara need to sell at €1.50 to break even?",
                }
            },
            # T+03:55 - Tutor Socratic Challenge
            {
                "offset_sec": 235,
                "event_type": "tutor_turn_completed",
                "question_id": "q1",
                "payload": {
                    "response_text": "At €0.70 margin per cup (€1.50 price - €0.80 cost), how many cups must Dara sell every day to cover the €45 weekly licence? And if students on the library steps are already only a 4-minute walk from a warm café, why would they stop in the cold?",
                }
            },
            # T+05:30 - Marginalia probe offered on location paragraph
            {
                "offset_sec": 330,
                "event_type": "socratic_probe_offered",
                "question_id": "q1",
                "payload": {
                    "focus_type": "location_proximity",
                    "question": "Look closely at the library steps in the case data. What competitor is nearby, and why is footfall without competitive insulation a deceptive metric?",
                }
            },
            # T+06:10 - Student struggle response to probe
            {
                "offset_sec": 370,
                "event_type": "socratic_probe_response_submitted",
                "question_id": "q1",
                "payload": {
                    "response_text": "I didn't think about the break-even. 65 cups a day is a lot to cover fixed costs. And the café is only 4 minutes away from the library steps, so students will just walk there in bad weather.",
                }
            },
            # T+07:00 - Re-read pricing source
            {
                "offset_sec": 420,
                "event_type": "source_document_opened",
                "question_id": "q1",
                "payload": {
                    "title": "OpenStax §12.1 Pricing and Value Capture",
                    "section": "§12.1",
                }
            },
            # T+08:15 - Cognitive Pivot (revised draft - location & price)
            {
                "offset_sec": 495,
                "event_type": "canvas_section_saved",
                "question_id": "q1",
                "payload": {
                    "section_id": "location",
                    "plaintext": "Dara should park at the Science block instead of the library. Although fewer students pass daily (700 vs 1,200), the café is an 11-minute walk away. Because there is no food nearby, Dara can charge €2.80 for convenience.",
                    "revision": 2,
                    "insight": "Shifted from footfall volume to walk-time friction as primary strategic driver.",
                }
            },
            # T+09:30 - Re-read product source
            {
                "offset_sec": 570,
                "event_type": "source_document_opened",
                "question_id": "q1",
                "payload": {
                    "title": "OpenStax §9.1 Product Layers & Core Customer Value",
                    "section": "§9.1",
                }
            },
            # T+10:40 - Grounded in evidence (Product & Price with survey numbers)
            {
                "offset_sec": 640,
                "event_type": "canvas_section_saved",
                "question_id": "q1",
                "payload": {
                    "section_id": "product_price",
                    "plaintext": "Based on the survey data, 41% of students would pay more for oat milk. Dara should offer premium oat milk at €0.40 extra, yielding a €2.40 margin on oat milk orders. Survey also confirms 62% buy coffee between classes if it is closer than the café.",
                    "revision": 3,
                }
            },
            # T+12:50 - Strategic Synthesis (All 4Ps interlocked)
            {
                "offset_sec": 770,
                "event_type": "canvas_section_saved",
                "question_id": "q1",
                "payload": {
                    "section_id": "strategy_synthesis",
                    "plaintext": "All 4 decisions interlock as a coordinated marketing mix. Product: high-speed drip coffee with oat milk option. Price: €2.80 capturing walk-time friction. Place: Science concourse with 11-minute buffer from the café. Promotion: physical flyers on lecture noticeboards before Monday 9am lab blocks.",
                    "revision": 4,
                }
            },
            # T+14:20 - Final Submission
            {
                "offset_sec": 860,
                "event_type": "student_submitted_for_review",
                "question_id": "q1",
                "payload": {
                    "document_revision": 4,
                    "word_count": 395,
                    "sections_completed": ["location", "product_price", "strategy_synthesis"],
                }
            }
        ]

        # 4. Insert events
        for evt in events:
            event_time = base_time + timedelta(seconds=evt["offset_sec"])
            await session.execute(
                text("""
                    INSERT INTO session_events (
                        session_id, student_id, assignment_id, question_id, event_type, created_at, payload
                    ) VALUES (
                        :session_id, :student_id, :assignment_id, :question_id, :event_type, :created_at,
                        CAST(:payload AS JSONB)
                    );
                """),
                {
                    "session_id": session_id,
                    "student_id": STUDENT_ID,
                    "assignment_id": assignment_id,
                    "question_id": evt["question_id"],
                    "event_type": evt["event_type"],
                    "created_at": event_time,
                    "payload": json.dumps(evt["payload"]),
                }
            )

        await session.commit()
        logger.info(f"✓ Successfully seeded {len(events)} events for Julian Hayes!")
        return assignment_id, session_id


async def main() -> None:
    assignment_id, session_id = await seed_demo_trace()
    print("\n" + "=" * 70)
    print("🎉 DEMO THINKING TRACE READY FOR HACKATHON")
    print("=" * 70)
    print(f"Student:       {STUDENT_NAME} ({STUDENT_ID})")
    print(f"Assignment ID: {assignment_id}")
    print(f"Session ID:    {session_id}")
    print("-" * 70)
    print("DEMO URLS:")
    print(f"1. Teacher Flight Recorder (Dual Timeline):")
    print(f"   http://localhost:8080/ui/#/student/trace?session_id={session_id}")
    print(f"2. Student Workspace (Reasoning & Activity in right gutter):")
    print(f"   http://localhost:8080/ui/#/student?course_id={COURSE_ID}&assignment_id={assignment_id}")
    print(f"3. Educator Review Queue (AutoSCORE dossier):")
    print(f"   http://localhost:8080/ui/#/review?course_id={COURSE_ID}")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
