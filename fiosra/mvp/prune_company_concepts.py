#!/usr/bin/env python3
"""Retire the auto-generated "Analyze <Company> in its marketing context" concepts.

What these are
--------------
The pedagogical extractor minted one concept per brand name mentioned in the
OpenStax text - 579 of them in BUS C150. Each carries one templated
misconception and three templated probes, so they account for 2,895 of the
course's 7,712 graph nodes: 37% of the graph, and the single largest reason it
renders as undifferentiated confetti.

Why this does not DELETE
------------------------
The concept-graph queries already filter on status, in nine places, e.g.

    WHERE coalesce(concept.status, 'approved') <> 'superseded'

Concepts, edges, module links, misconceptions and probes are all covered. So
setting status = 'superseded' removes them from every read path the product
has, while leaving the data intact and reversible. Deleting 1,737 authored
probes to tidy a picture would be a poor trade; this is the same visible result
with an undo.

Usage, from the repo root:

    docker compose exec app python -m fiosra.mvp.prune_company_concepts            # dry run
    docker compose exec app python -m fiosra.mvp.prune_company_concepts --apply    # retire them
    docker compose exec app python -m fiosra.mvp.prune_company_concepts --restore  # put them back

A dry run writes nothing.
"""

import argparse
import asyncio
import logging

from fiosra.mvp.neo4j_client import neo4j_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

COURSE_ID = "8a9fefac-e5b9-49dd-935c-88cfd1929e26"

# Anchored so it cannot catch a hand-authored concept that merely starts with
# "Analyze". Every one of the 579 matches this exact shape.
LABEL_PATTERN = r"^Analyze .+ in its marketing context$"

# Concept -> its misconceptions -> their probes, in one traversal. Reused by
# every mode so the dry run counts exactly what the write would touch.
MATCH_SET = """
MATCH (c:Concept {course_id: $course_id})
WHERE c.label =~ $pattern
OPTIONAL MATCH (c)-[:ASSOCIATED_WITH]->(m:Misconception)
OPTIONAL MATCH (m)-[:PROBED_BY]->(p:SocraticProbe)
"""

COUNT_QUERY = MATCH_SET + """
RETURN count(DISTINCT c) AS concepts,
       count(DISTINCT m) AS misconceptions,
       count(DISTINCT p) AS probes
"""

# Guard: never touch a misconception that some other, legitimate concept also
# points at. None do today, but a later import could change that and this keeps
# the script safe to re-run.
SHARED_GUARD = """
MATCH (c:Concept {course_id: $course_id})
WHERE c.label =~ $pattern
MATCH (c)-[:ASSOCIATED_WITH]->(m:Misconception)
MATCH (other:Concept)-[:ASSOCIATED_WITH]->(m)
WHERE NOT other.label =~ $pattern
RETURN count(DISTINCT m) AS shared
"""

WRITE_QUERY = """
MATCH (c:Concept {course_id: $course_id})
WHERE c.label =~ $pattern
OPTIONAL MATCH (c)-[:ASSOCIATED_WITH]->(m:Misconception)
WHERE NOT EXISTS {
    MATCH (other:Concept)-[:ASSOCIATED_WITH]->(m)
    WHERE NOT other.label =~ $pattern
}
OPTIONAL MATCH (m)-[:PROBED_BY]->(p:SocraticProbe)
SET c.status = $status, c.updated_at = datetime()
WITH collect(DISTINCT m) AS ms, collect(DISTINCT p) AS ps
FOREACH (m IN ms | SET m.status = $status, m.updated_at = datetime())
FOREACH (p IN ps | SET p.status = $status, p.updated_at = datetime())
RETURN size(ms) AS misconceptions, size(ps) AS probes
"""

VISIBLE_QUERY = """
MATCH (course:Course {course_id: $course_id})-[:HAS_CONCEPT]->(c:Concept)
WHERE coalesce(c.status, 'approved') <> 'superseded'
RETURN count(c) AS visible_concepts
"""


async def main(mode: str) -> None:
    params = {"course_id": COURSE_ID, "pattern": LABEL_PATTERN}

    async with neo4j_client.get_session() as session:
        counts = await (await session.run(COUNT_QUERY, params)).single()
        concepts = counts["concepts"]
        logger.info(
            "Matched %d company concepts, %d misconceptions, %d probes (%d nodes in total).",
            concepts, counts["misconceptions"], counts["probes"],
            concepts + counts["misconceptions"] + counts["probes"],
        )
        if not concepts:
            logger.info("Nothing matches. Either already retired, or the labels changed.")
            return

        shared = await (await session.run(SHARED_GUARD, params)).single()
        if shared and shared["shared"]:
            logger.warning(
                "%d misconception(s) are also attached to concepts outside this set; "
                "those will be left untouched.", shared["shared"],
            )

        before = await (await session.run(VISIBLE_QUERY, params)).single()
        logger.info("Concepts currently visible on the graph: %d", before["visible_concepts"])

        if mode == "dry-run":
            logger.info(
                "DRY RUN - nothing written. Re-run with --apply to set status='superseded', "
                "which hides them from every read path and can be undone with --restore."
            )
            return

        status = "superseded" if mode == "apply" else "approved"
        logger.info("Setting status=%r ...", status)
        written = await (await session.run(WRITE_QUERY, {**params, "status": status})).single()
        logger.info(
            "Updated %d concepts, %d misconceptions, %d probes.",
            concepts, written["misconceptions"], written["probes"],
        )

        after = await (await session.run(VISIBLE_QUERY, params)).single()
        logger.info(
            "Concepts visible on the graph: %d -> %d",
            before["visible_concepts"], after["visible_concepts"],
        )

    await neo4j_client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Retire them (status='superseded').")
    group.add_argument("--restore", action="store_true", help="Undo: set status back to 'approved'.")
    args = parser.parse_args()
    asyncio.run(main("apply" if args.apply else "restore" if args.restore else "dry-run"))
