"""Tenant/role boundaries through every door: API, direct REST, RPC (G02, G05); no server-side URL fetching (G09);
privacy-preserving logs (G11); personal-data export and deletion request (G12)."""
import http.server
import os
import threading
from pathlib import Path
from uuid import uuid4

import httpx

from services.api.config import settings
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client, fresh_contributor, jpeg_with_gps, report, token
from tests.api.test_mapping import Y, draft, fresh_case

CFG = settings()
REST = CFG.supabase_url + '/rest/v1'


def rest(method, path, bearer=None, **kw):
    headers = {'apikey': CFG.supabase_anon_key, 'Authorization': f'Bearer {bearer or CFG.supabase_anon_key}', 'Content-Type': 'application/json'}
    return httpx.request(method, REST + path, headers=headers, timeout=15, **kw)


def bearer(role):
    return as_(role)['Authorization'].split(' ', 1)[1]


def test_direct_rest_and_rpc_cannot_bypass_policies():  # G05
    for table in ('cases', 'reports', 'reading_versions', 'assessments', 'evidence_packages', 'share_grants', 'audit_log'):
        r = rest('GET', f'/{table}?select=*&limit=5')
        assert r.status_code in (401, 403) or r.json() == [], (table, r.status_code, r.text[:200])  # anonymous: nothing
    contributor = bearer('contributor')
    assert rest('GET', '/reading_versions?select=id&limit=5', contributor).json() == []
    assert rest('GET', '/share_grants?select=token_hash&limit=5', contributor).json() == []
    ins = rest('POST', '/reports', contributor, json={'org_id': ORG, 'case_id': case_id('Mill Brook'), 'client_id': str(uuid4()),
                                                     'description': 'direct insert attempt', 'observed_at': '2026-09-20T10:00:00Z', 'timezone': 'UTC'})
    assert ins.status_code in (401, 403), ins.text
    upd = rest('PATCH', f"/cases?id=eq.{case_id('Mill Brook')}", contributor, json={'workflow': 'closed_no_anomaly'})
    assert upd.status_code in (401, 403) or upd.json() == [], upd.text
    grant = rest('POST', '/rpc/set_capability', contributor, json={'o': ORG, 'target': str(uuid4()), 'cap': 'admin', 'grant_it': True, 'reason': 'self upgrade'})
    assert grant.status_code >= 400
    anon = rest('POST', '/rpc/submit_report', json={'o': ORG, 'idem': str(uuid4()), 'body': {}})
    assert anon.status_code in (401, 403, 404)


def test_contributor_cannot_read_internal_evidence_or_others_media_by_id():  # G02
    mill = case_id('Mill Brook')
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{mill}/readings', headers=as_('contributor')).json()['data'] == []
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{mill}/assessment', headers=as_('contributor')).status_code == 404
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{mill}/packages', headers=as_('contributor')).status_code == 403
    up = client.post(f'/api/v1/orgs/{ORG}/uploads', files={'file': ('p.jpg', jpeg_with_gps(), 'image/jpeg')}, headers=as_('reporter')).json()['data']
    assert client.get(f"/api/v1/orgs/{ORG}/media/{up['id']}", headers=as_('contributor')).status_code == 404


def test_urls_in_reports_and_imports_are_never_fetched():  # G09
    hits = []

    class Trap(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *a):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Trap)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/probe'
    try:
        r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(description=f'See {url} and <img src="{url}">', landmark=url),
                        headers=as_('reporter') | {'Idempotency-Key': str(uuid4())})
        assert r.status_code == 201
        feature = dict(Y[0], properties={'id': 'A', 'source': url, 'href': url})
        assert draft(fresh_case()['case_id'], [feature] + Y[1:], source=url, license=url).status_code == 201
        assert hits == []
    finally:
        server.shutdown()


def test_access_log_has_no_report_text_or_coordinates():  # G11 (running API server log)
    log = Path(os.environ.get('TEMP', '/tmp')) / 'upstream-api.log'
    marker, lat = f'private-{uuid4().hex}', '51.4321987'
    r = httpx.post(f'http://127.0.0.1:8000/api/v1/orgs/{ORG}/reports', timeout=15,
                   json=report(description=f'Foam near house {marker}', latitude=float(lat), longitude=-2.5987654),
                   headers=as_('reporter') | {'Idempotency-Key': str(uuid4())})
    assert r.status_code == 201, r.text
    httpx.post(f'http://127.0.0.1:8000/api/v1/orgs/{ORG}/duplicate-suggestions', timeout=15,
               json={'lat': float(lat), 'lon': -2.5987654, 'observed_at': '2026-09-20T10:00:00+01:00'}, headers=as_('reporter'))
    text = log.read_text(errors='ignore') if log.exists() else ''
    assert text, 'run the API via scripts/restart-local.ps1 so its log is captured'
    assert marker not in text and lat not in text and '2.5987654' not in text
    assert CFG.supabase_service_role_key not in text


def test_personal_data_export_and_deletion_request():  # G12
    email = fresh_contributor.__wrapped__()
    headers = token(email)
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(public_visibility=True), headers=headers | {'Idempotency-Key': str(uuid4())})
    report_id = r.json()['data']['id']
    exported = client.get('/api/v1/me/export', headers=headers).json()['data']
    assert exported['email'] == email and [x['id'] for x in exported['reports']] == [report_id]
    assert client.post('/api/v1/me/deletion-request', json={'confirm': True}, headers=headers).status_code == 200
    # Public identity and visibility withdrawn at once; the evidence record stays for the organization.
    kept = client.get(f'/api/v1/orgs/{ORG}/reports/{report_id}', headers=as_('coordinator')).json()['data']
    assert kept['id'] == report_id and kept['public_visibility'] is False
    assert client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=headers | {'Idempotency-Key': str(uuid4())}).status_code in (401, 403)
    login = httpx.post(CFG.supabase_url + '/auth/v1/token?grant_type=password', headers={'apikey': CFG.supabase_anon_key},
                       json={'email': email, 'password': 'upstream-example-only'}, timeout=15)
    assert login.status_code >= 400  # account disabled
