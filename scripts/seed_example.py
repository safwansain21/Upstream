"""Idempotently seed the SYNTHETIC example workspace. Refuses to run outside local example mode.

Every record is data_origin='synthetic'. Reports go through the real submit_report RPC; scientific
network values come from fixtures/ (SCIENTIFIC-ENGINE.md canonical fixtures), never invented here.
"""
import json
import math
import sys
from pathlib import Path
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'packages/engine')]

from fixtures.networks import network1, unsupported_networks  # noqa: E402
from services.api.config import settings  # noqa: E402
from services.api.db import transaction  # noqa: E402

PASSWORD = 'upstream-example-only'  # ponytail: local example credentials; production refuses EXAMPLE_MODE
USERS = {  # email -> (display name, capabilities, qualified task types)
    'coordinator@example.test': ('Example coordinator', ['coordinate', 'network_verify'], ['mapping_verification']),
    'expert@example.test': ('Example expert reviewer', ['expert', 'evidence_view'], ['expert_review']),
    'monitor@example.test': ('Example trained monitor', ['monitor'],
                             ['baseline_reading', 'anchor_reading', 'conductance_reading', 'coordinated_pair', 'instrument_check']),
    'contributor@example.test': ('Example contributor', [], []),
    'admin@example.test': ('Example organization admin', ['admin'], []),
}
BASE = (51.4500, -2.5900)  # synthetic placement; the example river is fictional


def sid(name: str) -> str:
    return str(uuid5(NAMESPACE_URL, 'upstream-example:' + name))


def guard():
    cfg = settings()
    host = urlsplit(cfg.database_url).hostname
    if cfg.environment == 'production' or not cfg.example_mode or host not in {'127.0.0.1', 'localhost', 'db'}:
        raise SystemExit('Refusing to seed: requires EXAMPLE_MODE=true, non-production and a local database.')
    if not cfg.supabase_service_role_key:
        raise SystemExit('Set SUPABASE_SERVICE_ROLE_KEY in .env (see `pnpm exec supabase status`).')
    return cfg


def ensure_user(db, cfg, email: str) -> str:
    row = db.execute('select id from auth.users where email=%s', (email,)).fetchone()
    if row:
        return str(row['id'])
    key = cfg.supabase_service_role_key
    response = httpx.post(cfg.supabase_url + '/auth/v1/admin/users', timeout=15,
                          headers={'apikey': key, 'Authorization': f'Bearer {key}'},
                          json={'email': email, 'password': PASSWORD, 'email_confirm': True})
    response.raise_for_status()
    return response.json()['id']


def layout(net):
    """Schematic coordinates: walk upstream from the outlet, branching left/right. Illustrative only."""
    down = {r.upstream: r for r in net.reaches}
    ups = {}
    for r in net.reaches:
        ups.setdefault(r.downstream, []).append(r)
    outlet = next(n for n in ups if n not in down)
    pos, stack = {outlet: (0.0, 0.0)}, [(outlet, 90.0)]
    while stack:
        node, heading = stack.pop()
        children = sorted(ups.get(node, []), key=lambda r: r.id)
        for i, r in enumerate(children):
            turn = heading + (0 if len(children) == 1 else (-35 if i == 0 else 35))
            x, y = pos[node]
            d = float(r.length_m)
            pos[r.upstream] = (x + d * math.cos(math.radians(turn)), y + d * math.sin(math.radians(turn)))
            stack.append((r.upstream, turn))
    lat0, lon0 = BASE
    return {n: (lon0 + x / (111320 * math.cos(math.radians(lat0))), lat0 + y / 110540) for n, (x, y) in pos.items()}


def seed_network(db, org, case, net, offset, status='reviewed', flow_regime='steady_directed_tree'):
    nid = sid(f'{case}:network:1')
    if db.execute('select 1 from network_versions where id=%s', (nid,)).fetchone():
        return nid
    stations = {s.node for s in net.stations}
    coords = {n: (lon + offset[0], lat + offset[1]) for n, (lon, lat) in layout(net).items()}
    tidal = any(r.tidal for r in net.reaches)
    db.execute('''insert into network_versions(id,org_id,case_id,version,source,license,status,completeness,flow_regime,
        boundary_treatment,evidence_refs,content_hash,review_reason) values(%s,%s,%s,1,%s,'CC0-1.0 synthetic',%s,%s,%s,%s,%s,%s,%s)''',
               (nid, org, case, f'SCIENTIFIC-ENGINE.md synthetic fixture {net.id}', status,
                'synthetic_complete_domain', 'tidal' if tidal else flow_regime, net.boundary, [net.boundary_evidence],
                sid(f'{net.id}:hash'), 'Synthetic fixture: reviewed by construction, not field verification'))
    for node, (lon, lat) in coords.items():
        kind = 'station' if node in stations else 'source' if node.endswith('head') else 'junction'
        db.execute('''insert into network_nodes(id,org_id,network_id,code,kind,point,boundary)
            values(%s,%s,%s,%s,%s,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326),%s)''',
                   (sid(f'{nid}:node:{node}'), org, nid, node, kind, lon, lat, 'closed' if kind == 'source' else 'interior'))
    for r in net.reaches:
        (x1, y1), (x2, y2) = coords[r.upstream], coords[r.downstream]
        db.execute('''insert into network_edges(id,org_id,network_id,code,from_node,to_node,line,length_m,flow_status,connectivity)
            values(%s,%s,%s,%s,%s,%s,extensions.st_setsrid(extensions.st_makeline(extensions.st_makepoint(%s,%s),
            extensions.st_makepoint(%s,%s)),4326),%s,%s,%s)''',
                   (sid(f'{nid}:edge:{r.id}'), org, nid, r.id, sid(f'{nid}:node:{r.upstream}'), sid(f'{nid}:node:{r.downstream}'),
                    x1, y1, x2, y2, r.length_m, 'tidal' if r.tidal else 'verified' if r.direction_verified else 'unknown',
                    'verified' if status == 'reviewed' and not r.tidal else 'mapped_unverified'))
    for s in net.stations:
        lon, lat = coords[s.node]
        db.execute('''insert into stations(id,org_id,case_id,network_id,code,point,status,access_status,access_notes)
            values(%s,%s,%s,%s,%s,extensions.st_setsrid(extensions.st_makepoint(%s,%s),4326),'approved','open',
            'Synthetic example access point') on conflict do nothing''', (sid(f'{case}:station:{s.id}'), org, case, nid, s.id, lon, lat))
    db.execute('update cases set network_id=%s where id=%s', (nid, case))
    return nid


