"""Private object storage through the server-side service key; never exposed to browsers."""
import httpx

from .config import settings
from .security import DomainError


def storage(method: str, key: str, content: bytes | None = None, mime: str = ''):
    cfg = settings()  # service key stays server-side; objects are only reachable through authorized endpoints
    headers = {'apikey': cfg.supabase_service_role_key, 'Authorization': f'Bearer {cfg.supabase_service_role_key}'}
    if mime:
        headers['Content-Type'] = mime
    try:
        r = httpx.request(method, f'{cfg.supabase_url}/storage/v1/object/{cfg.storage_bucket}/{key}', headers=headers,
                          content=content, timeout=30)
    except httpx.HTTPError:
        raise DomainError('PROVIDER_UNAVAILABLE', 'Evidence storage is unavailable. Your draft is kept on this device.', 503, True)
    if r.status_code >= 300:
        raise DomainError('PROVIDER_UNAVAILABLE', 'Evidence storage rejected the file. Your draft is kept on this device.', 503, True)
    return r.content
