"""G10: signed webhook delivery through the worker outbox; private-address, redirect and DNS-rebinding abuse is refused.

Needs the worker running (scripts/restart-local.ps1): it sends to a local test receiver, allowed only outside production.
"""
import base64
import hashlib
import hmac
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace
from uuid import uuid4

import pytest

from services.api.db import transaction
from services.api.security import DomainError, validate_webhook_url
from services.worker import outbox
from tests.api.test_exports import approved_case, export, packages
from tests.api.test_http import ORG, as_, client


@pytest.fixture
def receiver():
    seen, codes = [], []

    class Hook(BaseHTTPRequestHandler):
        def do_POST(self):
            seen.append((dict(self.headers), self.rfile.read(int(self.headers['Content-Length']))))
            code = codes.pop(0) if codes else 200
            self.send_response(code)
            if code == 302:
                self.send_header('Location', 'http://169.254.169.254/latest/meta-data')
            self.end_headers()

        def log_message(self, *args):
            pass
    server = HTTPServer(('127.0.0.1', 0), Hook)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1], seen, codes
    server.shutdown()


def webhook(url):
    return client.post(f'/api/v1/orgs/{ORG}/recipients', headers=as_('admin'),
                       json={'name': f'Hook {uuid4().hex[:6]} (synthetic)', 'method': 'webhook', 'destination': url})


def send(port):
    case, a = approved_case()
    export(a['id'])
    rec = webhook(f'http://127.0.0.1:{port}/hook')
    assert rec.status_code == 201, rec.text
    rec = rec.json()['data']
    d = client.post(f"/api/v1/orgs/{ORG}/packages/{packages(case)[0]['id']}/deliveries", json={'recipient_id': rec['id']}, headers=as_('expert'))
    assert d.status_code == 201, d.text
    return rec, d.json()['data']


def wait_for(delivery, check, timeout=40):
    for _ in range(timeout * 4):
        with transaction(worker=True) as db:
            s = db.execute('''select d.state,d.attempts,d.last_error,extract(epoch from o.next_attempt_at-now()) wait
                from deliveries d join webhook_outbox o on o.delivery_id=d.id where d.id=%s''', (delivery,)).fetchone()
        if check(s):
            return s
        time.sleep(0.25)
    raise AssertionError(s)


def test_signed_delivery_reaches_the_local_test_receiver_once(receiver):  # G10
    port, seen, _ = receiver
    rec, d = send(port)
    assert d['state'] == 'queued' and len(rec['signing_secret']) >= 40
    s = wait_for(d['delivery_id'], lambda s: s['state'] == 'delivered')
    assert s['attempts'] == 1 and len(seen) == 1
    headers, body = seen[0]
    signed = headers['Upstream-Timestamp'].encode() + b'.' + body
    assert hmac.compare_digest(headers['Upstream-Signature'], 'sha256=' + hmac.new(rec['signing_secret'].encode(), signed, hashlib.sha256).hexdigest())
    payload = json.loads(body)
    assert payload['delivery_id'] == d['delivery_id'] == headers['Upstream-Delivery']
    assert hashlib.sha256(base64.b64decode(payload['artifacts']['manifest.json'])).hexdigest() == payload['manifest_hash']
    assert rec['signing_secret'] not in client.get(f'/api/v1/orgs/{ORG}/recipients', headers=as_('admin')).text  # shown once only
    admin = client.get('/api/v1/me', headers=as_('admin')).json()['data']['user_id']
    with transaction(admin) as db:  # RLS on, no policy: signed-in users (even administrators) never read secrets or payloads
        assert db.execute('select (select count(*) from recipient_secrets) + (select count(*) from webhook_outbox) n').fetchone()['n'] == 0


