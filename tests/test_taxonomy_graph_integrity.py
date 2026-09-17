"""Integration checks: run against disposable course IDs in the local Neo4j database."""
from uuid import uuid4

import pytest

from fiosra.mvp.courses.pedagogical_extractor import pedagogical_extractor
from fiosra.mvp.neo4j_client import neo4j_client
from tests.test_taxonomy_integrity import grounded_plan, source_text


@pytest.mark.asyncio
async def test_taxonomy_is_grounded_idempotent_and_not_auto_approved():
    cid, mid = f'taxonomy_test_{uuid4().hex}', f'module_{uuid4().hex}'
    chunks = [{'chunk_id': str(uuid4()), 'content': source_text(), 'title': 'Teaching source'}]
    try:
        for _ in range(2):
            await pedagogical_extractor.seed_pedagogical_graph(
                cid, mid, 'Integrity test', 'Module', 'History', grounded_plan(), source_chunks=chunks)
        async with neo4j_client.get_session() as s:
            r = await s.run('''MATCH (k:KnowledgeComponent {course_id:$cid})
                OPTIONAL MATCH (source:SourceChunk)-[e:EVIDENCES]->(k)
                RETURN k.status AS status, count(e) AS sources, collect(e.excerpt) AS excerpts''', cid=cid)
            rows = await r.data()
            assert all(row['status'] == 'pending_review' and row['sources'] > 0 for row in rows)
            r = await s.run('MATCH (p:SocraticProbe {course_id:$cid}) RETURN count(p) AS n', cid=cid)
            assert (await r.single())['n'] == 36
    finally:
        async with neo4j_client.get_session() as s:
            await s.run('MATCH (n {course_id:$cid}) DETACH DELETE n', cid=cid)

@pytest.mark.asyncio
async def test_repeated_ingestion_reuses_source_chunk_ids(monkeypatch):
    from sqlalchemy import text

    from fiosra.mvp.courses.ingestion import syllabus_parser
    from fiosra.mvp.database import AsyncSessionLocal
    cid, mid = uuid4(), uuid4()
    async def no_match(*args, **kwargs):
        return None
    monkeypatch.setattr(syllabus_parser, 'match_kc_for_text', no_match)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("INSERT INTO courses(course_id,title,created_by) VALUES (:cid,'Taxonomy test','test')"), {'cid':cid})
            await db.execute(text("INSERT INTO modules(module_id,course_id,title) VALUES (:mid,:cid,'Module')"), {'cid':cid,'mid':mid})
            await db.commit()
        first = await syllabus_parser.ingest_syllabus(cid, source_text(), module_id=mid)
        again = await syllabus_parser.ingest_syllabus(cid, source_text(), module_id=mid)
        assert [c.chunk_id for c in first] == [c.chunk_id for c in again]
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(text('DELETE FROM courses WHERE course_id=:cid'), {'cid':cid})
            await db.commit()

@pytest.mark.asyncio
async def test_replacement_hides_old_nodes_but_preserves_history():
    from fiosra.mvp.concepts.service import concept_graph_service
    cid, mid = f'taxonomy_test_{uuid4().hex}', f'module_{uuid4().hex}'
    chunks = [{'chunk_id': str(uuid4()), 'content': source_text(), 'title': 'Source'}]
    try:
        await pedagogical_extractor.seed_pedagogical_graph(cid, mid, 'Course', 'Module', 'History',
            grounded_plan(), source_chunks=chunks)
        revised = grounded_plan()
        revised['knowledge_components'][0]['label'] = 'Revised historical concept'
        await pedagogical_extractor.seed_pedagogical_graph(cid, mid, 'Course', 'Module', 'History',
            revised, source_chunks=chunks, replace=True)
        graph = await concept_graph_service.get_course_graph(cid)
        assert graph['stats']['concepts'] == 6
        assert graph['stats']['misconceptions'] == 12
        assert graph['stats']['socratic_probes'] == 36
        assert all(n['status'] == 'pending_review' for n in graph['nodes'])
        async with neo4j_client.get_session() as s:
            r=await s.run("MATCH (k:KnowledgeComponent {course_id:$cid,status:'superseded'}) RETURN count(k) AS n",cid=cid)
            assert (await r.single())['n'] == 1
    finally:
        async with neo4j_client.get_session() as s:
            await s.run('MATCH (n {course_id:$cid}) DETACH DELETE n', cid=cid)

