"""HTTP integration against local Supabase + seeded example workspace (pnpm seed:example). No mocks."""
from functools import cache
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from services.api.config import settings
from services.api.main import app

ORG = settings().intake_org_id
client = TestClient(app)


@cache
def token(email):
    cfg = settings()
    r = httpx.post(cfg.supabase_url + '/auth/v1/token?grant_type=password', headers={'apikey': cfg.supabase_anon_key},
                   json={'email': email, 'password': 'upstream-example-only'}, timeout=15)
    assert r.status_code == 200, 'Run pnpm seed:example first'
    return {'Authorization': 'Bearer ' + r.json()['access_token'], 'Origin': cfg.app_url}


def as_(role):
    return token(f'{role}@example.test')


def report(**extra):
    return {'client_id': str(uuid4()), 'categories': ['colour_change'], 'description': '',
            'observed_at': '2026-09-20T10:00:00+01:00', 'timezone': 'Europe/London', 'landmark': 'Old mill bridge'} | extra


def test_health_and_auth_required():
    assert client.get('/api/v1/health').json()['data']['database'] == 'available'
    r = client.get('/api/v1/me')
    assert r.status_code == 401 and r.json()['error']['code'] == 'AUTH_REQUIRED'


def test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent():  # B02 B03 B08
    headers = as_('contributor') | {'Idempotency-Key': str(uuid4())}
    body = report()
    first = client.post(f'/api/v1/orgs/{ORG}/reports', json=body, headers=headers)
    assert first.status_code == 201, first.text
    data = first.json()['data']
    assert data['state'] == 'server_received' and data['data_origin'] == 'synthetic'
    again = client.post(f'/api/v1/orgs/{ORG}/reports', json=body, headers=headers)
    assert again.json()['data'] == data
    changed = client.post(f'/api/v1/orgs/{ORG}/reports', json=body | {'description': 'altered text here'}, headers=headers)
    assert changed.status_code == 409 and changed.json()['error']['code'] == 'IDEMPOTENCY_MISMATCH'
    detail = client.get(f"/api/v1/orgs/{ORG}/reports/{data['id']}", headers=as_('contributor')).json()['data']
    assert detail['location_precision'] == 'unresolved' and detail['latitude'] is None and detail['public_visibility'] is False
    case = client.get(f"/api/v1/orgs/{ORG}/cases/{data['case_id']}", headers=as_('coordinator')).json()['data']
    assert [r['id'] for r in case['reports']] == [data['id']]


def test_report_validation_and_missing_idempotency_key():
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(categories=[], description='short'),
                    headers=as_('contributor') | {'Idempotency-Key': str(uuid4())})
    assert r.status_code == 422 and r.json()['error']['code'] == 'VALIDATION_FAILED'
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=as_('contributor'))
    assert r.status_code == 422


def test_foreign_origin_rejected():  # G07
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(),
                    headers=as_('contributor') | {'Origin': 'https://evil.example', 'Idempotency-Key': str(uuid4())})
    assert r.status_code == 403


def test_directory_scopes_and_pagination():
    coordinator = client.get(f'/api/v1/orgs/{ORG}/cases?limit=2', headers=as_('coordinator')).json()['data']
    assert len(coordinator['items']) == 2 and coordinator['next_cursor']
    page2 = client.get(f'/api/v1/orgs/{ORG}/cases', params={'limit': 2, 'cursor': coordinator['next_cursor']},
                       headers=as_('coordinator')).json()['data']
    assert not {c['id'] for c in page2['items']} & {c['id'] for c in coordinator['items']}
    assert client.get(f'/api/v1/orgs/{ORG}/cases?q=Mill%20Brook', headers=as_('coordinator')).json()['data']['items'][0]['title'] == 'Mill Brook'
    # A monitor with no assignment sees no case records (need-to-know) rather than the org directory.
    assert client.get(f'/api/v1/orgs/{ORG}/cases', headers=as_('monitor')).json()['data']['items'] == []


def test_other_org_and_unknown_records_are_not_found():  # G01
    other = str(uuid4())
    assert client.get(f'/api/v1/orgs/{other}/cases/{uuid4()}', headers=as_('coordinator')).status_code == 404
    mill = client.get(f'/api/v1/orgs/{ORG}/cases?q=Mill%20Brook', headers=as_('coordinator')).json()['data']['items'][0]
    assert client.get(f"/api/v1/orgs/{other}/cases/{mill['id']}", headers=as_('coordinator')).status_code == 404


def test_me_lists_capabilities_not_client_roles():
    orgs = client.get('/api/v1/me', headers=as_('expert')).json()['data']['organizations']
    assert set(next(o for o in orgs if o['id'] == ORG)['capabilities']) == {'expert', 'evidence_view'}
    r = client.patch('/api/v1/profile', json={'capabilities': ['admin']}, headers=as_('contributor'))
    assert r.status_code == 422  # G06: unknown keys rejected at the boundary


@pytest.mark.parametrize('role', ['contributor', 'monitor'])
def test_only_coordinators_create_tasks(role):
    mill = client.get(f'/api/v1/orgs/{ORG}/cases?q=Mill%20Brook', headers=as_('coordinator')).json()['data']['items'][0]
    body = {'case_id': mill['id'], 'task_type': 'location_confirmation', 'purpose': 'Confirm the footbridge location.',
            'window_start': '2030-01-01T09:00:00Z', 'window_end': '2030-01-01T12:00:00Z'}
    assert client.post(f'/api/v1/orgs/{ORG}/tasks', json=body, headers=as_(role)).status_code == 403
