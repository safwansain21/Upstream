"""Create a real (non-example) organization and make an existing, email-verified account its first administrator.

Usage: python scripts/bootstrap_org.py --name "River Trust" --slug river-trust --admin-email person@org.example [--intake]

The administrator signs up through the normal email flow first; this script never creates passwords and refuses
example accounts. Administration does not grant expert review or network verification (grant those separately).
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.api.db import transaction  # noqa: E402


def bootstrap(name: str, slug: str, admin_email: str, intake: bool = False) -> dict:
    if admin_email.lower().endswith('@example.test'):
        raise SystemExit('Refusing: example accounts cannot administer a real organization.')
    if len(name.strip()) < 2 or not slug.replace('-', '').isalnum():
        raise SystemExit('Provide an organization name and a slug of letters, digits and hyphens.')
    with transaction(worker=True) as db:
        user = db.execute('select id,email_confirmed_at from auth.users where lower(email)=lower(%s)', (admin_email,)).fetchone()
        if not user or not user['email_confirmed_at']:
            raise SystemExit('The administrator must sign up and verify their email address first.')
        if db.execute('select 1 from organizations where slug=%s', (slug,)).fetchone():
            raise SystemExit(f'An organization with slug {slug!r} already exists.')
        org = db.execute('''insert into organizations(name,slug,intake_enabled,example) values(%s,%s,%s,false) returning id''',
                         (name.strip(), slug, intake)).fetchone()['id']
        mid = db.execute("insert into memberships(org_id,user_id,status) values(%s,%s,'active') returning id", (org, user['id'])).fetchone()['id']
        db.execute("insert into member_capabilities(org_id,membership_id,capability,granted_by) values(%s,%s,'admin',%s)", (org, mid, user['id']))
        db.execute("insert into profiles(id) values(%s) on conflict(id) do nothing", (user['id'],))
        db.execute("insert into audit_log(org_id,actor_id,action,object_id,outcome) values(%s,%s,'organization.bootstrapped',%s,'accepted')", (org, user['id'], org))
    return {'organization_id': str(org), 'admin_user_id': str(user['id']), 'intake_enabled': intake}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--name', required=True)
    parser.add_argument('--slug', required=True)
    parser.add_argument('--admin-email', required=True)
    parser.add_argument('--intake', action='store_true', help='accept citizen reports without a chosen organization (set INTAKE_ORG_ID to the printed id)')
    args = parser.parse_args()
    print(bootstrap(args.name, args.slug, args.admin_email, args.intake))


if __name__ == '__main__':
    main()
