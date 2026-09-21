#!/usr/bin/env python3
"""
Seed Dara's Coffee Cart (4Ps) Assignment for BUS C150 Principles of Marketing.

Grounds the assignment in OpenStax Principles of Marketing (2023) and the authentic
teaching module specification from Module_Daras_Coffee_Cart_4Ps.docx.
Maps directly to Module 1: Marketing Foundations and Strategy.
"""

import asyncio
import json
import logging
import uuid
from pathlib import Path
from sqlalchemy import text
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.neo4j_client import neo4j_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

COURSE_ID = "8a9fefac-e5b9-49dd-935c-88cfd1929e26"
DOCUMENT_ID = "c9303ce1-0a69-42b8-a943-436a29499a0d"
PDF_FILE_URL = f"/courses/{COURSE_ID}/documents/{DOCUMENT_ID}/file"

BRIEF_DOC_ID = "e8b15d2a-42c1-4b77-8f54-d890cf2c1101"
BRIEF_PDF_URL = f"/courses/{COURSE_ID}/documents/{BRIEF_DOC_ID}/file"

ASSIGNMENT_TITLE = "Inquiry: Dara's Coffee Cart and the Four Ps"
PUBLISHED_TITLE = "Dara's Coffee Cart: A First Encounter with the Four Ps"

TASK_PROMPT = """Dara is a student. She has saved enough to buy one coffee cart, and she has a licence to trade on campus. She has not decided what to sell, what to charge, where to park, or how anyone will find out she exists. She has asked you to decide, and to explain your reasoning to her.

### What it costs and what the competition charges:
• €0.80 — What one cup costs Dara to make (beans, milk, cup, lid)
• €45 — Cart licence, per week
• €3.20 — What the campus café charges for a coffee
• 9,000 — Total students on campus

### Where she could park:
1. Library steps: 1,200 people passing per day | 4 minutes walk to the café
2. Science block: 700 people passing per day | 11 minutes walk to the café
3. Sports centre: 400 people passing per day | 14 minutes walk to the café (nothing else sold there)

### What students said (Survey of 200 students):
• 62% would buy coffee between classes if it were closer than the café
• 41% would pay more for oat milk
• 28% only drink tea

The catch: Dara has one cart and can only be in one place at a time.

### The Task:
Write about 400 words advising Dara. Your advice must cover what she sells (Product), what she charges (Price), where she parks (Place), and how students find out the cart exists (Promotion) — but how you organise it is your decision.

Every one of the four decisions must be made and defended. Telling her what she could do is not advising her. Where the case does not tell you something, assume it, say you have assumed it, and carry on."""