def test_private_and_non_https_destinations_are_refused(monkeypatch):  # G10
    for url in ['https://10.0.0.5/hook', 'https://127.0.0.1/hook', 'https://169.254.169.254/latest', 'https://[::1]/hook',
                'http://example.com/hook', 'https://example.com:8443/hook', 'https://user:pw@example.com/hook', 'http://10.0.0.5/hook']:
        assert webhook(url).status_code == 422, url
    real = socket.getaddrinfo
    monkeypatch.setattr(socket, 'getaddrinfo', lambda host, port, *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('192.168.1.20', port))]
                        if host == 'hooks.recipient.example' else real(host, port, *a, **k))
    assert webhook('https://hooks.recipient.example/in').status_code == 422  # a public-looking name that resolves inside


def test_redirects_are_not_followed(receiver):  # G10
    port, seen, codes = receiver
    codes.append(302)
    _, d = send(port)
    s = wait_for(d['delivery_id'], lambda s: s['attempts'] == 1)
    assert s['state'] == 'queued' and 'redirect' in s['last_error'] and 50 < s['wait'] <= 60  # next try in 1 minute
    assert len(seen) == 1  # the Location target was never requested


def test_dns_rebinding_is_refused_at_delivery_and_the_checked_address_is_used(monkeypatch):  # G10
    answers = iter([['93.184.216.34'], ['127.0.0.1']])
    resolver = lambda host: next(answers)  # noqa: E731 - public when configured, internal when delivering
    validate_webhook_url('https://hooks.recipient.example/in', resolved_ips=resolver('hooks.recipient.example'))
    sent = []
    monkeypatch.setattr(outbox.httpx.Client, 'post', lambda self, url, **kw: sent.append((url, kw)) or SimpleNamespace(status_code=200, is_success=True))
    assert 'public addresses' in outbox.post('https://hooks.recipient.example/in', b'{}', 'secret', 'id', resolver=resolver)
    assert sent == []  # refused before any connection
    assert outbox.post('https://hooks.recipient.example/in', b'{}', 'secret', 'id', resolver=lambda host: ['93.184.216.34']) is None
    url, kw = sent[0]
    assert url == 'https://93.184.216.34/in' and kw['headers']['Host'] == 'hooks.recipient.example'
    assert kw['extensions'] == {'sni_hostname': 'hooks.recipient.example'} and kw['follow_redirects'] is False


def test_local_test_receiver_is_refused_in_production(monkeypatch):  # G10
    with pytest.raises(DomainError):
        validate_webhook_url('http://127.0.0.1:9/hook', local_test=False)
    monkeypatch.setattr(outbox, 'settings', lambda: SimpleNamespace(environment='production'))
    assert 'HTTPS' in outbox.post('http://127.0.0.1:9/hook', b'{}', 'secret', 'id')


def test_retry_schedule_then_failed_then_admin_retry_keeps_id_and_bytes(receiver):  # G10
    port, seen, codes = receiver
    codes.extend([500] * 6)
    _, d = send(port)
    waits = []
    for n in range(1, 7):
        s = wait_for(d['delivery_id'], lambda s: s['attempts'] == n)
        if n < 6:
            waits.append(s['wait'])
            with transaction(worker=True) as db:  # skip the real wait
                db.execute('update webhook_outbox set next_attempt_at=now() where delivery_id=%s', (d['delivery_id'],))
    assert all(want - 15 < got <= want for got, want in zip(waits, outbox.SCHEDULE)), waits
    assert s['state'] == 'failed' and s['last_error'] == 'Recipient answered 500.'
    url = f"/api/v1/orgs/{ORG}/deliveries/{d['delivery_id']}/retry"
    assert client.post(url, headers=as_('expert')).status_code == 403
    r = client.post(url, headers=as_('admin'))
    assert r.status_code == 200 and r.json()['data']['id'] == d['delivery_id']
    wait_for(d['delivery_id'], lambda s: s['state'] == 'delivered')
    assert len(seen) == 7 and {body for _, body in seen} == {seen[0][1]}  # same logical delivery, same bytes every time
    assert client.post(url, headers=as_('admin')).status_code == 409
    listed = client.get(f'/api/v1/orgs/{ORG}/deliveries', headers=as_('admin')).json()['data']
    assert next(x for x in listed if x['id'] == d['delivery_id'])['state'] == 'delivered'
