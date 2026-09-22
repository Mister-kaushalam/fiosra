#!/usr/bin/env python3
"""Attach the Coffee Cart assignment's cognitive traps to the real 4Ps concept.

Why this exists
---------------
scripts/seed_daras_coffee_cart.py seeded its traps against a concept matched by
`MERGE (c:Concept {proposal_id: 'c8'})`. Concepts are actually merged on
{course_id, canonical_key} and never carry proposal_id, so that MERGE created a
brand new orphan node rather than finding the real concept. The traps were then
attached to the orphan with [:TARGETS_CONCEPT] and [:HAS_PROBE], while the
concept-graph query reads [:ASSOCIATED_WITH] and [:PROBED_BY] from a
:KnowledgeComponent. Three mismatches, one result: the traps are in Neo4j and
invisible everywhere.

This script re-attaches the same teaching material using the canonical shape
written by ConceptGraphService.approve_proposal, so the traps appear on the
curriculum graph, in the concept drawer, and anywhere else that reads the
standard relationships.

Run it inside the app container (./fiosra is mounted there):

    docker compose exec app python -m fiosra.mvp.seed_coffee_cart_graph

Add --remove-orphan to also delete the stray proposal_id:'c8' node and the
duplicate traps hanging off it. That deletes data, so it is off by default.
"""

import argparse
import asyncio
import logging

from fiosra.mvp.neo4j_client import neo4j_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

COURSE_ID = "8a9fefac-e5b9-49dd-935c-88cfd1929e26"

# Matched by label inside the course rather than by proposal_id, which is the
# bug this script exists to undo. Verified present as
# concept_id 4375e29e-c040-5ff0-bef2-8780e3c95d2e.
CONCEPT_LABEL = "The Marketing Mix and the 4Ps of Marketing"

# The cart owner is deliberately unnamed. The artifact calls her Moras and the
# seeded Postgres assignment still calls her Dara; keeping the graph neutral
# means it reads correctly either way and needs no edit when that is settled.
TRAPS = [
    {
        "name": "The Library Footfall Trap (Raw Footfall Fallacy)",
        "flawed_rule": (
            "Choosing the highest-footfall location (Library steps, 1,200 a day) without "
            "accounting for competitor proximity — the campus cafe is a 4 minute walk away."
        ),
        "remediation_hint": (
            "Footfall counts people passing, not people who will buy. Section 17.2 "
            "(printed page 582) treats a location's value as its traffic set against the ease "
            "of the nearest alternative. Compare each spot's footfall with the walk to the cafe."
        ),
        "probes": [
            (0, "Look closely at the library steps in the case data. What existing competitor is "
                "nearby, and how far must a student walk to reach it?"),
            (1, "If a student is already standing on the library steps, 4 minutes from the cafe, "
                "what advantage is the cart offering that justifies buying there instead?"),
            (2, "Compare the alternatives at the Library (4 minute walk) and the Science block "
                "(11 minutes). If the real metric is footfall without convenient competition, "
                "which spot is more defensible?"),
        ],
    },
    {
        "name": "The Disjointed Mix Fallacy (4P Silo Trap)",
        "flawed_rule": (
            "Treating Product, Price, Place and Promotion as four independent checklist items "
            "rather than decisions that constrain one another."
        ),
        "remediation_hint": (
            "Section 1.2 (printed page 18) presents the marketing mix as one interdependent "
            "system. Each of the four decisions narrows what the other three can be, which is "
            "why an essay that lists them separately reads as four answers rather than one."
        ),
        "probes": [
            (0, "Reflect on section 1.2: how does a decision about where to park immediately "
                "affect pricing power?"),
            (1, "If the cart parks outside the library in direct competition with the cafe, what "
                "does that force the price, and the margin, to do?"),
            (2, "Instead of listing four separate decisions, trace the chain: how does the choice "
                "of core value proposition determine what is sold, where it parks and what it charges?"),
        ],
    },
    {
        "name": "The Menu Bloat Trap (Destroying Service Speed)",
        "flawed_rule": (
            "Adding sandwiches, pastries and hot food to raise basket size, without seeing that "
            "food preparation destroys service speed — the core benefit being sold."
        ),
        "remediation_hint": (
            "Section 9.1 (printed page 308) separates the core benefit from the augmented "
            "product. When the core benefit is saved time, anything that lengthens the queue "
            "attacks the product itself rather than extending it."
        ),
        "probes": [
            (0, "The survey notes 62% of students would buy coffee between classes. What is their "
                "binding constraint during a changeover?"),
            (1, "If the cart starts preparing and toasting food, what happens to queue length and "
                "transaction speed inside a 10 minute break?"),
            (2, "In section 9.1, what is the core product here? If the core product is saved time, "
                "how does leaving food off the cart protect it?"),
        ],
    },
    {
        "name": "Superficial Arithmetic (Break-Even without Strategic Inference)",
        "flawed_rule": (
            "Computing the EUR 45 licence break-even (22.5 cups a week) as a decorative "
            "calculation, without drawing the inference that the licence is not the binding constraint."
        ),
        "remediation_hint": (
            "Sections 12.1 and 12.2 (printed pages 406 and 411) treat a break-even figure as an "
            "input to a pricing decision, not as the decision. The question to put to any number "
            "is what it rules in or out."
        ),
        "probes": [
            (0, "You worked out that EUR 45 divided by a EUR 2.00 margin is about 23 cups a week "
                "to break even. What does that tell you about whether the licence fee is a real constraint?"),
            (1, "Across 9,000 students, 23 cups a week covers the fixed cost. If survival is that "
                "easily reached, what is the actual operational limit on revenue?"),
            (2, "Connect the break-even figure to your volume assumptions: how many transactions "
                "can one cart realistically serve in a peak 15 minute window between classes?"),
        ],
    },
]