SOURCES = [
    {
        "source_id": "source_openstax_1_2",
        "title": "OpenStax Principles of Marketing (2023 Edition)",
        "section": "§1.2 Marketing Mix & 4Ps (p. 32)",
        "page": 32,
        "citation": "OpenStax Principles of Marketing (2023), Chapter 1: Marketing and Customer Value, §1.2 (The Marketing Mix and the 4Ps), pp. 18–24",
        "excerpt": "The marketing mix consists of product, price, place, and promotion (the 4Ps). These four elements are interdependent: a decision made about one element inevitably constrains and shapes the choices available for the other three. Marketing strategy is the coordinated orchestration of all four elements to deliver superior customer value.",
        "source_url": PDF_FILE_URL,
        "relevance_guidance": "Demonstrate how the 4Ps operate as a connected system rather than four disconnected decisions."
    },
    {
        "source_id": "source_openstax_9_1",
        "title": "OpenStax Principles of Marketing (2023 Edition)",
        "section": "§9.1 Product Layers (p. 322)",
        "page": 322,
        "citation": "OpenStax Principles of Marketing (2023), Chapter 9: Products, Services, and Experiences, §9.1 (Product Layers & Customer Value), pp. 308–315",
        "excerpt": "A product consists of three distinct layers: the core product (the essential benefit or problem-solving service the customer is really buying), the actual product (the physical attributes, packaging, brand name, and quality level), and the augmented product (additional services and benefits such as delivery or warranty).",
        "source_url": PDF_FILE_URL,
        "relevance_guidance": "Apply the product layers framework: what is the core product Dara is selling if 62% of customers want coffee between classes?"
    },
    {
        "source_id": "source_openstax_12_1_12_2",
        "title": "OpenStax Principles of Marketing (2023 Edition)",
        "section": "§12.1 Pricing & 5 Cs (p. 420)",
        "page": 420,
        "citation": "OpenStax Principles of Marketing (2023), Chapter 12: Pricing and Its Role in the Marketing Mix, §§12.1–12.2 (The Five Cs), pp. 406–418",
        "excerpt": "Pricing decisions must balance the Five Critical Cs: Cost (covering fixed and variable expenses), Customers (perceived value and price sensitivity), Channels of distribution, Competition (benchmarking against substitutes), and Company objectives. Setting price based on value delivered rather than mere cost-plus allows capture of consumer surplus.",
        "source_url": PDF_FILE_URL,
        "relevance_guidance": "Ground Dara's price in relation to her €0.80 cost floor, the café's €3.20 ceiling, and the convenience value she provides."
    },
    {
        "source_id": "source_openstax_13_1",
        "title": "OpenStax Principles of Marketing (2023 Edition)",
        "section": "§13.1 Promotion Mix (p. 452)",
        "page": 452,
        "citation": "OpenStax Principles of Marketing (2023), Chapter 13: The Promotion Mix and Its Elements, §13.1 (Low-Budget Outreach), pp. 438–446",
        "excerpt": "The promotion mix includes advertising, personal selling, sales promotion, public relations, and direct/digital marketing. Micro-enterprises with negligible advertising budgets rely heavily on point-of-sale visibility, personal selling at the counter, word-of-mouth advocacy, and targeted sales promotions (e.g. loyalty cards) to establish repeat purchase habits.",
        "source_url": PDF_FILE_URL,
        "relevance_guidance": "Recommend promotional tactics suited to a single-operator cart with near-zero advertising capital."
    },
    {
        "source_id": "source_openstax_17_2",
        "title": "OpenStax Principles of Marketing (2023 Edition)",
        "section": "§17.2 Direct Channels (p. 596)",
        "page": 596,
        "citation": "OpenStax Principles of Marketing (2023), Chapter 17: Types of Marketing Channels, §17.2 (Direct Channels & Physical Distribution), pp. 582–590",
        "excerpt": "A direct channel involves selling directly from producer to end consumer without intermediaries. In physical retail and mobile services, location (Place) represents both the point of exchange and a fundamental driver of customer convenience, determining accessible footfall and exposure to direct competitive substitutes.",
        "source_url": PDF_FILE_URL,
        "relevance_guidance": "Evaluate how parking location functions as Dara's direct distribution channel and competitive moat."
    },
    {
        "source_id": "source_case_dossier",
        "title": "Dara's Coffee Cart: Case Dossier & Survey",
        "section": "Case Financials & Footfall (p. 1)",
        "page": 1,
        "citation": "Dara's Coffee Cart Case Brief (2026), Campus Operational & Cost Data",
        "excerpt": "Costs: €0.80 unit cost per cup (beans, milk, cup, lid); €45 weekly trading licence. Competition: Campus café charges €3.20. Campus population: 9,000 students. Locations: Library steps (1,200 footfall, 4 min walk to café); Science block (700 footfall, 11 min walk to café); Sports centre (400 footfall, 14 min walk, no competition).",
        "source_url": BRIEF_PDF_URL,
        "relevance_guidance": "Use this exhibit to calculate unit margins, licence break-even, and evaluate the competitive proximity of each spot."
    },
    {
        "source_id": "source_survey_data",
        "title": "Dara's Coffee Cart: Case Dossier & Survey",
        "section": "Student Survey Data (p. 1)",
        "page": 1,
        "citation": "Campus Student Survey (2026), Primary Field Research Data (n=200)",
        "excerpt": "A survey of 200 students found: 62% would buy coffee between classes if it were closer than the café; 41% would pay more for oat milk; 28% only drink tea. Dara operates one cart and can only be in one place at a time.",
        "source_url": BRIEF_PDF_URL,
        "relevance_guidance": "Identify what customer need is actually expressed in the 62% figure, and evaluate the trade-offs of catering to tea and alternative milk drinkers."
    }
]

