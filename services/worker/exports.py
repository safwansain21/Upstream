"""Evidence package export: approved assessment -> allowlisted payload -> immutable signed artifacts in private storage."""
import base64
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from services.api.config import settings
from services.api.storage import storage
from services.packages import build_package
from services.packages.pdf import render_pdf
from services.worker.snapshot import digest

MIME = {'json': 'application/json', 'geojson': 'application/geo+json', 'html': 'text/html', 'pdf': 'application/pdf', 'jws': 'text/plain'}
QUALITY = {'accepted': ('reviewed', 'included'), 'suspect': ('suspect', 'history_only'), 'excluded': ('rejected', 'excluded')}
LIMITATIONS = ['Conditional compatibility with one sustained nonnegative effective-conductance input; not pollutant identification.',
               'No water safety, health or source-responsibility conclusion.',
               'Excluded reaches are incompatible under the stated bounds, not proven clean; retained reaches are not proven responsible.']


def signing_key():
    cfg = settings()
    if not cfg.export_signing_private_key or not cfg.export_signing_key_id:
        return None, None
    return Ed25519PrivateKey.from_private_bytes(base64.b64decode(cfg.export_signing_private_key)), cfg.export_signing_key_id


def payload(db, org, aid, package_id):
    a = db.execute('select * from assessments where org_id=%s and id=%s', (org, aid)).fetchone()
    status = db.execute('select status,actor_id,created_at from assessment_publications where assessment_id=%s order by created_at desc limit 1', (aid,)).fetchone()
    if not status or status['status'] != 'approved':
        raise ValueError('Only a currently approved assessment can be exported')
    case = db.execute('select * from cases where id=%s', (a['case_id'],)).fetchone()
    orgrow = db.execute('select name from organizations where id=%s', (org,)).fetchone()
    snap, result = a['snapshot'], a['result']
    net_id = snap['network']['id']
    net = db.execute('select * from network_versions where id=%s', (net_id,)).fetchone()
    edges = {str(e['id']): e for e in db.execute('select id,code,length_m,extensions.st_asgeojson(line)::jsonb g from network_edges where network_id=%s', (net_id,))}
    kept = {g: c['status'] for c in result['classes'] if c['status'] != 'incompatible' for g in c['geometry_ids']}
    stations = db.execute('select code,extensions.st_x(point) lon,extensions.st_y(point) lat from stations where network_id=%s order by code', (net_id,)).fetchall()
    ids = [r['file_ref'].split(':', 1)[1] for r in snap['readings']]
    rows = {str(r['id']): r for r in db.execute('''select r.id,r.value,r.unit,r.temperature,r.mode,r.calibration_id,i.serial from reading_versions r
        join instruments i on i.id=r.instrument_id where r.id = any(%s::uuid[])''', (ids,))}
    observations = []
    for r in snap['readings']:
        row = rows[r['file_ref'].split(':', 1)[1]]
        quality, inclusion = QUALITY.get(r['qc'], ('unreviewed', 'history_only'))
        enclosure = r.get('enclosure')
        value = Decimal(str(row['value'])) * (1000 if row['unit'] == 'mS/cm' else 1)
        observations.append({
            'id': r['id'], 'version': r['version'], 'station_id': r['station_id'], 'instrument_id': row['serial'], 'visit_id': r['visit_id'],
            'contributor_pseudonym': r['contributor'].replace('pseudonym:', 'p-'), 'measured_at': r['measured_at'], 'received_at': r['received_at'],
            'value': format(value.normalize(), 'f'), 'unit': 'uS/cm', 'mode': 'true_sc25' if r['mode'] == 'true_sc25_enclosure' else r['mode'],
            'temperature_c': str(row['temperature']) if row['temperature'] is not None else None, 'quality': quality, 'inclusion': inclusion,
            'origin': r['data_origin'], 'protocol_version': r['protocol_ref'][:128], 'calibration_version': str(row['calibration_id'] or 'not-applicable'),
            'source': r['file_ref'],
            'compensation_description': f"Reviewed true-SC25 enclosure [{enclosure['lower']}, {enclosure['upper']}] uS/cm ({enclosure['method']}; {enclosure['source']})" if enclosure else None,
            'background_description': 'Empirical background range; future-observation coverage not established; not a healthy range.'})
    times = [r['measured_at'] for r in snap['readings']] or [a['created_at'].isoformat()]
    decision = db.execute('select action,rationale from expert_decisions where case_id=%s order by created_at desc limit 1', (case['id'],)).fetchone()
    top = db.execute("select action->>'id' a,score_bound_m from recommendations where assessment_id=%s order by (constraints->>'rank')::int limit 1", (aid,)).fetchone()
    retained_km = format((Decimal(a['retained_length_m'] or 0) / 1000).normalize(), 'f')
    prior = db.execute('select id,manifest_hash from evidence_packages where case_id=%s order by created_at desc limit 1', (case['id'],)).fetchone()
    return {
        'package_id': package_id, 'case_id': str(case['id']), 'assessment_id': str(aid), 'assessment_version': str(a['revision']),
        'organization_id': str(org), 'organization_name': orgrow['name'], 'created_at': datetime.now(timezone.utc).isoformat(),
        'reviewed_at': status['created_at'].isoformat(), 'reviewer_pseudonym': 'reviewer-' + digest(str(status['actor_id']))[:12],
        'data_origin': case['data_origin'], 'case_scope': f"{case['title']} · network version {net['version']} ({net['source']}; {net['license']})",
        'observation_start': min(times), 'observation_end': max(times),
        'conclusion': (f'{retained_km} km of channel retained within the mapped domain under the stated assumptions. The cause is not established.'
                       if result['eligible'] else 'Source-area localization was not eligible: ' + '; '.join(result['readiness_reasons'])),
        'assumptions': result['assumptions'], 'unknowns': result['readiness_reasons'] + (['Upstream extent unresolved (open boundary)'] if result['outside_domain_unresolved'] else []),
        'limitations': LIMITATIONS,
        'next_action': (f"Expert decision: {decision['action']} — {decision['rationale']}" if decision else
                        f"Next useful observation proposed: {top['a']} (conservative model bound {top['score_bound_m']} m)" if top else 'No further action proposed'),
        'versions': {'network': f"{net['id']}:{net['version']}", 'protocol': snap['protocol_version'][:128],
                     'background': 'bg-' + digest(snap['backgrounds'])[:16], 'transport': snap['dependencies'].get('transport', 'none').replace('@', ':')[:128],
                     'engine': a['engine_version']},
        'problem_hash': a['snapshot_hash'], 'upstream_extent_unresolved': bool(result['outside_domain_unresolved']),
        'retained_segments': [{'id': edges[g]['code'].replace(':', '-'), 'length_km': format((Decimal(str(edges[g]['length_m'])) / 1000).normalize(), 'f'),
                               'geometry': {'type': 'LineString', 'coordinates': edges[g]['g']['coordinates']}, 'origin': case['data_origin'],
                               'source': net['source'], 'compatibility': 'compatible' if st == 'compatible' else 'unknown'}
                              for g, st in sorted(kept.items()) if g in edges] if result['eligible'] else [],
        'stations': [{'id': s['code'], 'version': str(net['version']), 'name': f"Station {s['code']}", 'longitude': str(s['lon']), 'latitude': str(s['lat'])} for s in stations],
        'observations': observations,
        'predecessor_manifest_hash': prior['manifest_hash'] if prior else None,
    }, prior


