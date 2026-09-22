"""HTTP boundary: identity, envelopes and error mapping. Authority lives in database RPCs and RLS."""
import hashlib
import io
import json
import sys
from pathlib import Path
from decimal import Decimal
from uuid import UUID, uuid4

import httpx
import psycopg
from fastapi import Depends, FastAPI, File, Form, Header, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/engine'))
from upstream_engine import canonical_hash  # noqa: E402
from upstream_engine.readiness import readiness_reasons  # noqa: E402

from services.worker.snapshot import NotReady, build as build_snapshot  # noqa: E402

from .auth import Identity, identity
from .config import settings
from .contracts import Assignment, CaseDecision, ProfilePatch, ReportCreate, StrictModel, TaskCreate, TaskTransition
from .db import transaction
from .security import DomainError, verify_origin
from .storage import storage

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
    if isinstance(exc, psycopg.errors.TransactionRollback):  # deadlock/serialization: a concurrent change won
        return error(request, 'VERSION_CONFLICT', 'Another change happened at the same time. Reload and try again.', 409, True)
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

@app.get('/api/v1/status')
@app.get('/api/v1/health')
def status(request: Request):
    """Non-sensitive availability only. Optional providers report their own state, never a total outage."""
    cfg = settings()
    checks = {'api': 'available', 'storage': 'unverified',
              'ai': 'configured' if cfg.ai_api_key else 'unavailable',
              'email': 'local_mail_catcher' if cfg.environment != 'production' else 'configured'}
    try:
        with transaction(worker=True) as db:
            checks['database'] = 'available'
            stalled = db.execute("select count(*) n from analysis_jobs where state='running' and lease_until<now()").fetchone()['n']
            checks['worker'] = 'unavailable' if stalled else 'available'
    except psycopg.Error:
        checks['database'] = checks['worker'] = 'unavailable'
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
    data['media'] = rows(user, 'select id,width,height,consent_original from media_assets where report_id=%s order by created_at', (report,))
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
        (c.created_by=auth.uid()) mine,
        (select json_build_object('lon',extensions.st_x(r.location),'lat',extensions.st_y(r.location),'accuracy_m',r.accuracy_m,
          'precision',r.location_precision) from reports r where r.case_id=c.id and r.location is not null order by r.created_at limit 1) location
        from cases c where {' and '.join(where)}
        order by c.updated_at desc,c.id desc limit %s''', (*args, limit + 1))
    more = len(found) > limit
    found = found[:limit]
    cursor = f"{found[-1]['updated_at'].isoformat()}|{found[-1]['id']}" if more else None
    return envelope({'items': found, 'next_cursor': cursor}, request)


@app.get('/api/v1/orgs/{org}/cases/{case}')
def case_detail(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    data = one(user, '''select id,title,locality,workflow,data_origin,version,review_hold,network_id,current_assessment_id,
        waterway_id,merged_into,created_at,updated_at from cases where org_id=%s and id=%s''', (org, case))
    data['reports'] = rows(user, f'select {REPORT_COLUMNS} from case_reports cr join reports r on r.id=cr.report_id join cases c on c.id=r.case_id '
                                 'where cr.org_id=%s and cr.case_id=%s order by r.observed_at', (org, case))  # includes merged reports
    data['waterway'] = (rows(user, 'select id,local_name,external_ids,provisional,version from waterways where id=%s', (data['waterway_id'],)) or [None])[0] if data['waterway_id'] else None
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


# ---- uploads / media ----

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard (G08); also checked explicitly below
MAX_BYTES = 15 * 1024 * 1024
FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}


@app.post('/api/v1/orgs/{org}/uploads', status_code=201)
async def upload(org: UUID, request: Request, file: UploadFile = File(...), keep_original: bool = Form(False),
                 user: Identity = Depends(identity)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise DomainError('VALIDATION_FAILED', 'Each photo must be 15 MB or smaller.')
    try:  # trust decoded content, never the filename or declared MIME
        image = Image.open(io.BytesIO(data))
        if image.format not in FORMATS:
            raise ValueError
        if image.width * image.height > 40_000_000:
            raise DomainError('VALIDATION_FAILED', 'Photos larger than 40 megapixels are not accepted.')
        image.load()
    except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise DomainError('VALIDATION_FAILED', 'This file is not a readable JPEG, PNG or WebP photo. HEIC conversion is not yet available.')
    derivative = ImageOps.exif_transpose(image).convert('RGB')
    derivative.thumbnail((2400, 2400))
    out = io.BytesIO()
    derivative.save(out, 'JPEG', quality=85)  # re-encoding drops EXIF including GPS (B07)
    media_id = uuid4()
    with transaction(user.user_id) as db:  # same intake/membership rule as submit_report (which runs as definer)
        member = db.execute('select private.is_member(%s) ok', (org,)).fetchone()['ok']
    with transaction(worker=True) as db:  # a first-time reporter cannot read the org row under RLS yet
        intake = db.execute('select intake_enabled from organizations where id=%s', (org,)).fetchone()
    allowed = member or bool(intake and intake['intake_enabled'])
    if not allowed:
        raise DomainError('FORBIDDEN', 'This organization does not accept your uploads.', 403)
    base = f'{org}/{user.user_id}/{media_id}'
    storage('POST', f'{base}/derivative.jpg', out.getvalue(), 'image/jpeg')
    if keep_original:
        storage('POST', f'{base}/original', data, FORMATS[image.format])
    with transaction(worker=True) as db:
        db.execute('insert into memberships(org_id,user_id) values(%s,%s) on conflict do nothing', (org, user.user_id))
        db.execute('''insert into media_assets(id,org_id,owner_id,private_key,derivative_key,mime,sha256,bytes,width,height,
            consent_original,scan_state) values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ready')''',
                   (media_id, org, user.user_id, f'{base}/original' if keep_original else f'{base}/derivative.jpg',
                    f'{base}/derivative.jpg', FORMATS[image.format], hashlib.sha256(data).hexdigest(), len(data),
                    image.width, image.height, keep_original))
    return envelope({'id': media_id, 'width': derivative.width, 'height': derivative.height, 'bytes': len(data)}, request, 201)


@app.get('/api/v1/orgs/{org}/media/{media}')
def media(org: UUID, media: UUID, original: bool = False, user: Identity = Depends(identity)):
    row = one(user, 'select private_key,derivative_key,mime,consent_original from media_assets where org_id=%s and id=%s', (org, media))
    if original and not row['consent_original']:
        raise DomainError('NOT_FOUND', 'No original was retained for this photo.', 404)
    key, mime = (row['private_key'], row['mime']) if original else (row['derivative_key'], 'image/jpeg')
    return Response(storage('GET', key), media_type=mime, headers={'Cache-Control': 'private, max-age=300'})


# ---- readiness / analyses / assessments ----

READINESS_CHECKS = [  # label -> engine/builder reason fragments; each check is reported independently (C09)
    ('Local network mapped and reviewed', ('mapping_incomplete: no local', 'network or mixing not reviewed')),
    ('Connectivity and flow direction verified', ('connectivity or direction unknown',)),
    ('Supported flow regime', ('unsupported_flow_model',)),
    ('Boundary inflow treatment evidenced', ('boundary treatment',)),
    ('Station positions approved', ('station position not approved', 'unapproved station', 'split the reach')),
    ('Accepted measurements', ('accepted measurements needed',)),
    ('Background ranges for measured stations', ('background',)),
    ('Instrument calibration and uncertainty', ('calibration', 'uncertainty metadata', 'Invalid instrument')),
    ('Transport intervals', ('transport', 'velocity', 'travel')),
    ('Anchor and persistence', ('persistence', 'anchor', 'sustained')),
    ('Comparability of readings', ('comparability pending',)),
]


def case_access(user: Identity, org: UUID, case: UUID, capabilities=('coordinate', 'expert', 'evidence_view')):
    one(user, 'select id from cases where org_id=%s and id=%s', (org, case))  # RLS: 404 unless visible
    with transaction(user.user_id) as db:
        if not any(db.execute('select private.has_capability(%s,%s) ok', (org, c)).fetchone()['ok'] for c in capabilities):
            raise DomainError('FORBIDDEN', 'Your current qualification does not allow this action.', 403)


def readiness_for(org: UUID, case: UUID):
    with transaction(worker=True) as db:
        try:
            snapshot, deps, context = build_snapshot(db, org, case)
            reasons = list(readiness_reasons(snapshot))
            measured = {r.station_id for r in snapshot.readings if r.qc == 'accepted'}
            reasons += [f'background range needed at {s}' for s in sorted(measured - {b.station_id for b in snapshot.backgrounds})]
        except NotReady as exc:
            snapshot, deps, context, reasons = None, [], None, exc.reasons
    checks = []
    for label, fragments in READINESS_CHECKS:
        hits = [r for r in reasons if any(f in r for f in fragments)]
        state = 'missing' if hits else 'ready' if snapshot is not None else 'not_evaluated'  # unknown is never shown as ready
        checks.append({'label': label, 'state': state, 'ready': state == 'ready', 'reasons': hits})
    unmatched = [r for r in reasons if not any(r in c['reasons'] for c in checks)]
    if unmatched:
        checks.append({'label': 'Other prerequisites', 'state': 'missing', 'ready': False, 'reasons': unmatched})
    return {'eligible': not reasons, 'reasons': reasons, 'checks': checks}, snapshot, deps, context