RUBRIC = [
    {
        "criterion_id": "rubric_advice_given",
        "title": "Advice given, not options listed",
        "description": "Makes and defends clear, actionable decisions across all four elements of the marketing mix rather than merely cataloguing possibilities.",
        "weight": 25.0,
        "levels": [
            {
                "level_id": "distinction",
                "label": "Distinction (70–100)",
                "description": "All four decisions made and defended, and at least one defended against the alternative rejected. Reads as advice a person could act on."
            },
            {
                "level_id": "merit",
                "label": "Merit (60–69)",
                "description": "All four decisions made, each with a sound reason."
            },
            {
                "level_id": "pass",
                "label": "Pass (50–59)",
                "description": "Decisions made but some reasons thin, generic, or true of any business."
            },
            {
                "level_id": "fail",
                "label": "Fail (0–49)",
                "description": "Options described without choosing, a decision missing, or reasons absent."
            }
        ]
    },
    {
        "criterion_id": "rubric_case_reasoning",
        "title": "Reasoning from the case",
        "description": "Applies the quantitative and qualitative data from the case (costs, footfall, walk times, survey) to drive the strategic conclusions.",
        "weight": 25.0,
        "levels": [
            {
                "level_id": "distinction",
                "label": "Distinction (70–100)",
                "description": "The figures drive the argument rather than decorate it. The student notices subtle data trade-offs (e.g. 28% tea exclusion, 4-min walk constraint at library)."
            },
            {
                "level_id": "merit",
                "label": "Merit (60–69)",
                "description": "Relevant figures used accurately to support the decisions."
            },
            {
                "level_id": "pass",
                "label": "Pass (50–59)",
                "description": "The obvious figures quoted, but not made to do analytical work."
            },
            {
                "level_id": "fail",
                "label": "Fail (0–49)",
                "description": "Figures ignored, misread, or replaced by unsupported assertion."
            }
        ]
    },
    {
        "criterion_id": "rubric_textbook_use",
        "title": "Use of the book",
        "description": "Applies OpenStax marketing concepts (§1.2, §9.1, §12.1–12.2, §13.1, §17.2) as analytical instruments to justify strategic choices.",
        "weight": 20.0,
        "levels": [
            {
                "level_id": "distinction",
                "label": "Distinction (70–100)",
                "description": "Concepts used as instruments — a framework (such as core vs actual product or 5 Cs) changes what the student concludes. Cited accurately."
            },
            {
                "level_id": "merit",
                "label": "Merit (60–69)",
                "description": "Correct concepts applied correctly and cited."
            },
            {
                "level_id": "pass",
                "label": "Pass (50–59)",
                "description": "Concepts named but used as labels rather than applied to decision-making."
            },
            {
                "level_id": "fail",
                "label": "Fail (0–49)",
                "description": "No use of the book, or concepts misunderstood."
            }
        ]
    },
    {
        "criterion_id": "rubric_structure_argument",
        "title": "Structure as argument",
        "description": "Synthesizes the four decisions into a cohesive, connected whole where each decision logically flows from and constrains the others.",
        "weight": 20.0,
        "levels": [
            {
                "level_id": "distinction",
                "label": "Distinction (70–100)",
                "description": "The essay has an overarching spine. One decision visibly leads to the next, and the reader sees the connection directly without being told."
            },
            {
                "level_id": "merit",
                "label": "Merit (60–69)",
                "description": "Connections between decisions made explicitly and they hold up."
            },
            {
                "level_id": "pass",
                "label": "Pass (50–59)",
                "description": "Four decisions in sequence, with connection asserted at the end rather than built in."
            },
            {
                "level_id": "fail",
                "label": "Fail (0–49)",
                "description": "Four unconnected paragraphs, or no discernible order at all."
            }
        ]
    },
    {
        "criterion_id": "rubric_clarity_length",
        "title": "Clarity and length (~400 words)",
        "description": "Demonstrates executive writing discipline, economic prose, and effective communication near the 400-word target.",
        "weight": 10.0,
        "levels": [
            {
                "level_id": "distinction",
                "label": "Distinction (70–100)",
                "description": "Economical and clear. Roughly 350–450 words. Nothing padded; every sentence carries weight."
            },
            {
                "level_id": "merit",
                "label": "Merit (60–69)",
                "description": "Clear and near the target length."
            },
            {
                "level_id": "pass",
                "label": "Pass (50–59)",
                "description": "Readable but padded, or noticeably short/long."
            },
            {
                "level_id": "fail",
                "label": "Fail (0–49)",
                "description": "Unclear, or substantially over (>600 words) or under (<250 words) length."
            }
        ]
    }
]