def export(db, job):
    """Build, store and register one package for an approved assessment. Idempotent per assessment (job input hash)."""
    org, aid = job['org_id'], job['input_hash']
    existing = db.execute('select id from evidence_packages where assessment_id=%s', (aid,)).fetchone()
    if existing:
        return existing['id']
    package_id = str(uuid4())
    data, prior = payload(db, org, aid, package_id)
    key, kid = signing_key()
    package = build_package(data, private_key=key, key_id=kid, pdf_renderer=render_pdf)
    keys = {}
    for name, content in package.artifacts.items():
        keys[name] = f'packages/{org}/{package_id}/{name}'
        storage('POST', keys[name], bytes(content), MIME[name.rsplit('.', 1)[1]])
    manifest = json.loads(package.artifacts['manifest.json'])
    db.execute('''insert into evidence_packages(id,org_id,assessment_id,case_id,manifest,manifest_hash,artifact_keys,signing_status,predecessor_id)
        values(%s,%s,%s,%s,%s,%s,%s,%s,%s)''', (package_id, org, aid, data['case_id'], json.dumps(manifest), package.manifest_hash,
                                               json.dumps(keys), manifest['signature']['status'], prior and prior['id']))
    db.execute("insert into case_events(org_id,case_id,event_type,object_id,payload) values(%s,%s,'package.created',%s,%s)",
               (org, data['case_id'], package_id, json.dumps({'manifest_hash': package.manifest_hash, 'signed': key is not None})))
    return package_id
