"""HTTP boundary: identity, envelopes and error mapping. Authority lives in database RPCs and RLS."""
from decimal import Decimal
from uuid import UUID, uuid4

import psycopg
from fastapi import Depends, FastAPI, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .auth import Identity, identity
from .config import settings
from .contracts import ProfilePatch, ReportCreate, TaskCreate, Assignment, TaskTransition, StrictModel
from .db import transaction
from .security import DomainError, verify_origin

app = FastAPI(title='Upstream API', version='1', openapi_url='/api/v1/openapi.json', docs_url=None, redoc_url=None)
STATUS = {'AUTH_REQUIRED': 401, 'FORBIDDEN': 403, 'NOT_FOUND': 404, 'VERSION_CONFLICT': 409,
          'DEPENDENCY_CHANGED': 409, 'IDEMPOTENCY_MISMATCH': 409, 'VALIDATION_FAILED': 422,
          'READINESS_REQUIRED': 422, 'RATE_LIMITED': 429, 'PROVIDER_UNAVAILABLE': 503}


def envelope(data, request: Request, status=200, version=None):
    meta = {'request_id': request.state.request_id} | ({'version': version} if version else {})
    return JSONResponse(jsonable_encoder({'data': data, 'meta': meta}, custom_encoder={Decimal: str}), status)


def error(request: Request, code: str, message: str, status: int, retryable=False, field_errors=None):
    body = {'code': code, 'message': message, 'retryable': retryable, 'request_id': request.state.request_id}
    if field_errors:
        body['field_errors'] = field_errors
    return JSONResponse({'error': body}, status)


@app.middleware('http')
async def request_context(request: Request, call_next):
    request.state.request_id = str(uuid4())
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        try:
            verify_origin(request.headers.get('origin'), settings().app_url)
        except DomainError as exc:
            return error(request, exc.code, exc.message, exc.status)
    response = await call_next(request)
    response.headers['x-request-id'] = request.state.request_id
    return response


@app.exception_handler(DomainError)
async def domain_error(request: Request, exc: DomainError):
    return error(request, exc.code, exc.message, exc.status, exc.retryable)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = {'.'.join(str(p) for p in e['loc'][1:]) or 'body': e['msg'] for e in exc.errors()}
    return error(request, 'VALIDATION_FAILED', 'Check the highlighted fields.', 422, field_errors=fields)


@app.exception_handler(psycopg.Error)
async def database_error(request: Request, exc: psycopg.Error):
    # RPCs raise their error code as the message prefix; never leak SQL detail beyond the RPC's own text.
    text = (exc.diag.message_primary or '') if exc.diag else ''
    code = text.split(':')[0].strip()
    if code in STATUS:
        detail = text.split(':', 1)[1].strip() if ':' in text else code.replace('_', ' ').capitalize()
        return error(request, code, detail, STATUS[code], code == 'RATE_LIMITED')
    if isinstance(exc, psycopg.errors.InsufficientPrivilege):
        return error(request, 'FORBIDDEN', 'You do not have access to this record.', 403)
    if isinstance(exc, psycopg.errors.ExclusionViolation):
        return error(request, 'VERSION_CONFLICT', 'The instrument is already booked for that time.', 409)
    if isinstance(exc, (psycopg.errors.IntegrityError, psycopg.errors.DataError)):
        return error(request, 'VALIDATION_FAILED', 'The request conflicts with existing records.', 422)
    if isinstance(exc, psycopg.OperationalError):
        return error(request, 'PROVIDER_UNAVAILABLE', 'The database is temporarily unavailable.', 503, True)
    raise exc


def idem_key(key: str | None = Header(default=None, alias='Idempotency-Key')) -> UUID:
    try:
        return UUID(key or '')
    except ValueError:
        raise DomainError('VALIDATION_FAILED', 'An Idempotency-Key UUID header is required.')


def rpc(user: Identity, sql: str, args: tuple):
    with transaction(user.user_id) as db:
        return next(iter(db.execute(sql, args).fetchone().values()))


