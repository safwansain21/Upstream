"""Real Postgres policy checks. An unavailable database is a failure, never a skip."""
import os
from uuid import uuid4

import psycopg
import pytest

URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')


@pytest.fixture
def db():
    with psycopg.connect(URL, autocommit=False, connect_timeout=3) as connection:
        yield connection
        connection.rollback()


def test_all_domain_tables_have_rls(db):
    rows = db.execute("select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'").fetchall()
    assert len(rows) >= 40
    assert all(enabled for name, enabled in rows)


def test_cross_tenant_relationship_is_rejected(db):
    org1, org2, case = uuid4(), uuid4(), uuid4()
    db.execute("insert into organizations(id,name,slug) values(%s,'One',%s),(%s,'Two',%s)", (org1,str(org1),org2,str(org2)))
    db.execute("insert into cases(id,org_id,title) values(%s,%s,'Private case')", (case,org1))
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute("insert into reports(org_id,case_id,client_id,description,observed_at,timezone,landmark) values(%s,%s,%s,'A stream observation',now(),'UTC','Bridge')", (org2,case,uuid4()))


def test_anonymous_cannot_read_private_case(db):
    db.execute('set local role anon')
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        db.execute('select * from reports')


def test_versions_are_immutable_even_for_maintenance(db):
    org, case, report = uuid4(), uuid4(), uuid4()
    db.execute("insert into organizations(id,name,slug) values(%s,'One',%s)",(org,str(org)))
    db.execute("insert into cases(id,org_id,title) values(%s,%s,'Case')",(case,org))
    db.execute("insert into reports(id,org_id,case_id,client_id,description,observed_at,timezone,landmark) values(%s,%s,%s,%s,'At a footbridge',now(),'UTC','Bridge')",(report,org,case,uuid4()))
    db.execute("insert into report_versions(org_id,report_id,version,content,content_hash) values(%s,%s,1,'{}','hash')",(org,report))
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute('update report_versions set content_hash=\'changed\' where report_id=%s',(report,))