@app.get('/api/v1/orgs/{org}/cases/{case}/readiness')
def readiness(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    case_access(user, org, case)
    return envelope(readiness_for(org, case)[0], request)


@app.post('/api/v1/orgs/{org}/cases/{case}/analyses', status_code=202)
def enqueue_analysis(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    case_access(user, org, case, ('coordinate', 'expert'))
    summary, snapshot, deps, context = readiness_for(org, case)
    if snapshot is None:  # nothing to compute yet; the case stays a useful coordination record
        raise DomainError('READINESS_REQUIRED', 'Analysis inputs are incomplete: ' + '; '.join(summary['reasons']))
    payload = json.dumps({'engine': snapshot.model_dump(mode='json'), 'dependencies': deps, 'context': context}, default=str)
    with transaction(worker=True) as db:
        job = db.execute('''insert into analysis_jobs(org_id,case_id,purpose,input_hash,snapshot) values(%s,%s,'assessment',%s,%s)
            on conflict(purpose,input_hash,org_id) do update set purpose=excluded.purpose returning id,state,progress_stage,result_id''',
                         (org, case, canonical_hash(snapshot), payload)).fetchone()
        db.execute("insert into case_events(org_id,case_id,event_type,actor_id,object_id) values(%s,%s,'analysis.requested',%s,%s)",
                   (org, case, user.user_id, job['id']))
    return envelope(job, request, 202)


@app.get('/api/v1/orgs/{org}/analyses/{job}')
def analysis_status(org: UUID, job: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(one(user, '''select id,case_id,state,progress_stage,attempts,last_error,result_id,created_at,
        extract(epoch from now()-created_at)::int elapsed_seconds from analysis_jobs where org_id=%s and id=%s''', (org, job)), request)


@app.get('/api/v1/orgs/{org}/cases/{case}/assessment')
def latest_assessment(org: UUID, case: UUID, request: Request, revision: int | None = None, user: Identity = Depends(identity)):
    a = one(user, '''select a.id,a.revision,a.snapshot_hash,a.retained_length_m,a.engine_version,a.solver_version,a.created_at,a.result,
        (select status from assessment_publications p where p.assessment_id=a.id order by created_at desc limit 1) publication
        from assessments a where a.org_id=%s and a.case_id=%s and (%s::int is null or a.revision=%s)
        order by a.revision desc limit 1''', (org, case, revision, revision))
    result = a.pop('result')
    a |= {k: result[k] for k in ('eligible', 'readiness_reasons', 'outside_domain_unresolved', 'model_conflict',
                                 'computation_incomplete', 'assumptions', 'retained_geometry_ids')}
    a['classes'] = [{k: c[k] for k in ('id', 'signature', 'reach_ids', 'geometry_ids', 'length_m', 'status', 'reason')} for c in result['classes']]
    a['recommendations'] = rows(user, '''select id,action->>'id' action_id,score_bound_m,score_status,rationale,
        constraints->>'retained_length_m' retained_length_m,constraints->>'label' label,constraints->>'relaxation' relaxation
        from recommendations where assessment_id=%s order by (constraints->>'rank')::int''', (a['id'],))
    a['dependencies'] = rows(user, 'select entity_type,entity_id,version,reason from assessment_dependencies where assessment_id=%s', (a['id'],))
    return envelope(a, request, version=a['revision'])


@app.get('/api/v1/orgs/{org}/cases/{case}/network')
def case_network(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    """Current network version geometry for map/schematic. Coordinates are display-only floats."""
    c = one(user, 'select network_id from cases where org_id=%s and id=%s', (org, case))
    if not c['network_id']:
        return envelope(None, request)
    net = one(user, '''select id,version,status,source,license,retrieved_at,completeness,flow_regime,boundary_treatment,mixing_reviewed
        from network_versions where id=%s''', (c['network_id'],))
    net['nodes'] = rows(user, '''select id,code,kind,boundary,extensions.st_x(point) lon,extensions.st_y(point) lat
        from network_nodes where network_id=%s order by code''', (net['id'],))
    net['edges'] = rows(user, '''select e.id,e.code,f.code from_code,t.code to_code,e.length_m,e.flow_status,e.connectivity
        from network_edges e join network_nodes f on f.id=e.from_node join network_nodes t on t.id=e.to_node
        where e.network_id=%s order by e.code''', (net['id'],))
    net['stations'] = rows(user, '''select id,code,status,access_status,access_notes,extensions.st_x(point) lon,extensions.st_y(point) lat
        from stations where case_id=%s and network_id=%s order by code''', (case, net['id']))
    return envelope(net, request, version=net['version'])


# ---- field work: task detail, assignment candidates, access, readings, QC ----

class AccessReport(StrictModel):
    status: str
    notes: str


class Replicate(StrictModel):
    value: str
    temperature: str | None = None
    measured_at: str
    meter_sc25: str | None = None
    notes: str = ''


class ReadingSet(StrictModel):
    client_id: UUID
    task_version: int
    started_at: str
    mode: str
    unit: str
    compensation_mode: str | None = None
    compensation_coefficient: str | None = None
    replicates: list[Replicate]


class QualityCommand(StrictModel):
    disposition: str
    reason: str
    comparable: bool | None = None


@app.get('/api/v1/orgs/{org}/tasks/{task}')
def task_detail(org: UUID, task: UUID, request: Request, user: Identity = Depends(identity)):
    t = one(user, '''select t.*,c.title case_title,s.code station_code,s.access_status,s.access_notes,i.serial instrument_serial,
        p.name protocol_name,p.version protocol_version,p.configuration->'instructions' instructions
        from tasks t join cases c on c.id=t.case_id left join stations s on s.id=t.station_id
        left join instruments i on i.id=t.instrument_id left join protocol_versions p on p.id=t.protocol_id
        where t.org_id=%s and t.id=%s''', (org, task))
    t['readings'] = rows(user, '''select r.id,r.mode,r.value,r.unit,r.temperature,r.measured_at,r.received_at,r.eligible,r.ineligibility_reasons,
        r.submitted_task_version,r.visit_id,(select disposition from quality_decisions q where q.reading_id=r.id order by created_at desc limit 1) quality
        from reading_versions r join visits v on v.id=r.visit_id where v.task_id=%s order by r.measured_at''', (task,))
    return envelope(t, request, version=t['version'])


@app.get('/api/v1/orgs/{org}/tasks/{task}/candidates')
def task_candidates(org: UUID, task: UUID, request: Request, user: Identity = Depends(identity)):
    """Assignment dialog data. Informational only: assign_task re-checks everything server-side (D01)."""
    t = one(user, 'select * from tasks where org_id=%s and id=%s', (org, task))
    case_access(user, org, t['case_id'], ('coordinate',))
    with transaction(worker=True) as db:
        people = db.execute('''select m.user_id,p.display_name,exists(select 1 from qualifications q where q.membership_id=m.id and q.task_type=%s
            and q.valid_from<=%s and q.valid_until>=%s) qualified from memberships m left join profiles p on p.id=m.user_id
            where m.org_id=%s and m.status='active' order by p.display_name''', (t['task_type'], t['window_start'], t['window_end'], org)).fetchall()
        meters = db.execute('''select i.id,i.serial,i.model,i.available,
            exists(select 1 from calibration_events c where c.instrument_id=i.id and c.status='pass' and c.effective_from<=%s and c.effective_until>=%s) verified,
            exists(select 1 from instrument_bookings b where b.instrument_id=i.id and b.active and b.during && tstzrange(%s,%s)) booked
            from instruments i where i.org_id=%s order by i.serial''', (t['window_start'], t['window_end'], t['window_start'], t['window_end'], org)).fetchall()
    return envelope({'people': people, 'instruments': meters, 'travel_estimate': None,
                     'travel_note': 'Travel time not established'}, request)


@app.post('/api/v1/orgs/{org}/stations/{station}/access')
def report_access(org: UUID, station: UUID, body: AccessReport, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.report_access(%s,%s,%s,%s)', (org, station, body.status, body.notes)), request)


@app.post('/api/v1/orgs/{org}/tasks/{task}/readings', status_code=201)
def submit_readings(org: UUID, task: UUID, body: ReadingSet, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.submit_readings(%s,%s,%s,%s::jsonb)',
                        (org, task, body.task_version, body.model_dump_json(exclude={'task_version'}))), request, 201)


@app.get('/api/v1/orgs/{org}/cases/{case}/readings')
def case_readings(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select r.id,r.entity_id,r.version,r.mode,r.value,r.unit,r.temperature,r.measured_at,r.received_at,r.eligible,
        r.ineligibility_reasons,r.data_origin,r.visit_id,s.code station_code,i.serial instrument_serial,
        q.disposition quality,q.reason quality_reason,q.comparable
        from reading_versions r join stations s on s.id=r.station_id join instruments i on i.id=r.instrument_id
        left join lateral (select disposition,reason,comparable from quality_decisions d where d.reading_id=r.id order by created_at desc limit 1) q on true
        where r.org_id=%s and r.case_id=%s order by r.measured_at''', (org, case)), request)


@app.post('/api/v1/orgs/{org}/readings/{reading}/quality')
def record_quality(org: UUID, reading: UUID, body: QualityCommand, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.record_quality(%s,%s,%s,%s,%s)',
                        (org, reading, body.disposition, body.reason, body.comparable)), request)


@app.get('/api/v1/orgs/{org}/protocols')
def protocols(org: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select id,entity_id,version,name,status,data_origin,source,configuration->'instructions' instructions,
        configuration->'replicates' replicates from protocol_versions where org_id=%s order by name,version desc''', (org,)), request)


# ---- instrument registry ----

class CalibrationEvent(StrictModel):
    status: str
    effective_from: str
    effective_until: str | None = None
    checked_at: str
    reason: str
    certificate: str | None = None
    bounds: dict | None = None  # {gain, offset, temperature_bias: engine Interval, accounting}; required for raw readings to be modelled


@app.get('/api/v1/orgs/{org}/instruments')
def instruments(org: UUID, request: Request, user: Identity = Depends(identity)):
    items = rows(user, 'select id,serial,model,capabilities,available,specifications from instruments where org_id=%s order by serial', (org,))
    with transaction(user.user_id) as db:  # calibration history is evidence: visible to coordinators/experts under RLS
        for i in items:
            i['calibrations'] = db.execute('''select id,status,effective_from,effective_until,checked_at,reason,certificate,created_at
                from calibration_events where instrument_id=%s order by checked_at desc''', (i['id'],)).fetchall()
    return envelope(items, request)


@app.post('/api/v1/orgs/{org}/instruments/{instrument}/calibrations', status_code=201)
def add_calibration(org: UUID, instrument: UUID, body: CalibrationEvent, request: Request, user: Identity = Depends(identity)):
    """Append-only calibration/verification event. It is never backdated silently: created_at records entry time."""
    if body.status not in ('pass', 'fail', 'indeterminate') or len(body.reason) < 10:
        raise DomainError('VALIDATION_FAILED', 'Choose pass, fail or indeterminate and give a reason of at least 10 characters.')
    if body.bounds is not None:
        from datetime import datetime
        from upstream_engine import Instrument
        try:  # same strict validation the engine applies, so stored bounds are always modellable
            Instrument(id='check', calibration_version='check', valid_from=datetime.fromisoformat(body.effective_from),
                       valid_until=datetime.fromisoformat(body.effective_until or '9999-12-31T00:00:00+00:00'), **body.bounds)
        except Exception as exc:  # noqa: BLE001
            raise DomainError('VALIDATION_FAILED', f'Calibration bounds are invalid: {str(exc).splitlines()[-1][:200]}')
    with transaction(user.user_id) as db:
        if not db.execute("select private.has_capability(%s,'expert') ok", (org,)).fetchone()['ok']:
            raise DomainError('FORBIDDEN', 'Recording calibration evidence requires expert capability.', 403)
    with transaction(worker=True) as db:
        if not db.execute('select 1 from instruments where org_id=%s and id=%s', (org, instrument)).fetchone():
            raise DomainError('NOT_FOUND', 'Record not found.', 404)
        row = db.execute('''insert into calibration_events(org_id,instrument_id,status,effective_from,effective_until,checked_at,reason,certificate,reviewer_id,bounds)
            values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id,status,effective_from,effective_until,checked_at,created_at''',
                         (org, instrument, body.status, body.effective_from, body.effective_until, body.checked_at, body.reason,
                          body.certificate, user.user_id, json.dumps(body.bounds) if body.bounds else None)).fetchone()
        db.execute("insert into audit_log(org_id,actor_id,action,object_id,outcome) values(%s,%s,'calibration.recorded',%s,%s)",
                   (org, user.user_id, row['id'], body.status))
    return envelope(row, request, 201)


# ---- local mapping: drafts, import, edit, validate, diff, publish ----

from services.worker.snapshot import load_network, network_model  # noqa: E402
from upstream_engine import classify_network  # noqa: E402

SNAP_TOLERANCE_M = 5  # a station farther than this from a mapped reach is rejected, never snapped (C12)


class DraftCreate(StrictModel):
    source: str = ''
    license: str = ''
    retrieved_at: str | None = None
    geojson: dict | None = None  # omit to start a draft from the current published version


class EdgePatch(StrictModel):
    flow_status: str | None = None     # verified | unknown | reverse
    connectivity: str | None = None    # verified | mapped_unverified | unknown_connection
    culvert: bool | None = None


class StationPlace(StrictModel):
    code: str
    lon: float
    lat: float


class Publish(StrictModel):
    reason: str
    evidence: list[str]
    boundary: str
    mixing_reviewed: bool = False
    domain_note: str = ''


def mapping_access(user: Identity, org: UUID, case: UUID):
    case_access(user, org, case, ('coordinate', 'network_verify'))


def draft_of(db, org: UUID, nid: UUID):
    net = db.execute('select * from network_versions where org_id=%s and id=%s', (org, nid)).fetchone()
    if not net:
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    if net['status'] != 'proposed':
        raise DomainError('VERSION_CONFLICT', 'Published network versions are immutable; start a new draft.', 409)
    return net


def refresh_kinds(db, nid):
    db.execute('''update network_nodes n set kind=case
        when exists(select 1 from stations s where s.network_id=n.network_id and s.code=n.code) then 'station'
        when not exists(select 1 from network_edges e where e.to_node=n.id) then 'source'
        when not exists(select 1 from network_edges e where e.from_node=n.id) then 'outlet' else 'junction' end
        where network_id=%s''', (nid,))


def import_geojson(db, org, nid, fc):
    if fc.get('type') != 'FeatureCollection' or not isinstance(fc.get('features'), list):
        raise DomainError('VALIDATION_FAILED', 'Provide a GeoJSON FeatureCollection.')
    features = fc['features']
    if len(features) > 10000:
        raise DomainError('VALIDATION_FAILED', 'Imports are limited to 10,000 features; split the file.')
    lines = [f for f in features if (f.get('geometry') or {}).get('type') == 'LineString']
    points = [f for f in features if (f.get('geometry') or {}).get('type') == 'Point' and (f.get('properties') or {}).get('station')]
    if not lines:
        raise DomainError('VALIDATION_FAILED', 'No LineString reaches found in the file.')
    nodes, warnings = {}, []

    def node(coord):
        lon, lat = float(coord[0]), float(coord[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise DomainError('VALIDATION_FAILED', f'Coordinate {coord} is outside WGS84 longitude/latitude ranges.')
        key = (round(lon, 7), round(lat, 7))  # only exactly shared endpoints join; nearby ends are not merged
        if key not in nodes:
            nodes[key] = db.execute('''insert into network_nodes(org_id,network_id,code,kind,point) values(%s,%s,%s,'junction',
                extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)) returning id''', (org, nid, f'N{len(nodes) + 1}', *key)).fetchone()['id']
        return nodes[key]

    codes = set()
    for i, f in enumerate(lines, 1):
        coords = f['geometry'].get('coordinates') or []
        if len(coords) < 2:
            raise DomainError('VALIDATION_FAILED', f'Reach {i} needs at least two coordinates.')
        code = str((f.get('properties') or {}).get('id') or f'R{i}')[:60]
        if code in codes:
            raise DomainError('VALIDATION_FAILED', f'Duplicate reach id {code}.')
        codes.add(code)
        a, b = node(coords[0]), node(coords[-1])
        if a == b:
            raise DomainError('VALIDATION_FAILED', f'Reach {code} starts and ends at the same point.')
        db.execute('''insert into network_edges(org_id,network_id,code,from_node,to_node,line,length_m,flow_status,connectivity)
            select %s,%s,%s,%s,%s,g,round(extensions.st_length(g::extensions.geography)::numeric,2),'unknown','mapped_unverified'
            from (select extensions.st_setsrid(extensions.st_geomfromgeojson(%s),4326) g) x''',
                   (org, nid, code, a, b, json.dumps(f['geometry'])))
    crossings = db.execute('''select a.code a,b.code b from network_edges a join network_edges b on a.network_id=b.network_id and a.code<b.code
        where a.network_id=%s and extensions.st_crosses(a.line,b.line)''', (nid,)).fetchall()
    warnings += [f"Reaches {c['a']} and {c['b']} cross without a shared junction; not treated as a confluence (review in the field)." for c in crossings]
    refresh_kinds(db, nid)
    for p in points:
        lon, lat = p['geometry']['coordinates'][:2]
        place_station(db, org, nid, str(p['properties']['station'])[:30], float(lon), float(lat))
    return warnings


def place_station(db, org, nid, code, lon, lat):
    """Station on an existing node, or split the nearest reach at the point. Never snaps beyond tolerance."""
    case = db.execute('select case_id from network_versions where id=%s', (nid,)).fetchone()['case_id']
    if db.execute('select 1 from stations where network_id=%s and code=%s', (nid, code)).fetchone():
        raise DomainError('VALIDATION_FAILED', f'Station {code} already exists in this draft.')
    pt = (lon, lat)
    near_node = db.execute('''select id,code,extensions.st_distance(point::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)::extensions.geography) d from network_nodes where network_id=%s order by d limit 1''',
                           (*pt, nid)).fetchone()
    edge = db.execute('''select id,code,from_node,to_node,length_m,flow_status,connectivity,culvert,
        extensions.st_linelocatepoint(line,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)) f,
        extensions.st_distance(line::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)::extensions.geography) d
        from network_edges where network_id=%s order by d limit 1''', (*pt, *pt, nid)).fetchone()
    if near_node and near_node['d'] <= 1:
        if db.execute('select 1 from network_nodes where network_id=%s and code=%s', (nid, code)).fetchone() and near_node['code'] != code:
            raise DomainError('VALIDATION_FAILED', f'Node code {code} is already used.')
        db.execute('update network_nodes set code=%s where id=%s', (code, near_node['id']))
    elif edge and edge['d'] <= SNAP_TOLERANCE_M:
        first = (Decimal(str(edge['length_m'])) * Decimal(str(edge['f']))).quantize(Decimal('0.01'))
        second = Decimal(str(edge['length_m'])) - first  # total channel length preserved exactly (C06)
        if first <= 0 or second <= 0:
            raise DomainError('VALIDATION_FAILED', 'Station falls on a reach end; place it on the existing node.')
        mid = db.execute('''insert into network_nodes(org_id,network_id,code,kind,point) values(%s,%s,%s,'station',
            extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)) returning id''', (org, nid, code, *pt)).fetchone()['id']
        for suffix, a, b, lo, hi, length in ((':up', edge['from_node'], mid, 0, edge['f'], first), (':down', mid, edge['to_node'], edge['f'], 1, second)):
            db.execute('''insert into network_edges(org_id,network_id,code,from_node,to_node,line,length_m,flow_status,connectivity,culvert)
                select %s,%s,%s,%s,%s,extensions.st_linesubstring(line,%s,%s),%s,flow_status,connectivity,culvert from network_edges where id=%s''',
                       (org, nid, edge['code'] + suffix, a, b, lo, hi, length, edge['id']))
        db.execute('delete from network_edges where id=%s', (edge['id'],))
    else:
        distance = round(min(x['d'] for x in (near_node, edge) if x)) if (near_node or edge) else None
        raise DomainError('VALIDATION_FAILED', f'Station {code} is {distance} m from the nearest mapped reach. '
                                               'It is not moved automatically; add or correct the reach first.')
    db.execute('''insert into stations(org_id,case_id,network_id,code,point,status,access_status)
        values(%s,%s,%s,%s,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326),'proposed','unknown')''', (org, case, nid, code, *pt))
    refresh_kinds(db, nid)


def network_summary(db, nid, origin='real'):
    net, nodes, edges, stations = load_network(db, nid)
    try:
        reasons = list(classify_network(network_model(net, nodes, edges, stations, origin)).reasons)
    except Exception as exc:  # noqa: BLE001 - NotReady carries a user-facing reason
        reasons = getattr(exc, 'reasons', [str(exc)])
    return reasons


@app.post('/api/v1/orgs/{org}/cases/{case}/network/drafts', status_code=201)
def create_draft(org: UUID, case: UUID, body: DraftCreate, request: Request, user: Identity = Depends(identity)):
    mapping_access(user, org, case)
    with transaction(worker=True) as db:
        c = db.execute('select network_id,data_origin from cases where id=%s', (case,)).fetchone()
        if db.execute("select 1 from network_versions where case_id=%s and status='proposed'", (case,)).fetchone():
            raise DomainError('VERSION_CONFLICT', 'This case already has an open draft; continue or publish it first.', 409)
        version = db.execute('select coalesce(max(version),0)+1 v from network_versions where case_id=%s', (case,)).fetchone()['v']
        base = db.execute('select * from network_versions where id=%s', (c['network_id'],)).fetchone() if c['network_id'] else None
        if body.geojson is None and not base:
            raise DomainError('VALIDATION_FAILED', 'No published network to copy; import GeoJSON linework to start the local map.')
        if body.geojson is not None and (len(body.source) < 3 or len(body.license) < 2):
            raise DomainError('VALIDATION_FAILED', 'Imported linework needs its source and licence.')
        nid = db.execute('''insert into network_versions(org_id,case_id,version,source,license,retrieved_at,status,content_hash,created_by,supersedes_id)
            values(%s,%s,%s,%s,%s,%s,'proposed','draft',%s,%s) returning id''',
                         (org, case, version, body.source if body.geojson is not None else base['source'],
                          body.license if body.geojson is not None else base['license'], body.retrieved_at, user.user_id,
                          c['network_id'])).fetchone()['id']
        if body.geojson is not None:
            warnings = import_geojson(db, org, nid, body.geojson)
        else:  # copy the published version into an editable draft; connectivity/review states are carried, not re-verified
            warnings = []
            db.execute('''insert into network_nodes(org_id,network_id,code,kind,point,boundary)
                select org_id,%s,code,kind,point,boundary from network_nodes where network_id=%s''', (nid, base['id']))
            db.execute('''insert into network_edges(org_id,network_id,code,from_node,to_node,line,length_m,flow_status,connectivity,evidence_refs,culvert)
                select e.org_id,%s,e.code,f2.id,t2.id,e.line,e.length_m,e.flow_status,e.connectivity,e.evidence_refs,e.culvert from network_edges e
                join network_nodes f on f.id=e.from_node join network_nodes t on t.id=e.to_node
                join network_nodes f2 on f2.network_id=%s and f2.code=f.code join network_nodes t2 on t2.network_id=%s and t2.code=t.code
                where e.network_id=%s''', (nid, nid, nid, base['id']))
            db.execute('''insert into stations(org_id,case_id,network_id,code,point,status,access_status,access_notes)
                select org_id,case_id,%s,code,point,status,access_status,access_notes from stations where network_id=%s''', (nid, base['id']))
        db.execute('update network_versions set import_warnings=%s where id=%s', (json.dumps(warnings), nid))
        db.execute("insert into case_events(org_id,case_id,event_type,actor_id,object_id,object_version) values(%s,%s,'network.draft_created',%s,%s,%s)",
                   (org, case, user.user_id, nid, version))
    return envelope({'id': nid, 'version': version, 'warnings': warnings}, request, 201)


@app.get('/api/v1/orgs/{org}/networks/{nid}')
def network_version(org: UUID, nid: UUID, request: Request, user: Identity = Depends(identity)):
    net = one(user, '''select id,case_id,version,status,source,license,retrieved_at,flow_regime,boundary_treatment,mixing_reviewed,
        review_reason,evidence_refs,published_at,supersedes_id,domain_note,import_warnings from network_versions where org_id=%s and id=%s''', (org, nid))
    net['nodes'] = rows(user, 'select id,code,kind,extensions.st_x(point) lon,extensions.st_y(point) lat from network_nodes where network_id=%s order by code', (nid,))
    net['edges'] = rows(user, '''select e.id,e.code,f.code from_code,t.code to_code,e.length_m,e.flow_status,e.connectivity,e.culvert,
        extensions.st_asgeojson(e.line)::jsonb geometry from network_edges e join network_nodes f on f.id=e.from_node
        join network_nodes t on t.id=e.to_node where e.network_id=%s order by e.code''', (nid,))
    net['stations'] = rows(user, '''select id,code,status,access_status,extensions.st_x(point) lon,extensions.st_y(point) lat
        from stations where network_id=%s order by code''', (nid,))
    with transaction(worker=True) as db:
        origin = db.execute('select data_origin from cases where id=%s', (net['case_id'],)).fetchone()['data_origin']
        net['validation'] = network_summary(db, nid, origin)
        current = db.execute('select network_id from cases where id=%s', (net['case_id'],)).fetchone()['network_id']
        net['diff'] = diff(db, current, nid) if current and current != nid else None
    return envelope(net, request, version=net['version'])


def diff(db, old, new):
    q = '''select e.code,f.code a,t.code b,e.length_m,e.flow_status,e.connectivity from network_edges e
        join network_nodes f on f.id=e.from_node join network_nodes t on t.id=e.to_node where e.network_id=%s'''
    before = {r['code']: r for r in db.execute(q, (old,))}
    after = {r['code']: r for r in db.execute(q, (new,))}
    total = lambda rows: sum(Decimal(str(r['length_m'])) for r in rows.values())  # noqa: E731
    return {'added': sorted(after.keys() - before.keys()), 'removed': sorted(before.keys() - after.keys()),
            'direction_changed': sorted(k for k in after.keys() & before.keys() if (after[k]['a'], after[k]['b']) != (before[k]['a'], before[k]['b'])),
            'status_changed': sorted(k for k in after.keys() & before.keys() if (after[k]['flow_status'], after[k]['connectivity']) != (before[k]['flow_status'], before[k]['connectivity'])),
            'length_before_m': str(total(before)), 'length_after_m': str(total(after))}


@app.patch('/api/v1/orgs/{org}/networks/{nid}/edges/{edge}')
def patch_edge(org: UUID, nid: UUID, edge: UUID, body: EdgePatch, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:
        net = draft_of(db, org, nid)
    mapping_access(user, org, net['case_id'])
    if body.flow_status not in (None, 'verified', 'unknown', 'reverse') or body.connectivity not in (None, 'verified', 'mapped_unverified', 'unknown_connection'):
        raise DomainError('VALIDATION_FAILED', 'Unknown flow or connectivity status.')
    with transaction(worker=True) as db:
        if body.flow_status == 'reverse':
            db.execute("update network_edges set from_node=to_node,to_node=from_node,line=extensions.st_reverse(line),flow_status='unknown' where id=%s and network_id=%s", (edge, nid))
        elif body.flow_status:
            db.execute('update network_edges set flow_status=%s where id=%s and network_id=%s', (body.flow_status, edge, nid))
        if body.connectivity:
            db.execute('update network_edges set connectivity=%s where id=%s and network_id=%s', (body.connectivity, edge, nid))
        if body.culvert is not None:  # a culvert or unknown connection is never read as "disconnected" (C03)
            db.execute("update network_edges set culvert=%s, connectivity=case when %s then 'unknown_connection' else connectivity end where id=%s and network_id=%s",
                       (body.culvert, body.culvert, edge, nid))
        refresh_kinds(db, nid)
        db.execute("insert into case_events(org_id,case_id,event_type,actor_id,object_id) values(%s,%s,'network.edge_edited',%s,%s)", (org, net['case_id'], user.user_id, edge))
    return envelope({'id': edge}, request)


@app.post('/api/v1/orgs/{org}/networks/{nid}/stations', status_code=201)
def add_station(org: UUID, nid: UUID, body: StationPlace, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:
        net = draft_of(db, org, nid)
    mapping_access(user, org, net['case_id'])
    if not body.code.strip() or len(body.code) > 30:
        raise DomainError('VALIDATION_FAILED', 'Station code is required (30 characters max).')
    with transaction(worker=True) as db:
        place_station(db, org, nid, body.code.strip(), body.lon, body.lat)
    return envelope({'code': body.code}, request, 201)


@app.post('/api/v1/orgs/{org}/networks/{nid}/stations/{station}/approve')
def approve_station(org: UUID, nid: UUID, station: UUID, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:
        net = draft_of(db, org, nid)
    mapping_access(user, org, net['case_id'])
    with transaction(worker=True) as db:
        db.execute("update stations set status='approved',version=version+1 where id=%s and network_id=%s", (station, nid))
    return envelope({'id': station, 'status': 'approved'}, request)


@app.post('/api/v1/orgs/{org}/networks/{nid}/publish')
def publish_network(org: UUID, nid: UUID, body: Publish, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:  # content hash over the exact geometry being published
        payload = db.execute('''select coalesce(json_agg(json_build_object('c',code,'f',from_node,'t',to_node,'l',length_m,'s',flow_status,
            'k',connectivity) order by code),'[]')::text x from network_edges where network_id=%s''', (nid,)).fetchone()['x']
        draft_of(db, org, nid)
        db.execute('update network_versions set content_hash=%s where id=%s', (hashlib.sha256(payload.encode()).hexdigest(), nid))
    return envelope(rpc(user, 'select public.publish_network(%s,%s,%s,%s,%s,%s,%s)',
                        (org, nid, body.reason, body.evidence, body.boundary, body.mixing_reviewed, body.domain_note)), request)


@app.get('/api/v1/orgs/{org}/cases/{case}/network/versions')
def network_versions(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select id,version,status,source,license,published_at,review_reason,supersedes_id,
        (select network_id from cases where id=%s)=id current from network_versions where org_id=%s and case_id=%s order by version desc''',
                         (case, org, case)), request)


class WaterwayPatch(StrictModel):
    local_name: str | None = None
    external_ids: dict[str, str] | None = None


@app.patch('/api/v1/orgs/{org}/waterways/{waterway}')
def patch_waterway(org: UUID, waterway: UUID, body: WaterwayPatch, request: Request, user: Identity = Depends(identity)):
    """Reconcile a provisional local waterway with an external identifier; report and case IDs never change (C08)."""
    with transaction(user.user_id) as db:
        if not db.execute("select private.has_capability(%s,'coordinate') ok", (org,)).fetchone()['ok']:
            raise DomainError('FORBIDDEN', 'Coordinator capability required.', 403)
    with transaction(worker=True) as db:
        row = db.execute('''update waterways set local_name=coalesce(%s,local_name),external_ids=external_ids||%s::jsonb,
            provisional=provisional and %s::jsonb='{}'::jsonb,version=version+1 where org_id=%s and id=%s
            returning id,local_name,external_ids,provisional,version''', (body.local_name, json.dumps(body.external_ids or {}),
                                                                    json.dumps(body.external_ids or {}), org, waterway)).fetchone()
        if not row:
            raise DomainError('NOT_FOUND', 'Record not found.', 404)
    return envelope(row, request, version=row['version'])


# ---- expert review, approval, decisions ----

class Rationale(StrictModel):
    reason: str


class ReviewAction(StrictModel):
    action: str
    reason: str


class FailureReport(StrictModel):
    effective_from: str
    effective_until: str | None = None
    reason: str


def require_expert(user: Identity, org: UUID):
    with transaction(user.user_id) as db:
        if not db.execute("select private.has_capability(%s,'expert') ok", (org,)).fetchone()['ok']:
            raise DomainError('FORBIDDEN', 'Expert review capability is required; organization administration alone is not enough.', 403)


@app.post('/api/v1/orgs/{org}/assessments/{aid}/approve')
def approve(org: UUID, aid: UUID, body: Rationale, request: Request, user: Identity = Depends(identity)):
    require_expert(user, org)
    a = one(user, 'select case_id from assessments where org_id=%s and id=%s', (org, aid))
    with transaction(user.user_id) as db:
        # Hold the per-case lock that evidence/network mutations take, recompute the dependency snapshot, then approve atomically (F02).
        db.execute('select pg_advisory_xact_lock(hashtext(%s))', (str(a['case_id']),))
        with transaction(worker=True) as wdb:
            try:
                current = canonical_hash(build_snapshot(wdb, org, a['case_id'])[0])
            except NotReady as exc:
                current = 'not-ready: ' + '; '.join(exc.reasons)
        result = db.execute('select public.approve_assessment(%s,%s,%s,%s) r', (org, aid, current, body.reason)).fetchone()['r']
    return envelope(result, request)


@app.post('/api/v1/orgs/{org}/assessments/{aid}/review')
def review(org: UUID, aid: UUID, body: ReviewAction, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.review_assessment(%s,%s,%s,%s)', (org, aid, body.action, body.reason)), request)


@app.post('/api/v1/orgs/{org}/instruments/{instrument}/failure')
def instrument_failure(org: UUID, instrument: UUID, body: FailureReport, request: Request, user: Identity = Depends(identity)):
    """Record a failed verification and hold affected readings as suspect for review (never deletes them)."""
    add_calibration(org, instrument, CalibrationEvent(status='fail', effective_from=body.effective_from, effective_until=body.effective_until,
                                                      checked_at=body.effective_until or body.effective_from, reason=body.reason), request, user)
    return envelope(rpc(user, 'select public.flag_instrument_failure(%s,%s,%s,%s,%s)',
                        (org, instrument, body.effective_from, body.effective_until, body.reason)), request)


@app.post('/api/v1/orgs/{org}/cases/{case}/decisions', status_code=201)
def decide(org: UUID, case: UUID, body: CaseDecision, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.record_decision(%s,%s,%s,%s,%s,%s,%s,%s)',
                        (org, case, body.expected_version, body.action, body.reason, body.assessment_id, body.segments, body.context_sources)), request, 201)


@app.get('/api/v1/orgs/{org}/cases/{case}/assessments')
def assessment_history(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select a.id,a.revision,a.retained_length_m,a.created_at,a.snapshot_hash,(a.result->>'eligible')::boolean eligible,
        (a.id=(select current_assessment_id from cases where id=%s)) current,
        coalesce((select json_agg(json_build_object('status',p.status,'reason',p.reason,'at',p.created_at) order by p.created_at)
          from assessment_publications p where p.assessment_id=a.id),'[]') publications
        from assessments a where a.org_id=%s and a.case_id=%s order by a.revision desc''', (case, org, case)), request)


@app.get('/api/v1/orgs/{org}/review-queue')
def review_queue(org: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select c.id case_id,c.title,c.review_hold,a.id assessment_id,a.revision,a.retained_length_m,a.created_at,
        private.publication_status(a.id) status from cases c join lateral (select * from assessments x where x.case_id=c.id order by revision desc limit 1) a on true
        where c.org_id=%s and (c.review_hold or private.publication_status(a.id) in ('draft','under_review')) order by a.created_at desc''', (org,)), request)


# ---- evidence packages, recipients, delivery, recipient portal ----

import secrets  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

from services.packages import verify_package  # noqa: E402
from services.worker.exports import MIME, signing_key  # noqa: E402

SHARE_DAYS = 30


class RecipientCreate(StrictModel):
    name: str
    method: str = 'portal'


class DeliveryCreate(StrictModel):
    recipient_id: UUID


class Acknowledge(StrictModel):
    name: str
    notice_id: UUID | None = None


def capability(user: Identity, org: UUID, *caps):
    with transaction(user.user_id) as db:
        if not any(db.execute('select private.has_capability(%s,%s) ok', (org, c)).fetchone()['ok'] for c in caps):
            raise DomainError('FORBIDDEN', 'Your current qualification does not allow this action.', 403)


def package_artifacts(pkg):
    return {name: storage('GET', key) for name, key in pkg['artifact_keys'].items()}


def public_key():
    key, kid = signing_key()
    return (key.public_key(), kid) if key else (None, None)


@app.get('/api/v1/signing-key')
def signing_public_key(request: Request):
    """Published verification key (public). Trust it independently of any package you verify."""
    from cryptography.hazmat.primitives import serialization
    from services.packages.core import fingerprint
    key, kid = public_key()
    if not key:
        return envelope({'configured': False, 'note': 'Packages from this deployment are explicitly unsigned.'}, request)
    return envelope({'configured': True, 'key_id': kid, 'public_key_sha256': fingerprint(key),
                     'pem': key.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()}, request)


@app.post('/api/v1/orgs/{org}/assessments/{aid}/exports', status_code=202)
def create_export(org: UUID, aid: UUID, request: Request, user: Identity = Depends(identity)):
    """Exporting never sends anything (F16). One immutable package per approved assessment (F17)."""
    capability(user, org, 'expert', 'coordinate')
    a = one(user, 'select case_id,private.publication_status(id) status from assessments where org_id=%s and id=%s', (org, aid))
    if a['status'] != 'approved':
        raise DomainError('READINESS_REQUIRED', 'Only the currently approved assessment can be packaged.')
    with transaction(worker=True) as db:
        job = db.execute('''insert into analysis_jobs(org_id,case_id,purpose,input_hash,snapshot) values(%s,%s,'export',%s,'{}')
            on conflict(purpose,input_hash,org_id) do update set purpose=excluded.purpose returning id,state,progress_stage,result_id''',
                         (org, a['case_id'], str(aid))).fetchone()
    return envelope(job, request, 202)


@app.get('/api/v1/orgs/{org}/cases/{case}/packages')
def case_packages(org: UUID, case: UUID, request: Request, user: Identity = Depends(identity)):
    capability(user, org, 'expert', 'coordinate', 'evidence_view')
    with transaction(worker=True) as db:
        packages = db.execute('''select p.id,p.assessment_id,a.revision,p.manifest_hash,p.signing_status,p.predecessor_id,p.created_at,
            private.publication_status(p.assessment_id) assessment_status,(select array_agg(k order by k) from jsonb_object_keys(p.artifact_keys) k) artifacts
            from evidence_packages p join assessments a on a.id=p.assessment_id where p.org_id=%s and p.case_id=%s order by p.created_at desc''', (org, case)).fetchall()
        for p in packages:
            p['deliveries'] = db.execute('''select d.id,d.state,d.delivered_at,d.attempts,d.acknowledged_at,d.acknowledged_by,r.name recipient
                from deliveries d join recipients r on r.id=d.recipient_id where d.package_id=%s order by r.name''', (p['id'],)).fetchall()
            p['notices'] = db.execute('''select n.id,n.prior_package_id,n.delivery_state,n.acknowledged_at,n.acknowledgment_actor,r.name recipient
                from revision_notices n join recipients r on r.id=n.recipient_id where n.new_package_id=%s''', (p['id'],)).fetchall()
    return envelope(packages, request)


@app.get('/api/v1/orgs/{org}/packages/{pkg}/artifacts/{name}')
def package_artifact(org: UUID, pkg: UUID, name: str, user: Identity = Depends(identity)):
    capability(user, org, 'expert', 'coordinate', 'evidence_view')
    with transaction(worker=True) as db:
        p = db.execute('select artifact_keys from evidence_packages where org_id=%s and id=%s', (org, pkg)).fetchone()
    if not p or name not in p['artifact_keys']:
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    return Response(storage('GET', p['artifact_keys'][name]), media_type=MIME[name.rsplit('.', 1)[1]],
                    headers={'Content-Disposition': f'attachment; filename="{name}"', 'Cache-Control': 'private, no-store'})


@app.get('/api/v1/orgs/{org}/packages/{pkg}/verify')
def verify_stored_package(org: UUID, pkg: UUID, request: Request, user: Identity = Depends(identity)):
    capability(user, org, 'expert', 'coordinate', 'evidence_view')
    with transaction(worker=True) as db:
        p = db.execute('''select p.*,(select manifest_hash from evidence_packages x where x.id=p.predecessor_id) predecessor_hash
            from evidence_packages p where p.org_id=%s and p.id=%s''', (org, pkg)).fetchone()
    if not p:
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    key, _ = public_key()
    try:
        result = verify_package(package_artifacts(p), public_key=key if p['signing_status'] == 'signed' else None,
                                expected_manifest_hash=p['manifest_hash'], expected_predecessor_hash=p['predecessor_hash'],
                                require_signature=p['signing_status'] == 'signed')
    except ValueError as exc:
        return envelope({'valid': False, 'reason': str(exc)}, request)
    return envelope({'valid': True} | result, request)


@app.get('/api/v1/orgs/{org}/recipients')
def recipients(org: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, 'select id,name,method,verified,scopes from recipients where org_id=%s order by name', (org,)), request)


@app.post('/api/v1/orgs/{org}/recipients', status_code=201)
def add_recipient(org: UUID, body: RecipientCreate, request: Request, user: Identity = Depends(identity)):
    capability(user, org, 'admin')
    if body.method != 'portal' or len(body.name.strip()) < 2:  # ponytail: webhook delivery needs SSRF-checked HTTPS config; portal only for now
        raise DomainError('VALIDATION_FAILED', 'Provide a recipient name. Only scoped portal delivery is available in this deployment.')
    with transaction(worker=True) as db:
        row = db.execute("insert into recipients(org_id,name,method,verified) values(%s,%s,'portal',true) returning id,name,method,verified",
                         (org, body.name.strip())).fetchone()
    return envelope(row, request, 201)


@app.post('/api/v1/orgs/{org}/packages/{pkg}/deliveries', status_code=201)
def deliver(org: UUID, pkg: UUID, body: DeliveryCreate, request: Request, user: Identity = Depends(identity)):
    """Explicit send (F16). Retrying keeps the same logical delivery and bytes (F08); prior recipients get a revision notice (F06)."""
    capability(user, org, 'expert')
    token = secrets.token_urlsafe(32)
    with transaction(worker=True) as db:
        p = db.execute('select * from evidence_packages where org_id=%s and id=%s', (org, pkg)).fetchone()
        r = db.execute('select * from recipients where org_id=%s and id=%s', (org, body.recipient_id)).fetchone()
        if not p or not r:
            raise DomainError('NOT_FOUND', 'Record not found.', 404)
        d = db.execute('''insert into deliveries(org_id,package_id,recipient_id,state,delivered_at,attempts,created_by) values(%s,%s,%s,'delivered',now(),1,%s)
            on conflict(package_id,recipient_id) do update set attempts=deliveries.attempts+1 returning *''', (org, pkg, r['id'], user.user_id)).fetchone()
        db.execute('update share_grants set revoked_at=now() where package_id=%s and recipient_id=%s and revoked_at is null', (pkg, r['id']))
        prior = db.execute('''select p.id from evidence_packages p join deliveries x on x.package_id=p.id
            where p.case_id=%s and x.recipient_id=%s and p.id<>%s order by p.created_at desc limit 1''', (p['case_id'], r['id'], pkg)).fetchone()
        notice = None
        if prior:
            notice = db.execute('''insert into revision_notices(org_id,prior_package_id,new_package_id,recipient_id,delivery_state) values(%s,%s,%s,%s,'delivered')
                on conflict(prior_package_id,new_package_id,recipient_id) do update set delivery_state='delivered' returning id''', (org, prior['id'], pkg, r['id'])).fetchone()['id']
        db.execute('''insert into share_grants(org_id,package_id,notice_id,recipient_id,token_hash,scope,expires_at) values(%s,%s,%s,%s,%s,'package',%s)''',
                   (org, pkg, notice, r['id'], hashlib.sha256(token.encode()).hexdigest(), datetime.now(timezone.utc) + timedelta(days=SHARE_DAYS)))
        db.execute("insert into case_events(org_id,case_id,event_type,actor_id,object_id,payload) values(%s,%s,'package.delivered',%s,%s,%s)",
                   (org, p['case_id'], user.user_id, pkg, json.dumps({'recipient': str(r['id']), 'attempt': d['attempts'], 'revision_notice': str(notice) if notice else None})))
    # The raw token is shown once to the sender; only its hash is stored.
    return envelope({'delivery_id': d['id'], 'attempts': d['attempts'], 'state': d['state'], 'revision_notice_id': notice,
                     'share_path': f'/share/{token}', 'expires_in_days': SHARE_DAYS}, request, 201)


@app.post('/api/v1/orgs/{org}/packages/{pkg}/grants/revoke')
def revoke_grants(org: UUID, pkg: UUID, request: Request, user: Identity = Depends(identity)):
    capability(user, org, 'expert', 'admin')
    with transaction(worker=True) as db:
        n = db.execute('update share_grants set revoked_at=now() where org_id=%s and package_id=%s and revoked_at is null', (org, pkg)).rowcount
    return envelope({'revoked': n}, request)


def grant_for(token: str):
    """Scoped recipient access: token hash lookup only; expired/revoked/unknown are indistinguishable (F09)."""
    with transaction(worker=True) as db:
        g = db.execute('''select g.*,p.case_id,p.manifest,p.manifest_hash,p.signing_status,p.artifact_keys,p.assessment_id,p.predecessor_id
            from share_grants g join evidence_packages p on p.id=g.package_id where g.token_hash=%s''', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not g or g['revoked_at'] or g['expires_at'] < datetime.now(timezone.utc):
        raise DomainError('NOT_FOUND', 'This link has expired or is no longer available.', 404)
    return g


@app.get('/api/v1/share/{token}')
def share_view(token: str, request: Request):
    g = grant_for(token)
    with transaction(worker=True) as db:
        status = db.execute('select private.publication_status(%s) s', (g['assessment_id'],)).fetchone()['s']
        newer = db.execute('''select p.id,p.created_at from evidence_packages p join deliveries d on d.package_id=p.id
            where p.case_id=%s and d.recipient_id=%s and p.created_at>(select created_at from evidence_packages where id=%s) order by p.created_at desc limit 1''',
                           (g['case_id'], g['recipient_id'], g['package_id'])).fetchone()
        delivery = db.execute('select state,delivered_at,acknowledged_at,acknowledged_by from deliveries where package_id=%s and recipient_id=%s',
                              (g['package_id'], g['recipient_id'])).fetchone()
        notice = db.execute('select id,prior_package_id,acknowledged_at,acknowledgment_actor from revision_notices where id=%s', (g['notice_id'],)).fetchone() if g['notice_id'] else None
        assessment = json.loads(storage('GET', g['artifact_keys']['assessment.json']))
    banner = 'superseded' if newer or status == 'superseded' else 'under_review' if status == 'under_review' else 'current'
    return envelope({'banner': banner, 'replacement_available': bool(newer), 'manifest_hash': g['manifest_hash'], 'signing_status': g['signing_status'],
                     'artifacts': sorted(g['artifact_keys']), 'conclusion': assessment['conclusion'], 'case_scope': assessment['case_scope'],
                     'data_origin': assessment['data_origin'], 'retained_length_km': assessment['retained_length_km'], 'limitations': assessment['limitations'],
                     'assumptions': assessment['assumptions'], 'unknowns': assessment['unknowns'], 'next_action': assessment['next_action'],
                     'assessment_version': assessment['assessment_version'], 'reviewed_at': assessment['reviewed_at'],
                     'delivery': delivery, 'revision_notice': notice, 'expires_at': g['expires_at']}, request)


@app.get('/api/v1/share/{token}/artifacts/{name}')
def share_artifact(token: str, name: str):
    g = grant_for(token)
    if name not in g['artifact_keys']:
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    return Response(storage('GET', g['artifact_keys'][name]), media_type=MIME[name.rsplit('.', 1)[1]],
                    headers={'Content-Disposition': f'attachment; filename="{name}"', 'Cache-Control': 'private, no-store'})


@app.post('/api/v1/share/{token}/acknowledge')
def share_acknowledge(token: str, body: Acknowledge, request: Request):
    """Human acknowledgment of this exact package/revision; separate from transport delivery (F07)."""
    g = grant_for(token)
    name = body.name.strip()
    if not 2 <= len(name) <= 120:
        raise DomainError('VALIDATION_FAILED', 'Enter your name or role to acknowledge.')
    with transaction(worker=True) as db:
        db.execute('update deliveries set acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=coalesce(acknowledged_by,%s) where package_id=%s and recipient_id=%s',
                   (name, g['package_id'], g['recipient_id']))
        if g['notice_id']:
            db.execute('update revision_notices set acknowledged_at=coalesce(acknowledged_at,now()),acknowledgment_actor=coalesce(acknowledgment_actor,%s) where id=%s',
                       (name, g['notice_id']))
        db.execute("insert into case_events(org_id,case_id,event_type,object_id,payload) values(%s,%s,'package.acknowledged',%s,%s)",
                   (g['org_id'], g['case_id'], g['package_id'], json.dumps({'by': name, 'notice': str(g['notice_id']) if g['notice_id'] else None})))
    return envelope({'acknowledged': True}, request)


# ---- duplicate suggestions, merge, contribution receipts ----

class MergeCommand(StrictModel):
    into_case_id: UUID
    expected_version: int
    reason: str


@app.get('/api/v1/orgs/{org}/duplicate-suggestions')
def duplicate_suggestions(org: UUID, request: Request, lat: float, lon: float, observed_at: str, user: Identity = Depends(identity)):
    """Nearby recent investigations, generalized (rounded distance, no report content). Never merges anything (B09)."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise DomainError('VALIDATION_FAILED', 'Coordinates are outside WGS84 ranges.')
    with transaction(worker=True) as db:
        found = db.execute('''select c.id case_id,c.title,
            round(min(extensions.st_distance(r.location::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)::extensions.geography))/50)*50 distance_m,
            round(min(abs(extract(epoch from r.observed_at-%s::timestamptz)))/86400) days_apart
            from reports r join cases c on c.id=r.case_id where r.org_id=%s and c.merged_into is null and r.location is not null
            and extensions.st_dwithin(r.location::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326)::extensions.geography,500)
            and r.observed_at between %s::timestamptz-interval '3 days' and %s::timestamptz+interval '3 days'
            group by c.id order by distance_m limit 5''', (lon, lat, observed_at, org, lon, lat, observed_at, observed_at)).fetchall()
    return envelope(found, request)


@app.post('/api/v1/orgs/{org}/cases/{case}/merge')
def merge_case(org: UUID, case: UUID, body: MergeCommand, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.merge_case(%s,%s,%s,%s,%s)', (org, case, body.into_case_id, body.expected_version, body.reason)), request)


RECEIPT_SQL = '''select x.id,x.effect,x.co_dependencies,x.retained_before_m,x.retained_after_m,x.created_at,x.report_id,x.reading_id,
    a.revision,(a.result->>'eligible')::boolean eligible,private.publication_status(a.id) status,c.title case_title,c.id case_id
    from contribution_receipts x join assessments a on a.id=x.assessment_id join cases c on c.id=x.case_id'''


@app.get('/api/v1/orgs/{org}/reports/{report}/receipts')
def report_receipts(org: UUID, report: UUID, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:  # own receipts only; assessment fields are exposed only through the receipt
        return envelope(db.execute(RECEIPT_SQL + ' where x.org_id=%s and x.report_id=%s and x.user_id=%s order by x.created_at desc',
                                   (org, report, user.user_id)).fetchall(), request)


@app.get('/api/v1/orgs/{org}/receipts')
def my_receipts(org: UUID, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:
        return envelope(db.execute(RECEIPT_SQL + ' where x.org_id=%s and x.user_id=%s order by x.created_at desc limit 200',
                                   (org, user.user_id)).fetchall(), request)


@app.get('/api/v1/orgs/{org}/cases/{case}/events')
def case_events(org: UUID, case: UUID, request: Request, type: str = '', before: int | None = None, user: Identity = Depends(identity)):
    """Immutable case activity, newest first, filterable by event type prefix; cursor = sequence."""
    one(user, 'select id from cases where org_id=%s and id=%s', (org, case))
    found = rows(user, '''select e.sequence,e.event_type,e.object_id,e.object_version,e.occurred_at,e.payload,coalesce(p.display_name,case when e.actor_id is null then 'System' else 'Organization member' end) actor
        from case_events e left join profiles p on p.id=e.actor_id where e.org_id=%s and e.case_id=%s and e.event_type like %s
        and (%s::bigint is null or e.sequence<%s) order by e.sequence desc limit 51''', (org, case, type + '%', before, before))
    return envelope({'items': found[:50], 'next_before': found[49]['sequence'] if len(found) > 50 else None}, request)


# ---- notifications, community, membership administration ----

class CapabilityChange(StrictModel):
    capability: str
    grant: bool
    reason: str


class MembershipChange(StrictModel):
    status: str
    reason: str


@app.get('/api/v1/orgs/{org}/notifications')
def notifications(org: UUID, request: Request, user: Identity = Depends(identity)):
    return envelope(rows(user, '''select id,type,object_id,object_version,message,read_at,created_at from notifications
        where org_id=%s and user_id=auth.uid() order by created_at desc limit 100''', (org,)), request)


@app.post('/api/v1/orgs/{org}/notifications/{nid}/read')
def notification_read(org: UUID, nid: UUID, request: Request, user: Identity = Depends(identity)):
    with transaction(worker=True) as db:  # ownership checked in the statement itself
        n = db.execute('update notifications set read_at=coalesce(read_at,now()) where org_id=%s and id=%s and user_id=%s returning id,read_at',
                       (org, nid, user.user_id)).fetchone()
    if not n:
        raise DomainError('NOT_FOUND', 'Record not found.', 404)
    return envelope(n, request)


@app.get('/api/v1/orgs/{org}/community')
def community(org: UUID, request: Request, user: Identity = Depends(identity)):
    """Local opportunities and published updates. No rankings by samples or discoveries."""
    with transaction(user.user_id) as db:
        if not db.execute('select private.is_member(%s) ok', (org,)).fetchone()['ok']:
            raise DomainError('FORBIDDEN', 'Active organization membership is required.', 403)
        available = db.execute("select count(*) n from tasks where org_id=%s and state='proposed' and assignee_id is null", (org,)).fetchone()['n']
        mine = db.execute('''select (select count(*) from reports where org_id=%s and reporter_id=auth.uid()) reports,
            (select count(*) from reading_versions where org_id=%s and operator_id=auth.uid()) readings''', (org, org)).fetchone()
    with transaction(worker=True) as db:
        info = db.execute('select name,contact,example,locale,timezone from organizations where id=%s', (org,)).fetchone()
        updates = db.execute('''select c.id,c.title,c.workflow,c.updated_at from cases c where c.org_id=%s and c.current_assessment_id is not null
            and c.merged_into is null order by c.updated_at desc limit 10''', (org,)).fetchall()
    return envelope({'organization': info, 'available_tasks': available, 'my_contributions': mine, 'published_updates': updates}, request)


@app.get('/api/v1/orgs/{org}/members')
def members(org: UUID, request: Request, user: Identity = Depends(identity)):
    capability(user, org, 'admin')
    with transaction(worker=True) as db:
        return envelope(db.execute('''select m.user_id,m.status,coalesce(p.display_name,'Member') display_name,
            coalesce(array_agg(distinct c.capability) filter (where c.capability is not null),'{}') capabilities,
            coalesce(array_agg(distinct q.task_type||' until '||to_char(q.valid_until,'YYYY-MM-DD')) filter (where q.task_type is not null),'{}') qualifications
            from memberships m left join profiles p on p.id=m.user_id left join member_capabilities c on c.membership_id=m.id
            left join qualifications q on q.membership_id=m.id where m.org_id=%s group by m.user_id,m.status,p.display_name
            order by m.status,display_name''', (org,)).fetchall(), request)


@app.post('/api/v1/orgs/{org}/members/{member}/capabilities')
def change_capability(org: UUID, member: UUID, body: CapabilityChange, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.set_capability(%s,%s,%s,%s,%s)', (org, member, body.capability, body.grant, body.reason)), request)


@app.post('/api/v1/orgs/{org}/members/{member}/status')
def change_membership(org: UUID, member: UUID, body: MembershipChange, request: Request, user: Identity = Depends(identity)):
    return envelope(rpc(user, 'select public.set_membership_status(%s,%s,%s,%s)', (org, member, body.status, body.reason)), request)


# ---- public read-only examples (example organizations only) ----

EXAMPLES = {  # slug -> seeded synthetic case title, walkthrough summary
    'useful-evidence': ('Mill Brook', 'A reviewed network and a synthetic anchor let the exact engine exclude three upper reaches. The next visit at B2 cannot promise narrowing at this precision.'),
    'revised-evidence': ('Mill Brook (revised evidence)', 'A B2 reading narrows the area; a later instrument check puts it under review, and excluding it expands the area again.'),
    'unmapped': ('Allotment ditch', 'A report on an unnamed channel opens a useful case before any map, station or measurement exists.'),
    'tidal': ('Harbour channel', 'The case works, but the steady directed-tree model does not apply to a tidal reach, so localization stays unsupported.'),
}


def example_case(db, slug):
    if slug not in EXAMPLES:
        return None
    return db.execute('''select c.* from cases c join organizations o on o.id=c.org_id
        where o.example and c.title=%s and c.merged_into is null order by c.created_at limit 1''', (EXAMPLES[slug][0],)).fetchone()


@app.get('/api/v1/examples')
def examples(request: Request):
    with transaction(worker=True) as db:
        found = [{'slug': s, 'title': t, 'summary': d} for s, (t, d) in EXAMPLES.items() if example_case(db, s)]
    return envelope(found, request)


@app.get('/api/v1/examples/{slug}')
def example(slug: str, request: Request):
    """Synthetic walkthrough. Hard guard: only cases in organizations flagged example; no contributor identities."""
    with transaction(worker=True) as db:
        c = example_case(db, slug)
        if not c:
            raise DomainError('NOT_FOUND', 'This example is not available.', 404)
        net = None
        if c['network_id']:
            net = {'nodes': db.execute('select code,kind,extensions.st_x(point) lon,extensions.st_y(point) lat from network_nodes where network_id=%s', (c['network_id'],)).fetchall(),
                   'edges': db.execute('''select e.id,e.code,f.code from_code,t.code to_code,e.length_m,e.flow_status from network_edges e join network_nodes f on f.id=e.from_node
                        join network_nodes t on t.id=e.to_node where e.network_id=%s order by e.code''', (c['network_id'],)).fetchall(),
                   'stations': db.execute('select code from stations where network_id=%s order by code', (c['network_id'],)).fetchall()}
        a = db.execute('select * from assessments where case_id=%s order by revision desc limit 1', (c['id'],)).fetchone()
        readings = db.execute('''select s.code station,r.mode,r.bounds->'enclosure'->>'lower' lower,r.bounds->'enclosure'->>'upper' upper,r.value,r.unit,r.measured_at,
            (select disposition from quality_decisions q where q.reading_id=r.id order by created_at desc limit 1) quality
            from reading_versions r join stations s on s.id=r.station_id where r.case_id=%s order by r.measured_at''', (c['id'],)).fetchall()
        recs = db.execute('''select action->>'id' action_id,score_bound_m,rationale from recommendations where assessment_id=%s
            order by (constraints->>'rank')::int limit 3''', (a['id'],)).fetchall() if a else []
    result = a['result'] if a else None
    return envelope({'slug': slug, 'title': c['title'], 'summary': EXAMPLES[slug][1], 'workflow': c['workflow'], 'locality': c['locality'], 'data_origin': c['data_origin'],
                     'network': net, 'readings': readings, 'recommendations': recs,
                     'assessment': None if not a else {'revision': a['revision'], 'retained_length_m': a['retained_length_m'], 'eligible': result['eligible'],
                                                       'readiness_reasons': result['readiness_reasons'], 'retained_geometry_ids': result['retained_geometry_ids'],
                                                       'classes': [{k: x[k] for k in ('id', 'reach_ids', 'length_m', 'status')} for x in result['classes']]}}, request)
