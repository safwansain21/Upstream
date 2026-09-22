"""Synthetic load workspace for performance checks (J03): 10,000 cases and 600 located reports in a separate example org.
Idempotent; refuses non-local databases (same guard as the example seed). Usage: python scripts/seed_load.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'packages/engine')]
from scripts.seed_example import guard, sid  # noqa: E402
from services.api.db import transaction  # noqa: E402

LOAD_ORG = sid('load-test-org')


def main(cases=10000, located=600):
    guard()
    with transaction(worker=True) as db:
        db.execute('''insert into organizations(id,name,slug,intake_enabled,example,contact) values(%s,'Zz load test workspace (synthetic)','load-test',false,true,
            'Synthetic performance data') on conflict(id) do nothing''', (LOAD_ORG,))
        coordinator = db.execute("select id from auth.users where email='coordinator@example.test'").fetchone()['id']
        mid = db.execute("""insert into memberships(org_id,user_id) values(%s,%s) on conflict(org_id,user_id) do update set status='active' returning id""",
                         (LOAD_ORG, coordinator)).fetchone()['id']
        db.execute("insert into member_capabilities(org_id,membership_id,capability,granted_by) values(%s,%s,'coordinate',%s) on conflict do nothing",
                   (LOAD_ORG, mid, coordinator))
        have = db.execute('select count(*) n from cases where org_id=%s', (LOAD_ORG,)).fetchone()['n']
        if have < cases:
            db.execute('''insert into cases(org_id,title,locality,workflow,data_origin,created_by,updated_at)
                select %s,'Load stream '||g,'Synthetic district '||(g %% 40),(array['reported','triage','localization_active'])[1+g %% 3],'synthetic',%s,
                       now()-(g||' minutes')::interval from generate_series(%s::int,%s::int) g''', (LOAD_ORG, coordinator, have + 1, cases))
            db.execute('''insert into reports(org_id,case_id,reporter_id,client_id,categories,description,observed_at,timezone,location,landmark,
                location_precision,accuracy_m,location_method,data_origin)
                select c.org_id,c.id,%s,gen_random_uuid(),'{unusual_foam}','Synthetic load report',now(),'UTC',
                  extensions.st_setsrid(extensions.st_makepoint(-2.9+random()*0.8,51.2+random()*0.5),4326),'Synthetic','approximate',25,'gps','synthetic'
                from (select * from cases where org_id=%s and not exists(select 1 from reports r where r.case_id=cases.id) order by updated_at desc limit %s) c''',
                       (coordinator, LOAD_ORG, located))
            db.execute('''insert into case_reports(org_id,case_id,report_id) select r.org_id,r.case_id,r.id from reports r
                where r.org_id=%s on conflict do nothing''', (LOAD_ORG,))
        print({'org': LOAD_ORG, 'cases': db.execute('select count(*) n from cases where org_id=%s', (LOAD_ORG,)).fetchone()['n']})


if __name__ == '__main__':
    main()
