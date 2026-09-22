"""A06: first real organization/admin setup refuses example credentials and grants only administration."""
from uuid import uuid4

import pytest

from scripts.bootstrap_org import bootstrap
from tests.api.test_http import client, fresh_contributor, token


def test_bootstrap_creates_real_org_with_admin_only():
    email = fresh_contributor.__wrapped__().replace('@example.test', '@org.example')  # not an example account
    from services.api.config import settings
    import httpx
    cfg = settings()
    r = httpx.post(cfg.supabase_url + '/auth/v1/admin/users', timeout=15, json={'email': email, 'password': 'a-unique-strong-passphrase-1', 'email_confirm': True},
                   headers={'apikey': cfg.supabase_service_role_key, 'Authorization': f'Bearer {cfg.supabase_service_role_key}'})
    assert r.status_code == 200, r.text
    slug = f'river-trust-{uuid4().hex[:6]}'
    result = bootstrap('River Trust (test)', slug, email)
    me = httpx.post(cfg.supabase_url + '/auth/v1/token?grant_type=password', headers={'apikey': cfg.supabase_anon_key},
                    json={'email': email, 'password': 'a-unique-strong-passphrase-1'}).json()['access_token']
    orgs = client.get('/api/v1/me', headers={'Authorization': f'Bearer {me}'}).json()['data']['organizations']
    org = next(o for o in orgs if o['id'] == result['organization_id'])
    assert org['capabilities'] == ['admin'] and not org['example']
    with pytest.raises(SystemExit):
        bootstrap('Other', f'x-{uuid4().hex[:6]}', 'admin@example.test')
    with pytest.raises(SystemExit):
        bootstrap('Dup', slug, email)