@pytest.mark.asyncio
async def test_learner_frontier_excludes_unreviewed_and_superseded_nodes():
    from fiosra.mvp.graph_service import graph_service
    cid, domain = f'taxonomy_test_{uuid4().hex}', f'test_{uuid4().hex}'
    try:
        async with neo4j_client.get_session() as s:
            await s.run('''UNWIND ['approved','pending_review','superseded'] AS state
                CREATE (:KnowledgeComponent {kc_id:$cid+state,course_id:$cid,domain:$domain,status:state})''',cid=cid,domain=domain)
        rows=await graph_service.get_learning_frontier([],domain)
        assert [r['kc_id'] for r in rows] == [cid+'approved']
    finally:
        async with neo4j_client.get_session() as s:
            await s.run('MATCH (n {course_id:$cid}) DETACH DELETE n',cid=cid)


@pytest.mark.asyncio
async def test_reingestion_preserves_verified_source_provenance():
    from fiosra.mvp.concepts.service import concept_graph_service
    cid, mid = f'taxonomy_test_{uuid4().hex}', f'module_{uuid4().hex}'
    chunks=[{'chunk_id':str(uuid4()),'content':source_text(),'title':'Teaching source'}]
    try:
        await pedagogical_extractor.seed_pedagogical_graph(cid,mid,'Course','Module','History',grounded_plan(),source_chunks=chunks)
        await concept_graph_service.ingest_resource(cid,mid,'Teaching source','document',None,chunks)
        graph=await concept_graph_service.get_course_graph(cid)
        assert len(graph['source_links']) == 6
        assert all(e['method']=='verified_source_excerpt' for e in graph['source_links'])
    finally:
        async with neo4j_client.get_session() as s:
            await s.run('MATCH (n {course_id:$cid}) DETACH DELETE n',cid=cid)

@pytest.mark.asyncio
async def test_legacy_duplicate_source_ids_are_retained_but_listed_once(monkeypatch):
    from sqlalchemy import text

    from fiosra.mvp.courses.ingestion import syllabus_parser
    from fiosra.mvp.database import AsyncSessionLocal
    cid, mid = uuid4(), uuid4()
    async def no_match(*args, **kwargs): return None
    monkeypatch.setattr(syllabus_parser,'match_kc_for_text',no_match)
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("INSERT INTO courses(course_id,title,created_by) VALUES (:cid,'Dedup test','test')"),{'cid':cid})
            await db.execute(text("INSERT INTO modules(module_id,course_id,title) VALUES (:mid,:cid,'Module')"),{'cid':cid,'mid':mid})
            await db.commit()
        first=await syllabus_parser.ingest_syllabus(cid,source_text(),module_id=mid)
        async with AsyncSessionLocal() as db:
            await db.execute(text('''INSERT INTO syllabus_chunks(chunk_id,course_id,module_id,title,content,resource_type)
                SELECT :duplicate,course_id,module_id,title,content,resource_type FROM syllabus_chunks WHERE chunk_id=:id'''),
                {'duplicate':uuid4(),'id':first[0].chunk_id})
            await db.commit()
        assert len(await syllabus_parser.list_chunks(cid,mid)) == 1
        async with AsyncSessionLocal() as db:
            r=await db.execute(text('SELECT count(*) FROM syllabus_chunks WHERE course_id=:cid'),{'cid':cid})
            assert r.scalar() == 2
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(text('DELETE FROM courses WHERE course_id=:cid'),{'cid':cid})
            await db.commit()