def rows(user: Identity, sql: str, args: tuple = ()):
    with transaction(user.user_id) as db:
        return db.execute(sql, args).fetchall()


def one(user: Identity, sql: str, args: tuple):
    found = rows(user, sql, args)
    if not found:  # RLS hides other tenants' rows: indistinguishable from absent (privacy-preserving 404)
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    return found[0]


# ---- health / identity ----

@app.get('/api/v1/health')
def health(request: Request):
    checks = {'api': 'ok'}
    try:
        with transaction(worker=True) as db:
            db.execute('select 1')
            checks['database'] = 'ok'
            checks['worker'] = 'ok' if db.execute(
                "select count(*)=0 as ok from analysis_jobs where state='running' and lease_until<now()").fetchone()['ok'] else 'stalled'
    except psycopg.Error:
        checks['database'] = 'unavailable'
    checks['ai'] = 'configured' if settings().ai_api_key else 'unavailable'
    checks['signing'] = 'configured' if settings().export_signing_private_key else 'unsigned'
    return envelope(checks, request)


@app.get('/api/v1/me')
def me(request: Request, user: Identity = Depends(identity)):
    with transaction(user.user_id) as db:
        profile = db.execute('select id,display_name,locale,motion_preference,simplify_map from profiles where id=auth.uid()').fetchone()
        orgs = db.execute('''select o.id,o.name,o.slug,o.example,m.status,
            coalesce(array_agg(c.capability) filter (where c.capability is not null and (c.expires_at is null or c.expires_at>now())),'{}') capabilities
            from memberships m join organizations o on o.id=m.org_id left join member_capabilities c on c.membership_id=m.id
            where m.user_id=auth.uid() group by o.id,m.status order by o.name''').fetchall()
    return envelope({'user_id': user.user_id, 'profile': profile, 'organizations': orgs}, request)


@app.patch('/api/v1/profile')
def patch_profile(body: ProfilePatch, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.update_profile(%s::jsonb)', (body.model_dump_json(exclude_none=True),)), request)


# ---- reports ----

@app.post('/api/v1/orgs/{org}/reports', status_code=201)
def create_report(org: UUID, body: ReportCreate, request: Request, key: UUID = Depends(idem_key),
                  user: Identity = Depends(identity)):
    result = rpc(user, 'select public.submit_report(%s,%s,%s::jsonb)', (org, key, body.model_dump_json()))
    return envelope(result, request, 201)


REPORT_COLUMNS = '''r.id,r.case_id,r.categories,r.description,r.observed_at,r.timezone,r.landmark,r.location_precision,
 r.accuracy_m,r.location_method,r.public_visibility,r.version,r.created_at,r.data_origin,c.title case_title,c.workflow,
 extensions.st_y(r.location) latitude,extensions.st_x(r.location) longitude'''


@app.get('/api/v1/orgs/{org}/reports')
def own_reports(org: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, f'select {REPORT_COLUMNS} from reports r join cases c on c.id=r.case_id '
                                'where r.org_id=%s and r.reporter_id=auth.uid() order by r.created_at desc limit 100', (org,)), request)


@app.get('/api/v1/orgs/{org}/reports/{report}')
def report_detail(org: UUID, report: UUID, request: Request, user: Identity = Depends(identity)):
    data = one(user, f'select {REPORT_COLUMNS} from reports r join cases c on c.id=r.case_id where r.org_id=%s and r.id=%s', (org, report))
    data['versions'] = rows(user, 'select version,change_reason,created_at from report_versions where report_id=%s order by version', (report,))
    return envelope(data, request, version=data['version'])


class Visibility(StrictModel):
    expected_version: int
    public_visibility: bool


@app.post('/api/v1/orgs/{org}/reports/{report}/visibility')
def report_visibility(org: UUID, report: UUID, body: Visibility, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.report_visibility(%s,%s,%s,%s)',
                        (org, report, body.expected_version, body.public_visibility)), request)


# ---- cases ----