def submit(user_id, org, key, body):
    with transaction(user_id) as db:
        return db.execute('select public.submit_report(%s::uuid,%s::uuid,%s::jsonb) r', (org, sid(key), json.dumps(body))).fetchone()['r']


def main():
    cfg = guard()
    org = cfg.intake_org_id  # ponytail: example org doubles as local intake org; production uses its own INTAKE_ORG_ID
    with transaction(worker=True) as db:
        db.execute('''insert into organizations(id,name,slug,intake_enabled,example,contact)
            values(%s,'Mill Brook Watershed Group (example)','example',true,true,'Synthetic example workspace - no real contact')
            on conflict(id) do nothing''', (org,))
        ids = {email: ensure_user(db, cfg, email) for email in USERS}
        admin = ids['admin@example.test']
        for email, (name, caps, quals) in USERS.items():
            uid = ids[email]
            db.execute('insert into profiles(id,display_name) values(%s,%s) on conflict(id) do nothing', (uid, name))
            mid = db.execute('''insert into memberships(org_id,user_id) values(%s,%s) on conflict(org_id,user_id)
                do update set status='active' returning id''', (org, uid)).fetchone()['id']
            for cap in caps:
                db.execute('''insert into member_capabilities(org_id,membership_id,capability,granted_by)
                    values(%s,%s,%s,%s) on conflict do nothing''', (org, mid, cap, admin))
            for task_type in quals:
                db.execute('''insert into qualifications(id,org_id,membership_id,task_type,evidence_document,reviewed_by,valid_from,valid_until)
                    values(%s,%s,%s,%s,'Synthetic example training record',%s,'2026-01-01','2028-01-01') on conflict do nothing''',
                           (sid(f'{email}:qual:{task_type}'), org, mid, task_type, ids['expert@example.test']))
        for serial in ('SC-009', 'SC-011', 'SC-014'):
            iid = sid(f'instrument:{serial}')
            db.execute('''insert into instruments(id,org_id,serial,model,capabilities,specifications) values(%s,%s,%s,
                'Example conductivity meter (synthetic)','{conductivity,temperature}','{"accuracy":"synthetic specification"}')
                on conflict do nothing''', (iid, org, serial))
            db.execute('''insert into calibration_events(id,org_id,instrument_id,status,effective_from,effective_until,checked_at,reason,reviewer_id)
                values(%s,%s,%s,'pass','2026-01-01','2027-12-31','2026-01-01','Synthetic example calibration',%s) on conflict do nothing''',
                       (sid(f'calibration:{serial}:1'), org, iid, ids['expert@example.test']))

    contributor = ids['contributor@example.test']
    base = {'categories': ['unusual_foam'], 'observed_at': '2026-09-10T14:20:00+01:00', 'timezone': 'Europe/London',
            'public_visibility': False, 'media_ids': [], 'new_observation': True}
    mill = submit(contributor, org, 'report:mill-brook', base | {
        'client_id': sid('client:mill-brook'), 'description': 'Foam collecting beside the east footbridge.',
        'landmark': 'East footbridge', 'latitude': BASE[0], 'longitude': BASE[1], 'accuracy_m': 15,
        'location_method': 'gps', 'location_precision': 'approximate', 'local_name': 'Mill Brook', 'unmapped': False})
    unnamed = submit(contributor, org, 'report:unnamed', base | {
        'client_id': sid('client:unnamed'), 'categories': ['colour_change'],
        'description': 'Grey water in a small channel behind the allotments.', 'landmark': 'Behind the allotments gate, Park Lane',
        'local_name': 'Allotment ditch', 'unmapped': True})
    tidal = submit(contributor, org, 'report:tidal', base | {
        'client_id': sid('client:tidal'), 'categories': ['odour'], 'description': 'Odour noticed at the tidal outfall.',
        'landmark': 'Harbour steps', 'latitude': BASE[0] - .05, 'longitude': BASE[1] - .05, 'local_name': 'Harbour channel'})
    with transaction(worker=True) as db:
        db.execute("update cases set locality='West catchment (synthetic)', workflow='localization_active' where id=%s", (mill['case_id'],))
        db.execute("update cases set locality='Park Lane (synthetic)', workflow='triage' where id=%s", (unnamed['case_id'],))
        db.execute("update cases set locality='Harbour (synthetic)', workflow='triage' where id=%s", (tidal['case_id'],))
        seed_network(db, org, mill['case_id'], network1(), (0, 0))
        seed_network(db, org, tidal['case_id'], unsupported_networks()[1], (-.05, -.05))
    print(f'Seeded synthetic example workspace in organization {org}. Users: {", ".join(USERS)}; password: {PASSWORD}')


if __name__ == '__main__':
    main()
