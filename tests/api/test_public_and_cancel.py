"""G04 public snapshot; J02 cancellation off the request path; G10 no webhook recipients; G11 worker log hygiene."""
import os
from pathlib import Path
from uuid import uuid4

from services.api.db import transaction
from tests.api.test_http import ORG, as_, client, report, wait_job
from tests.api.test_review import approve, compute, scenario


def test_public_snapshot_is_sanitized_and_generalized():  # G04
    private = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(latitude=51.456789, longitude=-2.591234),
                          headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    assert client.get(f"/api/v1/public/cases/{private['case_id']}").status_code == 404  # default private
    marker = f'secret words {uuid4().hex[:6]}'
    public = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(latitude=51.456789, longitude=-2.591234, public_visibility=True, description=marker),
                         headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    r = client.get(f"/api/v1/public/cases/{public['case_id']}")
    assert r.status_code == 200
    body = r.text
    data = r.json()['data']
    assert data['approximate_location'] == {'lat': '51.46', 'lon': '-2.59', 'precision': 'generalized to about 1 km'}
    assert marker not in body and '51.456789' not in body and 'reporter' not in body and 'email' not in body


def test_analysis_can_be_cancelled_without_losing_completed_records():  # J02
    case = scenario()
    first = compute(case)
    assert approve(first['id']).status_code == 200
    job = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/analyses', headers=as_('coordinator')).json()['data']
    assert job['state'] == 'done'  # identical snapshot: the durable result is reused, not recomputed
    with transaction(worker=True) as db:  # new evidence would create a new job; simulate one waiting in the queue
        db.execute("update analysis_jobs set state='queued',result_id=null where id=%s", (job['id'],))
    r = client.post(f"/api/v1/orgs/{ORG}/analyses/{job['id']}/cancel", headers=as_('coordinator'))
    if r.status_code == 409:  # a background worker finished it first: still no loss
        assert wait_job(job['id'])['state'] in ('done', 'cancelled')
    else:
        assert r.json()['data']['state'] == 'cancelled'
        assert wait_job(job['id'])['state'] == 'cancelled'
    assert client.post(f"/api/v1/orgs/{ORG}/analyses/{job['id']}/cancel", headers=as_('contributor')).status_code in (403, 404)
    history = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/assessments', headers=as_('expert')).json()['data']
    assert [h['revision'] for h in history if h['current']] == [first['revision']]  # approved record untouched
    again = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/analyses', headers=as_('coordinator')).json()['data']
    assert again['state'] in ('queued', 'running', 'done')  # can be requested again after cancelling


def test_webhook_recipients_are_not_accepted():  # G10 (webhook delivery is not enabled; validator covers private addresses)
    r = client.post(f'/api/v1/orgs/{ORG}/recipients', json={'name': 'Internal hook', 'method': 'webhook'}, headers=as_('admin'))
    assert r.status_code == 422


def test_worker_log_has_no_report_text_or_coordinates():  # G11 (worker)
    log = Path(os.environ.get('TEMP', '/tmp')) / 'upstream-worker.log'
    text = log.read_text(errors='ignore') if log.exists() else ''
    assert 'polling analysis_jobs' in text, 'run the worker via scripts/restart-local.ps1 so its log is captured'
    with transaction(worker=True) as db:
        samples = [r['description'] for r in db.execute("select description from reports where length(description)>20 order by created_at desc limit 50")]
    assert not any(s in text for s in samples)
    assert 'st_makepoint' not in text.lower() and 'password' not in text.lower()