# Canonical shape, copied from ConceptGraphService.approve_proposal so that this
# material is indistinguishable from concepts authored through the product.
ATTACH_TRAP = """
MATCH (k:Concept {course_id: $course_id})
WHERE k.label = $concept_label
SET k:KnowledgeComponent, k.kc_id = coalesce(k.kc_id, k.concept_id)
MERGE (m:Misconception {course_id: $course_id, flawed_rule: $flawed_rule})
ON CREATE SET m.misconception_id = $misc_id,
    m.kc_id = k.kc_id,
    m.name = $name,
    m.flawed_rule = $flawed_rule,
    m.remediation_hint = $remediation_hint,
    m.status = 'approved',
    m.created_at = datetime(),
    m.updated_at = datetime()
ON MATCH SET m.name = $name,
    m.kc_id = k.kc_id,
    m.remediation_hint = $remediation_hint,
    m.status = 'approved',
    m.updated_at = datetime()
MERGE (k)-[:ASSOCIATED_WITH]->(m)
RETURN m.misconception_id AS misconception_id, k.concept_id AS concept_id
"""

ATTACH_PROBE = """
MATCH (m:Misconception {misconception_id: $misconception_id, course_id: $course_id})
MERGE (p:SocraticProbe {course_id: $course_id, probe_text: $probe_text})
ON CREATE SET p.probe_id = $probe_id,
    p.misconception_id = $misconception_id,
    p.kc_id = m.kc_id,
    p.rung = $rung,
    p.probe_text = $probe_text,
    p.rationale = $rationale,
    p.status = 'approved',
    p.created_at = datetime(),
    p.updated_at = datetime()
ON MATCH SET p.rung = $rung,
    p.misconception_id = $misconception_id,
    p.kc_id = m.kc_id,
    p.rationale = $rationale,
    p.status = 'approved',
    p.updated_at = datetime()
MERGE (m)-[:PROBED_BY]->(p)
"""

RUNG_RATIONALE = {
    0: "Rung 0, metacognitive reflection: surfaces the unstated premise before any evidence is weighed.",
    1: "Rung 1, conceptual confrontation: points at the case evidence that contradicts the flawed rule.",
    2: "Rung 2, evaluative synthesis: asks for a revised position that accounts for both sides.",
}


def slug(text: str) -> str:
    keep = [c if c.isalnum() else "_" for c in text.upper()]
    out = "".join(keep)
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")[:48]


