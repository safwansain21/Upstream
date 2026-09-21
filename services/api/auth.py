from dataclasses import dataclass
from uuid import UUID

import httpx
import jwt
from fastapi import Header

from .config import settings
from .security import DomainError


@dataclass(frozen=True)
class Identity:
    user_id: str
    token: str


async def identity(authorization: str | None = Header(default=None)) -> Identity:
    if not authorization or not authorization.startswith('Bearer '):
        raise DomainError('AUTH_REQUIRED', 'Sign in to continue. Your draft is saved on this device.', 401)
    token = authorization[7:]
    cfg = settings()
    try:
        header = jwt.get_unverified_header(token)
        if header.get('alg') in {'ES256', 'RS256'}:
            client = jwt.PyJWKClient(cfg.auth_jwks_url, cache_keys=True, lifespan=300)
            key = client.get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=['ES256', 'RS256'], audience=cfg.auth_audience,
                                issuer=cfg.auth_issuer, options={'require': ['exp', 'sub', 'iss', 'aud']})
            uid = str(UUID(claims['sub']))
        else:
            # Local Supabase can issue legacy HS256 tokens. Verify remotely, never trust decoded claims.
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(cfg.supabase_url + '/auth/v1/user',
                                            headers={'Authorization': authorization, 'apikey': cfg.supabase_anon_key})
            if response.status_code != 200 or not response.json().get('email_confirmed_at'):
                raise ValueError('Invalid or unverified session')
            uid = str(UUID(response.json()['id']))
        return Identity(uid, token)
    except (jwt.PyJWTError, ValueError, KeyError):
        raise DomainError('AUTH_REQUIRED', 'Your session expired. Sign in again; your draft is preserved.', 401)
    except (httpx.HTTPError, jwt.PyJWKClientError):
        raise DomainError('PROVIDER_UNAVAILABLE', 'Authentication is temporarily unavailable.', 503, True)
