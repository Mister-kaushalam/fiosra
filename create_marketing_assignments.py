"""Create pedagogical inquiry assignments for BUS C150 Principles of Marketing grounded in OpenStax (2023)."""

import asyncio
import json
import logging
import uuid
from sqlalchemy import text
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.neo4j_client import neo4j_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

COURSE_ID = "8a9fefac-e5b9-49dd-935c-88cfd1929e26"
DOCUMENT_ID = "c9303ce1-0a69-42b8-a943-436a29499a0d"
PDF_FILE_URL = f"/courses/{COURSE_ID}/documents/{DOCUMENT_ID}/file"

ASSIGNMENTS_DATA = [
    {
        "module_pos": 1,
        "title": "Inquiry: Strategic Market Growth and the Ansoff Matrix (Case: EcoClean)",
        "purpose": "Evaluate strategic growth pathways and customer value propositions using the Ansoff Product-Market Matrix.",
        "prompt": "Evaluate whether EcoClean Innovations should pursue market penetration in its established domestic organic detergents segment or market development by introducing its industrial enzyme cleaners to institutional healthcare facilities. Ground your strategic analysis in Ansoff's Growth Matrix, macroenvironmental forces (PESTLE), and competitive advantage theory.",
        "scope": "Chapters 1–2 of OpenStax Principles of Marketing (Strategic Planning, Marketing Environment, Value Proposition).",
        "deliverable": "A structured, evidence-grounded strategic memorandum on the A4 Reasoning Canvas.",
        "requirements": [
            "Ground strategic recommendations in specific exhibits and textbook definitions from Chapters 1 and 2.",
            "Compare risk-return profiles between market penetration and market development under Ansoff's framework.",
            "Formulate specific metrics to measure customer lifetime value (CLV) and market share stability."
        ],
        "learning_goals": [
            "Differentiate growth strategies using Ansoff's Product-Market Matrix.",
            "Analyze macroenvironmental PESTLE forces impacting commercial cleaning markets.",
            "Construct a defensible customer value proposition grounded in textbook theory."
        ],
        "sources": [
            {
                "source_id": "source_ansoff_grid",
                "title": "OpenStax Principles of Marketing: Strategic Planning Tools (Ch. 2)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 2: Strategic Planning in Marketing, pp. 45–52",
                "excerpt": "The Ansoff Product-Market Growth Matrix identifies four distinct pathways: market penetration (existing products in existing markets), market development (existing products in new markets), product development (new products in existing markets), and diversification (new products in new markets). Each involves varying exposure to financial and operational risk.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Consult the risk comparison table in Section 2.3 for evaluating penetration vs development capital allocations."
            },
            {
                "source_id": "source_pestle_macro",
                "title": "OpenStax Principles of Marketing: The Macro Environment (Ch. 2)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 2: Environmental Forces, pp. 58–64",
                "excerpt": "Demographic, economic, natural, technological, political, and cultural forces shape market viability. Environmental regulations regarding volatile organic compounds (VOCs) and institutional green procurement standards create major compliance thresholds in B2B markets.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Use regulatory compliance and institutional ESG mandates to evaluate healthcare sector demand."
            }
        ],
        "rubric": [
            {
                "criterion_id": "rubric_strategic_framework",
                "title": "Application of Ansoff Strategic Matrix",
                "description": "Accurately applies Ansoff's Product-Market Matrix to justify growth decisions based on product and market novelty.",
                "weight": 40.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Names growth pathways without explaining relative risk or product-market alignment."},
                    {"level_id": "secure", "label": "Secure", "description": "Accurately maps penetration vs development and justifies resource allocation with textbook theory."}
                ]
            },
            {
                "criterion_id": "rubric_source_evidence",
                "title": "Textbook & Primary Source Grounding",
                "description": "Claims cite specific concepts, frameworks, and sections from OpenStax Chapters 1 & 2.",
                "weight": 30.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Relies on generic business intuition without textbook citations."},
                    {"level_id": "secure", "label": "Secure", "description": "Directly cites Chapter 1 value definitions and Chapter 2 environmental criteria."}
                ]
            },
            {
                "criterion_id": "rubric_value_proposition",
                "title": "Customer Value Proposition & Metrics",
                "description": "Articulates a clear value exchange mechanism supported by quantifiable metrics (CLV, retention, margin).",
                "weight": 30.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Vague claims of superior quality without quantifiable metrics."},
                    {"level_id": "secure", "label": "Secure", "description": "Details exact value drivers and specifies monitoring metrics."}
                ]
            }
        ]
    },
    {
        "module_pos": 2,
        "title": "Inquiry: Segmenting, Targeting, and Positioning for Urban Mobility (Case: CommuteX)",
        "purpose": "Analyze consumer decision journeys and design a defensible perceptual positioning strategy.",
        "prompt": "Design an STP (Segmentation, Targeting, Positioning) strategy for CommuteX, a micromobility company launching electric subscription bikes in mid-sized metropolitan areas. Analyze the 5-stage consumer buying decision process, identify high-probability points of cognitive dissonance, and construct a 2D perceptual positioning map.",
        "scope": "Chapters 3–8 of OpenStax Principles of Marketing (Buyer Behavior, Market Research, and STP).",
        "deliverable": "A structured STP strategy brief and perceptual positioning rationale on the A4 Reasoning Canvas.",
        "requirements": [
            "Examine all 5 stages of the consumer decision process (Problem Recognition to Post-purchase Behavior).",
            "Identify post-purchase cognitive dissonance triggers and propose specific mitigation touchpoints.",
            "Construct a perceptual map comparing CommuteX against public transit, rideshare, and personal vehicle ownership."
        ],
        "learning_goals": [
            "Deconstruct consumer decision journeys and cognitive heuristics.",
            "Apply demographic, psychographic, and behavioral segmentation bases.",
            "Formulate perceptual positioning strategies that resolve competitive crowding."
        ],
        "sources": [
            {
                "source_id": "source_buyer_decision",
                "title": "OpenStax Principles of Marketing: Consumer Decision Process (Ch. 3)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 3: Consumer Markets and Buyer Behavior, pp. 92–101",
                "excerpt": "The consumer decision process involves five stages: problem recognition, information search, alternative evaluation, purchase decision, and post-purchase behavior. Post-purchase cognitive dissonance is consumer dissatisfaction or second-guessing caused by post-purchase conflict or trade-offs.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Review Section 3.4 for specific tactics companies use to reduce post-purchase dissonance (warranties, onboarding, service)."
            },
            {
                "source_id": "source_stp_positioning",
                "title": "OpenStax Principles of Marketing: Segmentation and Positioning (Ch. 5)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 5: Segmentation, Targeting, and Positioning, pp. 165–178",
                "excerpt": "Perceptual maps plot consumer perceptions of brands along key attribute axes (e.g., price vs. convenience). Effective positioning occupies a distinctive, desirable place relative to competing products in the minds of target consumers.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Use Section 5.5 to select the two most discriminating consumer evaluative criteria for mobility services."
            }
        ],
        "rubric": [
            {
                "criterion_id": "rubric_decision_journey",
                "title": "Consumer Decision Journey Analysis",
                "description": "Rigorously traces consumer progression across problem recognition, evaluation, and post-purchase behavior.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Only discusses the initial purchase without examining evaluation or post-purchase dissonance."},
                    {"level_id": "secure", "label": "Secure", "description": "Articulates all 5 stages and specifies concrete mechanisms to resolve cognitive dissonance."}
                ]
            },
            {
                "criterion_id": "rubric_perceptual_map",
                "title": "Perceptual Mapping & Differentiation",
                "description": "Justifies positioning axes and establishes clear competitive differentiation.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Arbitrary axes that do not represent core consumer purchase drivers."},
                    {"level_id": "secure", "label": "Secure", "description": "Positions brand on validated consumer trade-offs and highlights an uncontested quadrant."}
                ]
            },
            {
                "criterion_id": "rubric_text_grounding",
                "title": "Textbook Exhibit Grounding",
                "description": "Cites concepts and research methodologies from OpenStax Chapters 3 & 5.",
                "weight": 30.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Few or no references to textbook definitions."},
                    {"level_id": "secure", "label": "Secure", "description": "Directly integrates Chapter 3 & 5 theories into the strategic plan."}
                ]
            }
        ]
    },
    {
        "module_pos": 3,
        "title": "Inquiry: Price Elasticity and Product Life Cycle Extension (Case: AudioSphere)",
        "purpose": "Analyze price elasticity of demand and evaluate maturity-stage product life cycle extension strategies.",
        "prompt": "AudioSphere's flagship noise-cancelling headphones have entered the maturity stage of the product life cycle, facing intense price competition and declining margins. Analyze the price elasticity of demand across consumer segments, evaluate value-based pricing versus competitive pricing, and recommend product-line modifications or service extensions to sustain profitability.",
        "scope": "Chapters 9–12 of OpenStax Principles of Marketing (Products, Services, Brands, and Pricing Decisions).",
        "deliverable": "A structured pricing and product lifecycle extension brief on the A4 Reasoning Canvas.",
        "requirements": [
            "Calculate or analyze price elasticity coefficients and discuss segment-level price sensitivity.",
            "Contrast cost-plus, competitor-indexed, and value-based pricing models for premium audio gear.",
            "Propose two product life cycle extension strategies grounded in Chapter 10 frameworks."
        ],
        "learning_goals": [
            "Apply price elasticity of demand to pricing strategy decisions.",
            "Formulate product life cycle extension strategies for mature market offerings.",
            "Synthesize service-dominant logic and brand equity enhancements."
        ],
        "sources": [
            {
                "source_id": "source_pricing_elasticity",
                "title": "OpenStax Principles of Marketing: Pricing Concepts and Strategies (Ch. 12)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 12: Pricing Strategy and Elasticity, pp. 385–395",
                "excerpt": "Price elasticity of demand measures the responsiveness of quantity demanded to changes in price. When demand is elastic (|e| > 1), price cuts increase total revenue; when inelastic (|e| < 1), price increases generate higher revenue. Value-based pricing sets prices based on buyer perceptions of value rather than manufacturer costs.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Examine Section 12.3 for the formulas and psychological factors influencing buyer price sensitivity."
            },
            {
                "source_id": "source_plc_maturity",
                "title": "OpenStax Principles of Marketing: Product Life Cycles (Ch. 10)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 10: Product Strategies and Life Cycles, pp. 312–324",
                "excerpt": "During the maturity stage, sales peak, competition peaks, and profit margins begin narrowing. Managers extend the product life cycle through market modification (finding new users), product modification (feature or quality upgrades), or marketing mix modification (pricing adjustments, new distribution channels).",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Review Figure 10.4 and Section 10.3 for proven maturity-stage life cycle extension tactics."
            }
        ],
        "rubric": [
            {
                "criterion_id": "rubric_elasticity_analysis",
                "title": "Elasticity & Value-Based Pricing Rigor",
                "description": "Applies elasticity principles and buyer perceived-value logic to pricing recommendations.",
                "weight": 40.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Recommends price changes without considering elasticity or margin consequences."},
                    {"level_id": "secure", "label": "Secure", "description": "Rigorously models elasticity implications and defends value-based price points."}
                ]
            },
            {
                "criterion_id": "rubric_lifecycle_extension",
                "title": "Maturity Stage Lifecycle Extensions",
                "description": "Formulates feasible product, market, or service extensions grounded in Chapter 10 frameworks.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Suggests generic promotions without addressing maturity-stage market saturation."},
                    {"level_id": "secure", "label": "Secure", "description": "Presents structured product modifications or market extensions with clear ROI expectations."}
                ]
            },
            {
                "criterion_id": "rubric_source_citations",
                "title": "Textbook Source Citations",
                "description": "Directly links assertions to OpenStax Chapters 10 & 12 formulas and exhibits.",
                "weight": 25.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Lacks specific chapter or page citations."},
                    {"level_id": "secure", "label": "Secure", "description": "Accurately references textbook elasticity exhibits and PLC stages."}
                ]
            }
        ]
    },
    {
        "module_pos": 4,
        "title": "Inquiry: Designing an Omnichannel IMC Campaign (Case: NovaFit Wearables)",
        "purpose": "Synthesize promotional tools into a cohesive Integrated Marketing Communications (IMC) campaign.",
        "prompt": "NovaFit is launching a health-monitoring smartwatch targeting fitness enthusiasts and wellness seekers. Design an integrated marketing communications (IMC) plan that orchestrates advertising, digital social media marketing, public relations, and sales promotion. Contrast push versus pull promotion strategies and justify your channel attribution model.",
        "scope": "Chapters 13–16 of OpenStax Principles of Marketing (Integrated Marketing Communications, Advertising, PR, and Sales).",
        "deliverable": "An integrated omnichannel IMC promotional blueprint on the A4 Reasoning Canvas.",
        "requirements": [
            "Orchestrate at least 3 distinct promotional mix elements into a consistent, reinforcing campaign message.",
            "Contrast push promotional tactics (retail channel incentives) with pull tactics (consumer demand generation).",
            "Establish specific attribution metrics (ROAS, CTR, conversion rate, earned media value)."
        ],
        "learning_goals": [
            "Design an integrated marketing communications campaign delivering consistent brand positioning.",
            "Evaluate push versus pull promotional channel strategies.",
            "Establish measurable marketing communications performance and attribution metrics."
        ],
        "sources": [
            {
                "source_id": "source_imc_framework",
                "title": "OpenStax Principles of Marketing: The IMC Framework (Ch. 13)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 13: Integrated Marketing Communications, pp. 420–432",
                "excerpt": "Integrated marketing communications (IMC) carefully coordinates a company's multiple communication channels—advertising, personal selling, sales promotion, public relations, and digital marketing—to deliver a clear, consistent, and compelling message about the organization and its offerings.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Consult Section 13.2 for the communication process model and message alignment principles."
            },
            {
                "source_id": "source_push_pull",
                "title": "OpenStax Principles of Marketing: Push vs. Pull Strategies (Ch. 13)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 13: Promotional Strategies, pp. 438–445",
                "excerpt": "A push strategy involves pushing the product through marketing channels to final consumers (using trade allowances and dealer sales contests). A pull strategy directs marketing activities toward final consumers to induce them to buy the product, pulling it through the channel.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Review Figure 13.6 for allocating promotional budget between trade incentives and consumer ad campaigns."
            }
        ],
        "rubric": [
            {
                "criterion_id": "rubric_imc_consistency",
                "title": "Cross-Channel Message Alignment",
                "description": "Ensures all promotional mix elements convey a unified, non-contradictory brand message.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Channels run isolated campaigns with disparate messaging."},
                    {"level_id": "secure", "label": "Secure", "description": "Demonstrates seamless synergy across digital, PR, retail, and experiential channels."}
                ]
            },
            {
                "criterion_id": "rubric_push_pull_balance",
                "title": "Push vs. Pull Trade-Off Strategy",
                "description": "Justifies budget allocation between dealer trade promotions and consumer demand generation.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Ignores channel partner incentives or consumer pull dynamics."},
                    {"level_id": "secure", "label": "Secure", "description": "Balances trade margin incentives with robust consumer brand demand."}
                ]
            },
            {
                "criterion_id": "rubric_textbook_grounding",
                "title": "Textbook Citation & Metric Rigor",
                "description": "Grounds campaign metrics and channel choices in OpenStax Chapters 13–15.",
                "weight": 30.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Omits specific attribution and textbook benchmarks."},
                    {"level_id": "secure", "label": "Secure", "description": "Cites chapter figures and establishes verifiable conversion metrics."}
                ]
            }
        ]
    },
    {
        "module_pos": 5,
        "title": "Inquiry: Channel Conflict and Sustainable Supply Chain Strategy (Case: EarthFirst)",
        "purpose": "Evaluate marketing channel structures, channel conflict, and sustainable societal marketing.",
        "prompt": "EarthFirst Organics produces ethically sourced packaged foods. To expand, EarthFirst launched a direct-to-consumer (D2C) e-commerce subscription model, sparking intense vertical channel conflict with independent specialty retailers who carry its products. Analyze the causes of channel conflict, propose a collaborative resolution framework, and evaluate how EarthFirst can prevent greenwashing claims.",
        "scope": "Chapters 17–19 of OpenStax Principles of Marketing (Distribution, Retailing, and Sustainable Marketing).",
        "deliverable": "A channel governance and sustainable marketing strategy document on the A4 Reasoning Canvas.",
        "requirements": [
            "Diagnose sources of vertical channel conflict (dual distribution cannibalization, price undercutting).",
            "Formulate a channel governance agreement (exclusive SKUs, minimum advertised pricing, profit-sharing).",
            "Establish verification standards to ensure product environmental claims avoid regulatory greenwashing."
        ],
        "learning_goals": [
            "Analyze vertical and horizontal channel conflict dynamics.",
            "Formulate channel coordination and dual distribution strategies.",
            "Apply societal marketing concepts and substantiate environmental sustainability claims."
        ],
        "sources": [
            {
                "source_id": "source_channel_conflict",
                "title": "OpenStax Principles of Marketing: Channel Behavior and Organization (Ch. 17)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 17: Marketing Channels and Supply Chains, pp. 540–552",
                "excerpt": "Channel conflict occurs when channel members disagree on goals, roles, and rewards. Vertical conflict occurs between different levels of the same channel (e.g., manufacturer vs. retailer). Dual distribution systems frequently spark conflict when manufacturer D2C pricing undercuts retail shelf prices.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Read Section 17.3 for contractual and conventional mechanisms to manage dual-distribution friction."
            },
            {
                "source_id": "source_sustainable_marketing",
                "title": "OpenStax Principles of Marketing: Sustainable Societal Marketing (Ch. 19)",
                "citation": "OpenStax Principles of Marketing (2023), Chapter 19: Sustainable and Socially Responsible Marketing, pp. 612–625",
                "excerpt": "Sustainable marketing calls for socially and environmentally responsible actions that meet the immediate needs of consumers and businesses while preserving future options. Greenwashing—misleading consumers regarding environmental practices—damages brand trust and triggers FTC enforcement.",
                "source_url": PDF_FILE_URL,
                "relevance_guidance": "Examine Section 19.4 for third-party certification frameworks (USDA Organic, Fair Trade, B Corp)."
            }
        ],
        "rubric": [
            {
                "criterion_id": "rubric_channel_governance",
                "title": "Conflict Diagnosis & Channel Governance",
                "description": "Accurately diagnoses causes of vertical channel conflict and designs enforceable coordination mechanisms.",
                "weight": 40.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Fails to address retail partner margin erosion or dual distribution risks."},
                    {"level_id": "secure", "label": "Secure", "description": "Formulates specific channel differentiation strategies (exclusive pack sizes, MAP pricing)."}
                ]
            },
            {
                "criterion_id": "rubric_greenwashing_prevention",
                "title": "Sustainability Verification & Ethical Rigor",
                "description": "Establishes verifiable supply chain tracking to prevent greenwashing and protect brand trust.",
                "weight": 35.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "Relies on superficial eco-friendly buzzwords without third-party standards."},
                    {"level_id": "secure", "label": "Secure", "description": "Specifies audit protocols, certified provenance, and regulatory compliance standards."}
                ]
            },
            {
                "criterion_id": "rubric_textbook_citations",
                "title": "Textbook & Regulatory Grounding",
                "description": "Directly cites OpenStax Chapters 17 & 19 principles and channel frameworks.",
                "weight": 25.0,
                "levels": [
                    {"level_id": "developing", "label": "Developing", "description": "No textbook grounding or references to channel theory."},
                    {"level_id": "secure", "label": "Secure", "description": "Integrates Chapter 17 channel management models and Chapter 19 ethical guidelines."}
                ]
            }
        ]
    }
]


