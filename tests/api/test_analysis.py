"""Readiness, durable analysis jobs and stored engine results against the seeded example workspace."""
from decimal import Decimal

from services.worker.__main__ import work_once
from tests.api.test_http import ORG, as_, client


def case_id(title):
    items = client.get(f'/api/v1/orgs/{ORG}/cases', params={'q': title}, headers=as_('coordinator')).json()['data']['items']
    return next(c['id'] for c in items if c['title'] == title)


def readiness(title):
    r = client.get(f'/api/v1/orgs/{ORG}/cases/{case_id(title)}/readiness', headers=as_('coordinator'))
    assert r.status_code == 200, r.text
    return r.json()['data'], {c['label']: c['ready'] for c in r.json()['data']['checks']}


def test_readiness_reports_missing_prerequisites_independently():  # C09 C03 E03
    mill, _ = readiness('Mill Brook')
    assert mill['eligible'], mill['reasons']
    ditch, checks = readiness('Allotment ditch')
    assert not ditch['eligible'] and not checks['Local network mapped and reviewed']
    harbour, checks = readiness('Harbour channel')
    assert not harbour['eligible'] and not checks['Supported flow regime']


def test_unmapped_case_cannot_be_analysed_but_stays_open():  # B04 C11
    r = client.post(f"/api/v1/orgs/{ORG}/cases/{case_id('Allotment ditch')}/analyses", headers=as_('coordinator'))
    assert r.status_code == 422 and r.json()['error']['code'] == 'READINESS_REQUIRED'


def test_contributor_cannot_request_analysis():
    r = client.post(f"/api/v1/orgs/{ORG}/cases/{case_id('Mill Brook')}/analyses", headers=as_('contributor'))
    assert r.status_code in (403, 404)


def test_worker_computes_fixture_assessment_and_conservative_plan():  # E04 E08 J02 A04
    mill = case_id('Mill Brook')
    job = client.post(f'/api/v1/orgs/{ORG}/cases/{mill}/analyses', headers=as_('coordinator'))
    assert job.status_code == 202, job.text
    again = client.post(f'/api/v1/orgs/{ORG}/cases/{mill}/analyses', headers=as_('coordinator'))
    assert again.json()['data']['id'] == job.json()['data']['id']  # same snapshot hash -> same durable job
    job_id = job.json()['data']['id']
    for _ in range(5):
        status = client.get(f'/api/v1/orgs/{ORG}/analyses/{job_id}', headers=as_('coordinator')).json()['data']
        if status['state'] == 'done':
            break
        work_once()
    assert status['state'] == 'done', status
    a = client.get(f'/api/v1/orgs/{ORG}/cases/{mill}/assessment', headers=as_('expert')).json()['data']
    assert a['eligible'] and Decimal(a['retained_length_m']) == Decimal('5300')
    assert a['publication'] == 'draft'
    incompatible = {c['id'] for c in a['classes'] if c['status'] == 'incompatible'}
    assert len(incompatible) == 3  # the three upper A classes
    b2 = next(r for r in a['recommendations'] if r['action_id'] == 'visit-B2')
    assert b2['score_bound_m'] is not None and Decimal(b2['score_bound_m']) == Decimal('5300')  # U=5: no guaranteed narrowing
    assert {d['entity_type'] for d in a['dependencies']} >= {'network_version', 'transport_version', 'reading_version', 'background_version'}
