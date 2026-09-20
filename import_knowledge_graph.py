"""Import a knowledge_graph_ir.json into Neo4j via the ConceptGraphService.approve_proposal pipeline."""

import asyncio
import json
import sys
from pathlib import Path


async def main(ir_path: str, course_id: str) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from fiosra.mvp.concepts.schemas import ConceptGraphProposal
    from fiosra.mvp.concepts.service import ConceptGraphService
    from fiosra.mvp.courses.models import Course
    from fiosra.mvp.database import AsyncSessionLocal

    # Load and validate the IR JSON
    ir_data = json.loads(Path(ir_path).read_text(encoding="utf-8"))
    proposal = ConceptGraphProposal.model_validate(ir_data)
    print(f"✓ Validated IR: {len(proposal.concepts)} concepts, {len(proposal.prerequisites)} prerequisites")

    # Fetch the course from PostgreSQL with modules eagerly loaded
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Course).options(selectinload(Course.modules)).where(Course.course_id == course_id)
        )
        course = result.scalar_one_or_none()
        if not course:
            print(f"✗ Course {course_id} not found in database")
            sys.exit(1)
        print(f"✓ Found course: {course.title} ({len(course.modules)} modules)")

        # Import via the existing approve_proposal pipeline
        svc = ConceptGraphService()
        await svc.sync_course_structure(course)
        print("✓ Course structure synced to Neo4j")

        graph = await svc.approve_proposal(course, proposal)

    concept_count = len(graph.get("nodes", []))
    edge_count = len(graph.get("edges", []))
    source_count = len(graph.get("source_links", []))
    probe_count = len(graph.get("probes", []))

    print(f"✓ Import complete!")
    print(f"  Concepts:    {concept_count}")
    print(f"  Edges:       {edge_count}")
    print(f"  Source links: {source_count}")
    print(f"  Probes:      {probe_count}")


if __name__ == "__main__":
    ir_file = sys.argv[1] if len(sys.argv) > 1 else "knowledge_graph_ir.json"
    cid = sys.argv[2] if len(sys.argv) > 2 else "2bf5b7c4-01ee-4ee5-9c8b-f2066289192a"
    asyncio.run(main(ir_file, cid))
