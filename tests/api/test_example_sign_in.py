"""One-click entry to the synthetic example workspace: only in example mode, only the fixed example.test people, and only a
one-time sign-in token (never a password) reaches the browser. Outside example mode the door does not exist."""
import pytest

from services.api.config import settings
from tests.api.test_http import client


def test_example_roles_are_offered_only_in_example_mode(monkeypatch):
    if not settings().supabase_service_role_key:
        pytest.skip('needs the local Supabase service key (set by the local stack)')
    roles = client.get('/api/v1/example/roles').json()['data']
    assert [r['role'] for r in roles] == ['coordinator', 'expert', 'contributor']
    monkeypatch.setattr(settings(), 'example_mode', False)
    assert client.get('/api/v1/example/roles').json()['data'] == []
    assert client.post('/api/v1/example/sign-in', json={'role': 'coordinator'}).status_code == 404


def test_example_sign_in_returns_a_one_time_token_for_an_example_person_only():
    if not settings().supabase_service_role_key:
        pytest.skip('needs the local Supabase service key (set by the local stack)')
    r = client.post('/api/v1/example/sign-in', json={'role': 'coordinator'})
    assert r.status_code == 200, r.text
    data = r.json()['data']
    assert set(data) == {'token_hash', 'email'} and data['email'] == 'coordinator@example.test' and data['token_hash']
    assert 'password' not in r.text.lower()
    for other in ('admin', 'monitor', 'someone@example.com'):    # no other account can be reached through this door
        assert client.post('/api/v1/example/sign-in', json={'role': other}).status_code == 422
