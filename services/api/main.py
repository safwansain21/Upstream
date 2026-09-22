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


# ---- uploads / media ----

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard (G08); also checked explicitly below
MAX_BYTES = 15 * 1024 * 1024
FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}


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
    with transaction(user.user_id) as db:  # same intake/membership rule as submit_report
        allowed = db.execute('''select exists(select 1 from organizations where id=%s and intake_enabled)
            or private.is_member(%s) as ok''', (org, org)).fetchone()['ok']
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