async def verify(session) -> None:
    """Report what the concept-graph query will actually return for this concept."""
    result = await session.run(
        """
        MATCH (k:KnowledgeComponent {course_id: $course_id})-[:ASSOCIATED_WITH]->(m:Misconception)
        WHERE k.label = $concept_label
        OPTIONAL MATCH (m)-[:PROBED_BY]->(p:SocraticProbe)
        RETURN k.concept_id AS concept_id, count(DISTINCT m) AS traps, count(DISTINCT p) AS probes
        """,
        {"course_id": COURSE_ID, "concept_label": CONCEPT_LABEL},
    )
    row = await result.single()
    if not row or not row["traps"]:
        logger.error("Verification FAILED: the concept-graph query still returns no traps.")
        return
    logger.info(
        "Verified via the same pattern the API uses: concept %s now returns %d traps and %d probes.",
        row["concept_id"], row["traps"], row["probes"],
    )


async def remove_orphan(session) -> None:
    result = await session.run(
        """
        MATCH (c:Concept {proposal_id: 'c8'})
        OPTIONAL MATCH (c)<-[:TARGETS_CONCEPT]-(t:Misconception)
        OPTIONAL MATCH (t)-[:HAS_PROBE]->(p:SocraticProbe)
        WITH collect(DISTINCT c) AS cs, collect(DISTINCT t) AS ts, collect(DISTINCT p) AS ps
        RETURN size(cs) AS concepts, size(ts) AS traps, size(ps) AS probes
        """
    )
    row = await result.single()
    if not row or not row["concepts"]:
        logger.info("No orphan proposal_id:'c8' node found; nothing to remove.")
        return
    logger.warning(
        "Removing orphan node and its %d traps / %d probes.", row["traps"], row["probes"]
    )
    await session.run(
        """
        MATCH (c:Concept {proposal_id: 'c8'})
        OPTIONAL MATCH (c)<-[:TARGETS_CONCEPT]-(t:Misconception)
        OPTIONAL MATCH (t)-[:HAS_PROBE]->(p:SocraticProbe)
        DETACH DELETE p, t, c
        """
    )
    logger.info("Orphan removed.")


async def main(also_remove_orphan: bool) -> None:
    async with neo4j_client.get_session() as session:
        check = await session.run(
            "MATCH (k:Concept {course_id: $course_id}) WHERE k.label = $concept_label "
            "RETURN k.concept_id AS concept_id, count(*) AS matches",
            {"course_id": COURSE_ID, "concept_label": CONCEPT_LABEL},
        )
        row = await check.single()
        if not row:
            logger.error("Concept %r not found in course %s. Nothing written.", CONCEPT_LABEL, COURSE_ID)
            return
        logger.info("Target concept: %s (%s)", CONCEPT_LABEL, row["concept_id"])

        for trap in TRAPS:
            misc_id = f"MISC_{slug(trap['name'])}_COFFEECART"
            result = await session.run(
                ATTACH_TRAP,
                {
                    "course_id": COURSE_ID,
                    "concept_label": CONCEPT_LABEL,
                    "misc_id": misc_id,
                    "name": trap["name"],
                    "flawed_rule": trap["flawed_rule"],
                    "remediation_hint": trap["remediation_hint"],
                },
            )
            attached = await result.single()
            if not attached:
                logger.error("Could not attach trap %r.", trap["name"])
                continue
            actual_id = attached["misconception_id"]
            logger.info("  trap attached: %s", trap["name"])

            for rung, text in trap["probes"]:
                await session.run(
                    ATTACH_PROBE,
                    {
                        "course_id": COURSE_ID,
                        "misconception_id": actual_id,
                        "probe_id": f"PROBE_{slug(trap['name'])[:24]}_R{rung}",
                        "rung": rung,
                        "probe_text": text,
                        "rationale": RUNG_RATIONALE[rung],
                    },
                )
            logger.info("    %d probes attached (rungs 0-2)", len(trap["probes"]))

        if also_remove_orphan:
            await remove_orphan(session)

        await verify(session)

    await neo4j_client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--remove-orphan",
        action="store_true",
        help="Also delete the stray proposal_id:'c8' node and the duplicate traps on it.",
    )
    args = parser.parse_args()
    asyncio.run(main(args.remove_orphan))