@app.get('/api/v1/orgs/{org}/cases')
def cases(org: UUID, request: Request, q: str = '', workflow: str = '', origin: str = '', mine: bool = False,
          cursor: str = '', limit: int = 25, user: Identity = Depends(identity)):
    limit = max(1, min(limit, 100))
    where, args = ['c.org_id=%s', 'c.merged_into is null'], [org]
    if q:
        where.append("(c.title ilike %s or coalesce(c.locality,'') ilike %s or c.id::text like %s)")
        args += [f'%{q}%', f'%{q}%', f'{q}%']
    if workflow:
        where.append('c.workflow=%s'); args.append(workflow)
    if origin:
        where.append('c.data_origin=%s'); args.append(origin)
    if mine:
        where.append('(c.created_by=auth.uid() or exists(select 1 from tasks t where t.case_id=c.id and t.assignee_id=auth.uid()))')
    if cursor:  # keyset cursor "updated_at|id"
        stamp, _, cid = cursor.partition('|')
        where.append('(c.updated_at,c.id)<(%s::timestamptz,%s::uuid)'); args += [stamp, cid]
    found = rows(user, f'''select c.id,c.title,c.locality,c.workflow,c.data_origin,c.updated_at,c.version,c.network_id,
        c.current_assessment_id,(select count(*) from case_reports cr where cr.case_id=c.id) report_count,
        (c.created_by=auth.uid()) mine from cases c where {' and '.join(where)}
        order by c.updated_at desc,c.id desc limit %s''', (*args, limit + 1))
    more = len(found) > limit
    found = found[:limit]
    cursor = f"{found[-1]['updated_at'].isoformat()}|{found[-1]['id']}" if more else None
    return envelope({'items': found, 'next_cursor': cursor}, request)


@app.get('/api/v1/orgs/{org}/cases/{case}')
def case_detail(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    data = one(user, '''select id,title,locality,workflow,data_origin,version,review_hold,network_id,current_assessment_id,
        waterway_id,created_at,updated_at from cases where org_id=%s and id=%s''', (org, case))
    data['reports'] = rows(user, f'select {REPORT_COLUMNS} from reports r join cases c on c.id=r.case_id '
                                 'where r.org_id=%s and r.case_id=%s order by r.observed_at', (org, case))
    data['events'] = rows(user, 'select sequence,event_type,object_id,object_version,occurred_at from case_events '
                                'where org_id=%s and case_id=%s order by sequence desc limit 50', (org, case))
    return envelope(data, request, version=data['version'])


# ---- tasks ----

@app.get('/api/v1/orgs/{org}/tasks')
def tasks(org: UUID, request: Request, case: UUID | None = None, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select t.*,c.title case_title,s.code station_code from tasks t join cases c on c.id=t.case_id
        left join stations s on s.id=t.station_id where t.org_id=%s and (%s::uuid is null or t.case_id=%s)
        order by t.window_start''', (org, case, case)), request)


@app.post('/api/v1/orgs/{org}/tasks', status_code=201)
def create_task(org: UUID, body: TaskCreate, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.create_task(%s,%s::jsonb)', (org, body.model_dump_json())), request, 201)


@app.post('/api/v1/orgs/{org}/tasks/{task}/assign')
def assign_task(org: UUID, task: UUID, body: Assignment, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.assign_task(%s,%s,%s,%s,%s,false)',
                        (org, task, body.expected_version, body.assignee_id, body.instrument_id)), request)


@app.post('/api/v1/orgs/{org}/tasks/{task}/transition')
def transition_task(org: UUID, task: UUID, body: TaskTransition, request: Request, user: Identity = Depends(identity)):
    if body.action == 'claim':
        result = rpc(user, 'select public.assign_task(%s,%s,%s,auth.uid(),null,true)', (org, task, body.expected_version))
    else:
        result = rpc(user, 'select public.transition_task(%s,%s,%s,%s,%s,%s)',
                     (org, task, body.expected_version, body.action, body.reason, body.outcome))
    return envelope(result, request)