START_OPTIONS = [
    "By Argument (Distinction Track): Lead with what Dara is really selling (time/convenience) and derive Product, Price, Place, and Promotion from that premise.",
    "By Comparison (Merit Track): Compare two contrasting plans (e.g. low-price Library footfall vs. high-margin Science Block convenience) and defend one.",
    "By Decision (Foundational Track): Address the four decisions in sequence: Product, Price, Place, and Promotion."
]

COMPLETION_CHECKLIST = [
    "All four decisions (Product, Price, Place, Promotion) clearly made and justified",
    "Defended choices against realistic alternatives (e.g. why reject the Library or why exclude food)",
    "Case figures and survey data actively used to drive conclusions (not just decorative quotes)",
    "Grounded in OpenStax concepts (§1.2, §9.1, §12.1–12.2, §13.1, §17.2)",
    "Maintains concise length discipline near the ~400-word mark"
]


async def seed_postgres() -> uuid.UUID:
    async with AsyncSessionLocal() as session:
        # 0. Ensure Case Brief PDF is registered in course_documents
        brief_check = await session.execute(
            text("SELECT document_id FROM course_documents WHERE document_id = CAST(:did AS UUID)"),
            {"did": BRIEF_DOC_ID}
        )
        if not brief_check.mappings().first():
            brief_pdf_path = Path("storage/documents") / COURSE_ID / "dara_coffee_cart_brief.pdf"
            file_size = brief_pdf_path.stat().st_size if brief_pdf_path.exists() else 6432
            await session.execute(
                text("""
                    INSERT INTO course_documents (
                        document_id, course_id, title, filename, file_path, file_size,
                        mime_type, resource_type, source_url, created_at
                    ) VALUES (
                        CAST(:document_id AS UUID), CAST(:course_id AS UUID), :title, :filename, :file_path, :file_size,
                        :mime_type, :resource_type, :source_url, NOW()
                    )
                """),
                {
                    "document_id": BRIEF_DOC_ID,
                    "course_id": COURSE_ID,
                    "title": "Dara's Coffee Cart: Case Dossier & Survey",
                    "filename": "dara_coffee_cart_brief.pdf",
                    "file_path": f"documents/{COURSE_ID}/dara_coffee_cart_brief.pdf",
                    "file_size": file_size,
                    "mime_type": "application/pdf",
                    "resource_type": "pdf",
                    "source_url": None,
                }
            )
            logger.info(f"✓ Registered Case Brief PDF in course_documents ({BRIEF_DOC_ID})")

        # 1. Fetch Module 1 of BUS C150
        res = await session.execute(
            text("SELECT module_id, position, title FROM modules WHERE course_id = :cid AND position = 1"),
            {"cid": COURSE_ID}
        )
        mod = res.mappings().first()
        if not mod:
            raise RuntimeError(f"Module 1 not found for course {COURSE_ID}!")
        module_id = mod["module_id"]
        logger.info(f"Target Module 1: {mod['title']} (ID: {module_id})")

        # 2. Check for existing Dara assignment
        check_res = await session.execute(
            text("SELECT assignment_id, title FROM assignments WHERE module_id = :mid AND (title ILIKE '%Dara%' OR title ILIKE '%Coffee%')"),
            {"mid": module_id}
        )
        existing = check_res.mappings().first()

        assignment_id = existing["assignment_id"] if existing else uuid.uuid4()
        question_id = str(assignment_id)

        spec = {
            "title": ASSIGNMENT_TITLE,
            "domain": "Marketing and Business",
            "prompt": TASK_PROMPT,
            "status": "published",
            "question_id": question_id,
            "assignment_id": question_id,
            "target_kcs": ["c8", "c2", "c1"],
            "published": {
                "title": PUBLISHED_TITLE,
                "course_title": "BUS C150: Principles of Marketing",
                "department": "Department of Marketing & Strategic Management",
                "domain": "Marketing and Business",
                "purpose": "Formulate cohesive strategic advice on Product, Price, Place, and Promotion for an on-campus coffee cart, demonstrating how marketing mix decisions constrain and reinforce one another.",
                "learning_goals": [
                    "Identify the four Ps of the marketing mix and explain what each one covers (§1.2, p. 18).",
                    "Distinguish the core, actual, and augmented layers of a product to identify what the customer is really buying (§9.1, p. 308).",
                    "Set a price for a simple offering and defend it against cost, customers, and competition (§12.1–12.2, pp. 406, 411).",
                    "Select promotional methods appropriate to a business with almost no budget (§13.1, p. 438).",
                    "Organise short business advice as a connected argument in which one decision leads to the next (§1.2, p. 18)."
                ],
                "task": {
                    "prompt": TASK_PROMPT,
                    "scope": "OpenStax Principles of Marketing (2023): §1.2 (Marketing Mix & 4Ps), §9.1 (Product Layers), §12.1–12.2 (Pricing & 5 Cs), §13.1 (Promotion Mix), §17.2 (Channels).",
                    "deliverable": "A structured ~400-word advisory brief on the A4 Reasoning Canvas.",
                    "requirements": [
                        "All four decisions (Product, Price, Place, Promotion) must be explicitly made and defended.",
                        "Decide, do not survey: recommendations must be actionable advice rather than a list of options.",
                        "Ground reasons in the provided case numbers (costs, walk times, footfall, survey percentages).",
                        "Cite relevant OpenStax frameworks (e.g. §9.1 for product layers, §12.2 for the 5 Cs of pricing).",
                        "Showcase structural interdependence: how one decision constrains the next.",
                        "Maintain editorial discipline to keep the brief near 400 words."
                    ]
                },
                "source_pack": SOURCES,
                "public_rubric": RUBRIC,
                "start_options": START_OPTIONS,
                "support_menu": [
                    {"action_id": "hint", "title": "Request Socratic Hint", "description": "Get guided scaffolding without revealing the answer."},
                    {"action_id": "evidence", "title": "Verify Evidence Claim", "description": "Check if your reasoning claim is corroborated by case data or textbook principles."}
                ],
                "completion_checklist": COMPLETION_CHECKLIST,
                "integrity_notice": "Your educator evaluates the final submission. The Socratic study partner will assist your inquiry but is instructed never to reveal answers, name prices, choose locations, or write sentences for you."
            },
            "evaluation_plan": {
                "review_policy": "Flag isolated lists and uncorroborated assertions without punitive grading.",
                "support_policy": [
                    "Highlight ungrounded leaps in strategic reasoning",
                    "Step down Socratic hint ladder when cognitive traps are triggered (e.g. library footfall trap, menu bloat)"
                ],
                "public_rubric_map": [
                    {
                        "public_criterion_id": "rubric_advice_given",
                        "concept_ids": ["c8"],
                        "source_chunk_ids": [],
                        "evidence_expectation": "Decisive, actionable recommendations for all 4Ps with counter-options addressed."
                    },
                    {
                        "public_criterion_id": "rubric_case_reasoning",
                        "concept_ids": ["c8"],
                        "source_chunk_ids": [],
                        "evidence_expectation": "Rigorous quantitative grounding in unit margins, footfall, and survey trade-offs."
                    }
                ]
            }
        }

        if existing:
            update_sql = text("""
                UPDATE assignments
                SET title = :title, spec = :spec, created_at = NOW()
                WHERE assignment_id = :assignment_id
            """)
            await session.execute(update_sql, {
                "assignment_id": assignment_id,
                "title": ASSIGNMENT_TITLE,
                "spec": json.dumps(spec)
            })
            logger.info(f"✓ Updated existing assignment: {ASSIGNMENT_TITLE} (ID: {assignment_id})")
        else:
            insert_sql = text("""
                INSERT INTO assignments (
                    assignment_id, module_id, title, created_by, spec, created_at
                ) VALUES (
                    :assignment_id, :module_id, :title, :created_by, :spec, NOW()
                )
            """)
            await session.execute(insert_sql, {
                "assignment_id": assignment_id,
                "module_id": module_id,
                "title": ASSIGNMENT_TITLE,
                "created_by": "prof_somerville",
                "spec": json.dumps(spec)
            })
            logger.info(f"✓ Inserted new assignment: {ASSIGNMENT_TITLE} (ID: {assignment_id})")

        await session.commit()
        return assignment_id