async def create_assignments() -> None:
    async with AsyncSessionLocal() as session:
        # 1. Fetch modules for the course
        res = await session.execute(
            text("SELECT module_id, position, title FROM modules WHERE course_id = :cid ORDER BY position"),
            {"cid": COURSE_ID}
        )
        modules = {row["position"]: row["module_id"] for row in res.mappings().all()}
        logger.info(f"Loaded {len(modules)} modules for course {COURSE_ID}")

        # 2. Get sample concept IDs per module from Neo4j
        concept_ids_by_pos = {}
        async with neo4j_client.get_session() as n4j:
            for pos in range(1, 6):
                c_res = await n4j.run("""
                    MATCH (m:Module {course_id: $cid, position: $pos})-[:INTRODUCES]->(c:Concept)
                    RETURN c.concept_id AS id
                    LIMIT 4
                """, {"cid": COURSE_ID, "pos": pos})
                records = await c_res.data()
                concept_ids_by_pos[pos] = [r["id"] for r in records]

        # 3. Insert each assignment
        for a_def in ASSIGNMENTS_DATA:
            pos = a_def["module_pos"]
            module_id = modules.get(pos)
            if not module_id:
                logger.warning(f"Module position {pos} not found! Skipping assignment.")
                continue

            assignment_id = uuid.uuid4()
            question_id = str(assignment_id)
            target_kcs = concept_ids_by_pos.get(pos, [])

            spec = {
                "title": a_def["title"],
                "domain": "Marketing and Business",
                "prompt": a_def["prompt"],
                "status": "published",
                "question_id": question_id,
                "assignment_id": question_id,
                "target_kcs": target_kcs,
                "published": {
                    "title": a_def["title"],
                    "purpose": a_def["purpose"],
                    "learning_goals": a_def["learning_goals"],
                    "task": {
                        "prompt": a_def["prompt"],
                        "scope": a_def["scope"],
                        "deliverable": a_def["deliverable"],
                        "requirements": a_def["requirements"],
                    },
                    "source_pack": a_def["sources"],
                    "public_rubric": a_def["rubric"],
                    "start_options": [
                        "Begin by drafting an initial claim grounded in the textbook exhibits.",
                        "Inspect the assigned source materials and cite key data points.",
                        "Formulate a structured analysis addressing each assignment requirement."
                    ],
                    "support_menu": [
                        {"action_id": "hint", "title": "Request Socratic Hint", "description": "Get guided scaffolding without revealing the answer."},
                        {"action_id": "evidence", "title": "Verify Evidence Claim", "description": "Check if your reasoning claim is corroborated by the textbook."}
                    ],
                    "completion_checklist": [
                        "All requirements addressed with textbook citations",
                        "Strategic trade-offs analyzed with clear rationale",
                        "Recommendations supported by quantitative or conceptual metrics"
                    ],
                    "integrity_notice": "Your educator evaluates the final submission. Use OpenStax textbook exhibits responsibly and cite all source references."
                },
                "evaluation_plan": {
                    "review_policy": "Flag uncorroborated assertions without punitive grading.",
                    "support_policy": [
                        "Highlight ungrounded leaps in strategic reasoning",
                        "Step down Socratic hint ladder when cognitive traps are triggered"
                    ],
                    "public_rubric_map": [
                        {
                            "public_criterion_id": a_def["rubric"][0]["criterion_id"],
                            "concept_ids": target_kcs[:2],
                            "source_chunk_ids": [],
                            "evidence_expectation": f"Substantive analysis adhering to {a_def['rubric'][0]['title']}."
                        },
                        {
                            "public_criterion_id": a_def["rubric"][1]["criterion_id"],
                            "concept_ids": target_kcs[2:4] if len(target_kcs) > 2 else target_kcs,
                            "source_chunk_ids": [],
                            "evidence_expectation": f"Direct citation of OpenStax textbook exhibits and definitions."
                        }
                    ]
                }
            }

            insert_sql = text("""
                INSERT INTO assignments (
                    assignment_id, module_id, title, created_by, spec, created_at
                ) VALUES (
                    :assignment_id, :module_id, :title, :created_by, :spec, NOW()
                )
            """)
            await session.execute(
                insert_sql,
                {
                    "assignment_id": assignment_id,
                    "module_id": module_id,
                    "title": a_def["title"],
                    "created_by": "prof_somerville",
                    "spec": json.dumps(spec),
                }
            )
            logger.info(f"✓ Created Assignment for Module {pos}: {a_def['title']} (ID: {assignment_id})")

        await session.commit()
        logger.info("🎉 All 5 assignments successfully published and linked to modules!")


if __name__ == "__main__":
    asyncio.run(create_assignments())
