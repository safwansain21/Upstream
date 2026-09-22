"""A04: a worker that dies mid-job leaves no partial result; the expired lease is re-claimed and completes exactly once."""
from uuid import uuid4

from services.api.db import transaction
from tests.api.test_http import ORG, as_, client, report, wait_job
from tests.api.test_review import scenario


def test_crashed_worker_lease_is_reclaimed_without_duplicates():
    case = scenario()
    job = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/analyses', headers=as_('coordinator')).json()['data']
    with transaction(worker=True) as db:  # a worker leased the job and then crashed before committing any result
        db.execute("""update analysis_jobs set state='running', lease_owner=%s, lease_until=now()-interval '1 second', attempts=attempts+1
            where id=%s and state='queued'""", (str(uuid4()), job['id']))
        assert db.execute('select count(*) n from assessments where case_id=%s', (case,)).fetchone()['n'] == 0  # nothing partial published
    assert wait_job(job['id'])['state'] == 'done'
    with transaction(worker=True) as db:
        assert db.execute('select count(*) n from assessments where case_id=%s', (case,)).fetchone()['n'] == 1
        row = db.execute('select attempts,state from analysis_jobs where id=%s', (job['id'],)).fetchone()
        assert row['state'] == 'done' and row['attempts'] >= 1
    again = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/analyses', headers=as_('coordinator')).json()['data']
    assert again['id'] == job['id'] and again['state'] == 'done'  # re-requesting after restart does not duplicate work


def test_retried_submission_after_restart_does_not_duplicate_case():
    key, body = str(uuid4()), report()
    first = client.post(f'/api/v1/orgs/{ORG}/reports', json=body, headers=as_('reporter') | {'Idempotency-Key': key}).json()['data']
    retry = client.post(f'/api/v1/orgs/{ORG}/reports', json=body, headers=as_('reporter') | {'Idempotency-Key': key}).json()['data']
    assert retry == first
    with transaction(worker=True) as db:
        assert db.execute('select count(*) n from reports where client_id=%s', (body['client_id'],)).fetchone()['n'] == 1


def test_worker_loop_survives_database_interruption(monkeypatch):  # A04: a DB restart must not kill the worker
    import psycopg
    import pytest
    import services.worker.__main__ as worker
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise psycopg.OperationalError('server closed the connection unexpectedly')
        raise SystemExit  # second poll reached: the loop kept running after the failure

    monkeypatch.setattr(worker, 'work_once', flaky)
    monkeypatch.setattr(worker.time, 'sleep', lambda s: None)
    with pytest.raises(SystemExit):
        worker.main()
    assert len(calls) == 2
