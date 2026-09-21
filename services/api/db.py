from contextlib import contextmanager
from json import dumps
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from .config import settings
from .security import DomainError


@contextmanager
def transaction(user_id: str | None = None, *, worker: bool = False):
    """User transactions always SET LOCAL ROLE; pooled state never survives a transaction."""
    with psycopg.connect(settings().database_url, row_factory=dict_row, connect_timeout=3) as connection:
        with connection.transaction():
            if not worker:
                if not user_id:
                    raise DomainError('AUTH_REQUIRED', 'Sign in to continue.', 401)
                UUID(user_id)
                connection.execute('set local role authenticated')
                connection.execute("select set_config('request.jwt.claims', %s, true)",
                                   (dumps({'sub': user_id, 'role': 'authenticated'}),))
            yield connection


def require_member(db, org: str):
    row = db.execute('select id from public.memberships where org_id=%s and user_id=auth.uid() and status=\'active\'',
                     (org,)).fetchone()
    if not row:
        raise DomainError('FORBIDDEN', 'Active organization membership is required.', 403)


def require_capability(db, org: str, capability: str):
    require_member(db, org)
    allowed = db.execute('select private.has_capability(%s,%s) as allowed', (org, capability)).fetchone()
    if not allowed['allowed']:
        raise DomainError('FORBIDDEN', 'Your current qualification does not allow this action.', 403)