async def seed_neo4j(assignment_id: uuid.UUID) -> None:
    async with neo4j_client.get_session() as n4j:
        # 1. Verify or create concept c8
        logger.info("Syncing Concept c8 (The Marketing Mix and the 4Ps of Marketing)...")
        await n4j.run("""
            MERGE (c:Concept {proposal_id: 'c8'})
            ON CREATE SET
                c.label = 'The Marketing Mix and the 4Ps of Marketing',
                c.name = 'The Marketing Mix and the 4Ps of Marketing',
                c.definition = 'Section 1.2, OpenStax Principles of Marketing. The 4Ps: Product, Price, Place, Promotion as an interdependent decision system.',
                c.concept_type = 'domain',
                c.level = 'topic',
                c.course_id = $cid
            ON MATCH SET
                c.label = 'The Marketing Mix and the 4Ps of Marketing',
                c.name = 'The Marketing Mix and the 4Ps of Marketing'
        """, {"cid": COURSE_ID})

        # 2. Connect Module to Concept
        await n4j.run("""
            MATCH (m:Module {course_id: $cid, position: 1})
            MATCH (c:Concept {proposal_id: 'c8'})
            MERGE (m)-[:INTRODUCES]->(c)
        """, {"cid": COURSE_ID})

        # 3. Create Misconceptions & Socratic Probe Ladders from the docx
        traps = [
            {
                "id": "trap_library_footfall",
                "name": "The Library Footfall Trap (Raw Footfall Fallacy)",
                "flawed_rule": "Prioritizing the highest footfall location (Library steps, 1,200) without accounting for competitor proximity (campus café is only 4 minutes away).",
                "probes": [
                    {"rung": 0, "probe_text": "Look closely at the library steps in the case data. What existing competitor is nearby, and how far must a student walk to reach it?"},
                    {"rung": 1, "probe_text": "If a student is already standing on the library steps, only 4 minutes from the café, what unique value or advantage is Dara delivering to justify buying from her cart instead?"},
                    {"rung": 2, "probe_text": "Compare the competitive alternatives between the Library (4-min walk) and the Science Block (11-min walk). If footfall without convenient competition is the real metric, which spot offers a defensible moat?"}
                ]
            },
            {
                "id": "trap_disjointed_4ps",
                "name": "The Disjointed Mix Fallacy (4P Silo Trap)",
                "flawed_rule": "Treating Product, Price, Place, and Promotion as four independent items on a checklist rather than decisions that constrain and dictate each other.",
                "probes": [
                    {"rung": 0, "probe_text": "Reflect on OpenStax §1.2: how does making a decision about your parking location immediately affect your pricing power?"},
                    {"rung": 1, "probe_text": "Notice how your decisions connect: if you park directly outside the library in competition with the café, what does that force you to do to your price and margin?"},
                    {"rung": 2, "probe_text": "Rather than listing four separate decisions, trace the causal chain: how does your choice of core value proposition directly determine what you sell, where you park, and what you charge?"}
                ]
            },
            {
                "id": "trap_menu_bloat",
                "name": "The Menu Bloat Trap (Destroying Service Speed)",
                "flawed_rule": "Adding sandwiches, pastries, and extensive food items to increase basket size without realizing that food preparation destroys service speed (the core convenience benefit).",
                "probes": [
                    {"rung": 0, "probe_text": "The survey notes that 62% of students want coffee between classes. What is their primary constraint during class changeovers?"},
                    {"rung": 1, "probe_text": "If Dara begins preparing and toasting food on a single cart, what happens to queue length and transaction speed during a brief 10-minute break?"},
                    {"rung": 2, "probe_text": "In OpenStax §9.1, what is the core product Dara is selling? If the core product is saved time, how does excluding food protect that value proposition?"}
                ]
            },
            {
                "id": "trap_superficial_arithmetic",
                "name": "Superficial Arithmetic (Break-Even without Strategic Inference)",
                "flawed_rule": "Calculating the €45 licence break-even (22.5 cups/week) as a decorative calculation without realizing that the licence is non-constraining.",
                "probes": [
                    {"rung": 0, "probe_text": "You calculated that €45 / €2.00 margin = 22.5 cups a week to break even. What does that tell you about whether the licence fee is a real constraint?"},
                    {"rung": 1, "probe_text": "Across a campus of 9,000 students, selling 23 cups a week covers fixed costs. If financial survival is readily achieved, what is the real operational constraint on Dara's revenue?"},
                    {"rung": 2, "probe_text": "Connect your break-even finding to your volume assumptions: how many transactions can Dara realistically serve in peak 15-minute inter-class windows?"}
                ]
            }
        ]

        for trap in traps:
            await n4j.run("""
                MERGE (t:Misconception {misconception_id: $tid})
                SET t.name = $name,
                    t.flawed_rule = $rule,
                    t.course_id = $cid
                WITH t
                MATCH (c:Concept {proposal_id: 'c8'})
                MERGE (t)-[:TARGETS_CONCEPT]->(c)
            """, {
                "tid": trap["id"],
                "name": trap["name"],
                "rule": trap["flawed_rule"],
                "cid": COURSE_ID
            })

            for p in trap["probes"]:
                await n4j.run("""
                    MATCH (t:Misconception {misconception_id: $tid})
                    MERGE (pr:SocraticProbe {probe_id: $pid})
                    SET pr.rung = $rung,
                        pr.probe_text = $text
                    MERGE (t)-[:HAS_PROBE]->(pr)
                """, {
                    "tid": trap["id"],
                    "pid": f"{trap['id']}_r{p['rung']}",
                    "rung": p["rung"],
                    "text": p["probe_text"]
                })

        logger.info(f"✓ Successfully hydrated Neo4j with {len(traps)} cognitive traps and Socratic probes for Concept c8.")


async def main() -> None:
    logger.info("🚀 Starting Dara's Coffee Cart seeding pipeline...")
    assignment_id = await seed_postgres()
    await seed_neo4j(assignment_id)
    logger.info("🎉 Seeding complete! Dara's Coffee Cart is live in BUS C150 Module 1.")


if __name__ == "__main__":
    asyncio.run(main())
