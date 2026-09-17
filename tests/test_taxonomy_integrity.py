"""Regression tests for course-scoped, source-grounded taxonomy ingestion."""
from copy import deepcopy

from fiosra.mvp.courses.pedagogical_extractor import pedagogical_extractor


def small_plan():
    return {
        'knowledge_components': [
            {'kc_id': 'KC_001', 'label': 'Settled communities', 'prerequisites': []},
            {'kc_id': 'KC_002', 'label': 'Urban organization', 'prerequisites': ['KC_001']},
        ],
        'misconceptions': [{'misconception_id': 'MISC_001', 'kc_id': 'KC_001', 'name': 'Sudden settlement'}],
        'socratic_probes': [{'probe_id': 'PROBE_001', 'kc_id': 'KC_001', 'misconception_id': 'MISC_001', 'rung': 0}],
    }


def test_scoped_ids_isolate_courses_and_preserve_references():
    original = small_plan()
    before = deepcopy(original)
    a = pedagogical_extractor.scope_ontology('course-a', 'module-a', original)
    b = pedagogical_extractor.scope_ontology('course-b', 'module-a', original)
    c = pedagogical_extractor.scope_ontology('course-a', 'module-b', original)
    assert original == before
    assert a == pedagogical_extractor.scope_ontology('course-a', 'module-a', original)
    assert a == pedagogical_extractor.scope_ontology('course-a', 'module-a', a)
    ids = [p['knowledge_components'][0]['kc_id'] for p in (a, b, c)]
    assert len(set(ids)) == 3
    assert a['knowledge_components'][1]['prerequisites'] == [ids[0]]
    assert a['misconceptions'][0]['kc_id'] == ids[0]
    assert a['socratic_probes'][0]['misconception_id'] == a['misconceptions'][0]['misconception_id']
    assert a['socratic_probes'][0]['kc_id'] == ids[0]

import pytest


def grounded_plan():
    data = {'knowledge_components': [], 'misconceptions': [], 'socratic_probes': []}
    for i in range(6):
        kid = f'KC_{i}'
        data['knowledge_components'].append({
            'kc_id': kid, 'label': f'Historical concept {i}', 'definition': f'Source concept {i}',
            'bloom_level': 'analyze', 'prerequisites': [],
            'source_excerpt': f'Source passage {i} describes a distinct historical development.'})
        for j in range(2):
            mid = f'M_{i}_{j}'
            data['misconceptions'].append({'misconception_id': mid, 'kc_id': kid,
                'name': f'Trap {i} {j}', 'flawed_rule': f'Incorrect inference {i} {j}',
                'remediation_hint': 'Ask which source evidence supports the inference.'})
            for rung in range(3):
                data['socratic_probes'].append({'probe_id': f'P_{i}_{j}_{rung}',
                    'kc_id': kid, 'misconception_id': mid, 'rung': rung,
                    'probe_text': f'What evidence tests interpretation {i} {j} at stage {rung}?',
                    'rationale': 'Tests the specified misconception against the source.'})
    return data


def source_text():
    return '\n'.join(k['source_excerpt'] for k in grounded_plan()['knowledge_components'])


def test_complete_grounded_taxonomy_is_accepted():
    pedagogical_extractor.validate_ontology(grounded_plan(), source_text())


@pytest.mark.parametrize('damage', ['missing_kc', 'missing_trap', 'missing_rung', 'fake_quote',
    'dangling_prerequisite', 'self_prerequisite', 'wrong_probe_kc', 'duplicate_id', 'duplicate_label', 'bad_bloom'])
def test_incomplete_or_ungrounded_taxonomy_is_rejected(damage):
    data = grounded_plan()
    if damage == 'missing_kc': data['knowledge_components'].pop()
    if damage == 'missing_trap': data['misconceptions'].pop()
    if damage == 'missing_rung': data['socratic_probes'].pop()
    if damage == 'fake_quote': data['knowledge_components'][0]['source_excerpt'] = 'Invented source passage'
    if damage == 'dangling_prerequisite': data['knowledge_components'][0]['prerequisites'] = ['absent']
    if damage == 'self_prerequisite':
        data['knowledge_components'][0]['prerequisites'] = ['KC_0']
    if damage == 'wrong_probe_kc': data['socratic_probes'][0]['kc_id'] = 'KC_5'
    if damage == 'duplicate_id': data['socratic_probes'][1]['probe_id'] = data['socratic_probes'][0]['probe_id']
    if damage == 'duplicate_label': data['knowledge_components'][1]['label'] = data['knowledge_components'][0]['label']
    if damage == 'bad_bloom': data['knowledge_components'][0]['bloom_level'] = 'invented'
    with pytest.raises(ValueError):
        pedagogical_extractor.validate_ontology(data, source_text())


