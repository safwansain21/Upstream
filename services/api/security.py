"""Authorization utilities with explicit origin and outbound URL boundaries."""
import ipaddress
import socket
from urllib.parse import urlsplit


class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 422, retryable: bool = False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable
        super().__init__(message)


def verify_origin(origin: str | None, app_url: str):
    if origin and origin.rstrip('/') != app_url.rstrip('/'):
        raise DomainError('FORBIDDEN', 'This request origin is not allowed.', 403)


def validate_webhook_url(url: str, *, resolved_ips: list[str] | None = None, local_test: bool = False):
    parsed = urlsplit(url)
    if parsed.username or parsed.password or not parsed.hostname or parsed.fragment:
        raise DomainError('VALIDATION_FAILED', 'Recipient URL is invalid.')
    if local_test and parsed.hostname in {'127.0.0.1', 'localhost', 'test-receiver'} and parsed.scheme == 'http':
        return url
    if parsed.scheme != 'https' or parsed.port not in {None, 443}:
        raise DomainError('VALIDATION_FAILED', 'Recipients require an HTTPS destination on port 443.')
    try:
        addresses = resolved_ips or list({r[4][0] for r in socket.getaddrinfo(parsed.hostname, 443)})
        if not addresses or any(not ipaddress.ip_address(value).is_global for value in addresses):
            raise ValueError('non-public destination')
    except (ValueError, OSError):
        raise DomainError('VALIDATION_FAILED', 'Recipient must resolve exclusively to public addresses.')
    return url
