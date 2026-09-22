"""G10 webhook outbox: HMAC-signed POSTs to administrator-configured HTTPS destinations.

DNS is resolved and checked again at every attempt and the request goes to that checked address (no rebinding window);
redirects are never followed. Retries at 1m, 5m, 30m, 2h and 12h, then the delivery is marked failed; an administrator
retry keeps the delivery ID and the stored payload bytes.
"""
import hashlib
import hmac
import socket
import time
from urllib.parse import urlsplit

import httpx

from services.api.config import settings
from services.api.db import transaction
from services.api.security import DomainError, validate_webhook_url

SCHEDULE = [60, 300, 1800, 7200, 43200]  # seconds after failed attempts 1-5; attempt 6 failing marks the delivery failed


def resolve(host):
    return sorted({r[4][0] for r in socket.getaddrinfo(host, 443)})


def signature(secret: str, timestamp: str, payload: bytes):
    return 'sha256=' + hmac.new(secret.encode(), timestamp.encode() + b'.' + payload, hashlib.sha256).hexdigest()


def post(url: str, payload: bytes, secret: str, delivery_id: str, resolver=resolve):
    """One attempt. Returns None on transport receipt (2xx), else a short reason. Never raises."""
    parts = urlsplit(url)
    local = settings().environment != 'production' and parts.scheme == 'http'  # the local test receiver, never in production
    try:
        ips = [] if local else resolver(parts.hostname)
        validate_webhook_url(url, resolved_ips=ips, local_test=settings().environment != 'production')
    except DomainError as exc:
        return exc.message
    except OSError:
        return 'Recipient host could not be resolved.'
    timestamp = str(int(time.time()))
    headers = {'Content-Type': 'application/json', 'Upstream-Delivery': delivery_id, 'Upstream-Timestamp': timestamp,
               'Upstream-Signature': signature(secret, timestamp, payload)}
    target, extensions = url, {}
    if not local:  # connect to the address that was just checked; TLS still verifies the configured host name
        ip = ips[0]
        target = parts._replace(netloc=f'[{ip}]' if ':' in ip else ip).geturl()
        headers['Host'], extensions = parts.hostname, {'sni_hostname': parts.hostname}
    try:
        with httpx.Client(timeout=10) as http:  # module-level httpx.post takes no extensions
            r = http.post(target, content=payload, headers=headers, follow_redirects=False, extensions=extensions)
    except httpx.HTTPError:
        return 'Recipient could not be reached.'
    if 300 <= r.status_code < 400:
        return f'Recipient answered with a redirect ({r.status_code}); redirects are not followed.'
    return None if r.is_success else f'Recipient answered {r.status_code}.'


def send_due():
    """Send one due delivery. Returns True if one was attempted (the worker loop then polls again at once)."""
    with transaction(worker=True) as db:
        row = db.execute('''select o.delivery_id,o.payload,d.attempts,r.destination,s.secret from webhook_outbox o
            join deliveries d on d.id=o.delivery_id join recipients r on r.id=d.recipient_id join recipient_secrets s on s.recipient_id=r.id
            where d.state='queued' and o.next_attempt_at<=now() order by o.next_attempt_at
            for update of o skip locked limit 1''').fetchone()
        if not row:
            return False
        error = post(row['destination'], bytes(row['payload']), row['secret'], str(row['delivery_id']))
        attempts = row['attempts'] + 1
        if error is None:
            db.execute("update deliveries set state='delivered',delivered_at=now(),attempts=%s,last_error=null where id=%s", (attempts, row['delivery_id']))
        elif attempts > len(SCHEDULE):
            db.execute("update deliveries set state='failed',attempts=%s,last_error=%s where id=%s", (attempts, error, row['delivery_id']))
        else:
            db.execute('update deliveries set attempts=%s,last_error=%s where id=%s', (attempts, error, row['delivery_id']))
            db.execute("update webhook_outbox set next_attempt_at=now()+%s*interval '1 second' where delivery_id=%s", (SCHEDULE[attempts - 1], row['delivery_id']))
        return True