def test_network_cycles_are_permitted():
    """Curriculum graphs are organic networks; co-requisites and cyclic dependencies are permitted."""
    data = grounded_plan()
    data['knowledge_components'][0]['prerequisites'] = ['KC_1']
    data['knowledge_components'][1]['prerequisites'] = ['KC_0']
    pedagogical_extractor.validate_ontology(data, source_text())

from unittest.mock import AsyncMock

from fiosra.mvp.config import settings


@pytest.mark.asyncio
async def test_extraction_does_not_substitute_generic_fallback(monkeypatch):
    monkeypatch.setattr(settings, 'FIOSRA_LLM_PROVIDER', 'deterministic')
    with pytest.raises(ValueError, match='provider'):
        await pedagogical_extractor.extract_pedagogical_ontology('Course', 'Module', 'History', source_text())


@pytest.mark.asyncio
async def test_invalid_taxonomy_is_rejected_before_database_access(monkeypatch):
    from fiosra.mvp.courses import pedagogical_extractor as module
    connect = AsyncMock(side_effect=AssertionError('Must not access database'))
    monkeypatch.setattr(module.neo4j_client, 'get_session', connect)
    with pytest.raises(ValueError):
        await pedagogical_extractor.seed_pedagogical_graph(
            'c', 'm', 'Course', 'Module', 'History', small_plan(),
            source_chunks=[{'chunk_id': 's', 'content': source_text()}])
    connect.assert_not_called()

from fiosra.mvp.courses.ingestion import syllabus_parser
from fiosra.mvp.graph_service import graph_service


def test_pdf_text_is_bounded_without_losing_content():
    text = ' '.join(f'Historical sentence number {i}.' for i in range(500))
    chunks = syllabus_parser.chunk_document(text, 'Reading')
    assert len(chunks) > 1
    assert all(len(c['content']) <= 1200 for c in chunks)
    assert ' '.join(c['content'] for c in chunks) == text


@pytest.mark.asyncio
async def test_source_matching_never_uses_unrelated_course_or_fallback(monkeypatch):
    async def candidates(domain=None):
        return [{'kc_id': 'foreign', 'label': 'Ancien Regime Social Structure', 'course_id': 'other'}]
    monkeypatch.setattr(graph_service, 'list_all_kcs', candidates)
    result = await syllabus_parser.match_kc_for_text(
        'India had a social structure', domain='History', course_id='india')
    assert result is None
    monkeypatch.setattr(graph_service, 'list_all_kcs', AsyncMock(return_value=[]))
    assert await syllabus_parser.match_kc_for_text('Ancien Regime Three Estates Social Structure') is None

@pytest.mark.asyncio
async def test_reseed_uses_validated_atomic_replacement(monkeypatch):
    from types import SimpleNamespace
    from uuid import uuid4

    from fiosra.mvp.courses import router as routes
    cid, mid = uuid4(), uuid4()
    course = SimpleNamespace(course_id=cid, title='Course', domain='History',
        modules=[SimpleNamespace(module_id=mid, title='Module')])
    monkeypatch.setattr(routes.course_service, 'get_course', AsyncMock(return_value=course))
    seed = AsyncMock(return_value={'knowledge_components':6,'misconceptions':12,'socratic_probes':36})
    monkeypatch.setattr(pedagogical_extractor, 'extract_and_seed', seed)
    result = await routes.reseed_module_graph(cid, mid)
    assert result['knowledge_components'] == 6
    assert seed.call_args.kwargs['replace'] is True


def test_changed_teaching_content_gets_new_ids_for_historical_links():
    data = grounded_plan()
    first = pedagogical_extractor.scope_ontology('c', 'm', data)
    data['socratic_probes'][0]['probe_text'] = 'Which evidence would change your interpretation?'
    changed = pedagogical_extractor.scope_ontology('c', 'm', data)
    assert first['socratic_probes'][0]['probe_id'] != changed['socratic_probes'][0]['probe_id']
    data['misconceptions'][0]['flawed_rule'] = 'A materially revised flawed rule'
    changed = pedagogical_extractor.scope_ontology('c', 'm', data)
    assert first['misconceptions'][0]['misconception_id'] != changed['misconceptions'][0]['misconception_id']
