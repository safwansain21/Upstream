"""Durable analysis worker: leases jobs with SKIP LOCKED; results and job completion commit in one transaction.

A crash mid-job leaves no partial assessment; the expired lease is re-claimed. Run: python -m services.worker
"""
import json
import sys
import time
import traceback
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'packages/engine'))

from upstream_engine import Snapshot, assess, plan, rank_actions  # noqa: E402

from services.api.db import transaction  # noqa: E402
from services.worker.exports import export  # noqa: E402
from services.worker.snapshot import candidate_actions  # noqa: E402

WORKER = uuid4()
MAX_ATTEMPTS = 3
LEASE = "interval '10 minutes'"  # ponytail: > 120s solver cap + planner; add heartbeats if jobs can exceed it


def claim(db):
    return db.execute(f'''update analysis_jobs set state='running', lease_owner=%s, lease_until=now()+{LEASE},
        attempts=attempts+1, progress_stage='Checking compatibility' where id=(select id from analysis_jobs
        where cancelled_at is null and ((state='queued' and available_at<=now()) or (state='running' and lease_until<now()))
        order by created_at for update skip locked limit 1) returning *''', (WORKER,)).fetchone()


def run(job):
    snapshot = Snapshot.model_validate(job['snapshot']['engine'])
    result = assess(snapshot)
    with transaction(worker=True) as db:
        actions = candidate_actions(db, job['org_id'], snapshot, job['snapshot']['context'])
    scored = [(a, plan(snapshot, a, assessment=result)) for a in actions]
    return snapshot, result, rank_actions(scored)


def store(db, job, snapshot, result, ranked):
    revision = db.execute('select coalesce(max(revision),0)+1 n from assessments where case_id=%s', (job['case_id'],)).fetchone()['n']
    prior = db.execute('select id from assessments where case_id=%s order by revision desc limit 1', (job['case_id'],)).fetchone()
    aid = db.execute('''insert into assessments(org_id,case_id,revision,snapshot_hash,snapshot,result,retained_length_m,engine_version,
        solver_version,predecessor_id) values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id''',
                     (job['org_id'], job['case_id'], revision, result.snapshot_hash, json.dumps(snapshot.model_dump(mode='json')),
                      result.model_dump_json(exclude={'canonical_snapshot'}), result.retained_length_m, result.engine_version,
                      result.solver_version, prior and prior['id'])).fetchone()['id']
    for c in result.classes:
        db.execute('''insert into class_results(org_id,assessment_id,class_id,status,length_m,member_edges,problem_hash,exact_problem,solver_reason,witness)
            values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', (job['org_id'], aid, c.id, c.status, c.length_m, list(c.reach_ids),
                                                        c.problem_hash, c.problem_smt2, c.reason, json.dumps(c.witness)))
    for d in job['snapshot']['dependencies']:
        db.execute('''insert into assessment_dependencies(org_id,assessment_id,entity_type,entity_id,version,content_hash,reason)
            values(%s,%s,%s,%s,%s,%s,%s)''', (job['org_id'], aid, d['entity_type'], d['entity_id'], d['version'], d['content_hash'], d['reason']))
    for rank, (action, p) in enumerate(ranked):
        db.execute('''insert into recommendations(org_id,assessment_id,action,score_bound_m,score_status,constraints,rationale)
            values(%s,%s,%s,%s,%s,%s,%s)''', (job['org_id'], aid, action.model_dump_json(), p.conservative_bound_m,
                                              'scored' if p.completed else 'unscored', json.dumps(p.model_dump(mode='json') | {'rank': rank}), p.reason))
    db.execute("insert into assessment_publications(org_id,assessment_id,status,reason) values(%s,%s,'draft','Engine result awaiting expert review')",
               (job['org_id'], aid))
    db.execute("insert into case_events(org_id,case_id,event_type,object_id,object_version,payload) values(%s,%s,'assessment.computed',%s,%s,%s)",
               (job['org_id'], job['case_id'], aid, revision, json.dumps({'retained_length_m': result.retained_length_m, 'eligible': result.eligible})))
    db.execute("update analysis_jobs set state='done', progress_stage='Complete', result_id=%s, lease_until=null where id=%s", (aid, job['id']))
    db.execute('update cases set updated_at=now() where id=%s', (job['case_id'],))
    return aid


def work_once() -> bool:
    with transaction(worker=True) as db:
        job = claim(db)
    if not job:
        return False
    try:
        if job['attempts'] > MAX_ATTEMPTS:
            raise RuntimeError('attempt limit reached')
        if job['purpose'] == 'export':
            with transaction(worker=True) as db:
                package = export(db, job)
                db.execute("update analysis_jobs set state='done', progress_stage='Complete', result_id=%s, lease_until=null where id=%s", (package, job['id']))
            return True
        snapshot, result, ranked = run(job)
        with transaction(worker=True) as db:
            if db.execute('select lease_owner from analysis_jobs where id=%s for update', (job['id'],)).fetchone()['lease_owner'] != WORKER:
                return True  # lease lost to another worker; its result wins, ours is discarded
            store(db, job, snapshot, result, ranked)
    except Exception as exc:  # noqa: BLE001 - every failure is recorded, never reported as success
        traceback.print_exc()
        dead = job['attempts'] >= MAX_ATTEMPTS
        with transaction(worker=True) as db:
            db.execute(f'''update analysis_jobs set state=%s, last_error=%s, lease_until=null,
                available_at=now()+interval '30 seconds' * attempts where id=%s''',
                       ('failed' if dead else 'queued', type(exc).__name__ + ': ' + str(exc)[:500], job['id']))
    return True


def main():
    print(f'worker {WORKER} polling analysis_jobs', flush=True)
    while True:
        if not work_once():
            time.sleep(2)


if __name__ == '__main__':
    main()

