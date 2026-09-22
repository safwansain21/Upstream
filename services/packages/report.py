"""Human-readable evidence report: self-contained HTML (no scripts, fonts or remote assets), printed to PDF offline."""
import html

from .contracts import PackagePayload

CSS = """
@page{size:A4;margin:16mm 16mm 18mm}
*{box-sizing:border-box}
body{font:10.5pt/1.5 "Source Sans 3","Segoe UI",Arial,sans-serif;color:#222524;margin:0;background:#fff}
header{border-bottom:3px solid #EE5634;padding:0 0 10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
header .brand{font:700 20pt/1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;letter-spacing:.2px}
header .meta{text-align:right;color:#525B60;font-size:9pt}
h1{font:700 22pt/1.1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;margin:0 0 4px}
h2{font:700 13pt/1.2 "Barlow Condensed","Arial Narrow",Arial,sans-serif;margin:18px 0 6px;color:#222524;break-after:avoid;border-bottom:1px solid #C9D4D8;padding-bottom:3px}
p{margin:4px 0;overflow-wrap:anywhere}
.banner{background:#FFF0D3;color:#8B5500;border:1px solid #E7C98B;border-radius:8px;padding:6px 10px;margin:8px 0;font-weight:600}
.summary{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;margin:10px 0}
.card{background:#EDF4F7;border-radius:10px;padding:10px 12px}
.card .label{font-size:8.5pt;text-transform:uppercase;letter-spacing:.6px;color:#525B60}
.card .value{font:700 18pt/1.1 "Barlow Condensed","Arial Narrow",Arial,sans-serif;font-variant-numeric:tabular-nums}
.conclusion{font-size:11.5pt;background:#fff;border-left:4px solid #397E98;padding:6px 10px;margin:10px 0}
table{width:100%;border-collapse:collapse;margin:6px 0;font-size:9.5pt;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #E1E8EB;vertical-align:top}
th{background:#F7F6F2;font-weight:600}
ul{margin:4px 0 4px 18px;padding:0}
li{margin:2px 0}
.mono{font-family:"IBM Plex Mono",Consolas,monospace;font-size:8.5pt;overflow-wrap:anywhere}
.muted{color:#525B60}
figure{margin:8px 0;border:1px solid #C9D4D8;border-radius:10px;padding:8px;break-inside:avoid}
figcaption{font-size:8.5pt;color:#525B60}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
section{break-inside:auto}
footer{margin-top:18px;border-top:1px solid #C9D4D8;padding-top:6px;font-size:8.5pt;color:#525B60}
"""


def _map_svg(p: PackagePayload) -> str:
    """Schematic of retained segments and stations from the package's own WGS84 coordinates (display only)."""
    points = [c for s in p.retained_segments for c in s.geometry.coordinates]
    points += [[float(s.longitude), float(s.latitude)] for s in p.stations if s.longitude is not None]
    if not points:
        return '<p class="muted">No retained geometry to draw.</p>'
    xs, ys = [x for x, _ in points], [y for _, y in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1e-6
    W, H, pad = 640, 300, 24
    scale = min((W - 2 * pad) / span, (H - 2 * pad) / span)
    xy = lambda lon, lat: (pad + (lon - min(xs)) * scale, H - pad - (lat - min(ys)) * scale)  # noqa: E731
    lines = []
    for s in p.retained_segments:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in (xy(*c) for c in s.geometry.coordinates))
        dash = ' stroke-dasharray="6 4"' if s.compatibility == "unknown" else ""
        lines.append(f'<polyline points="{pts}" fill="none" stroke="#397E98" stroke-width="5" stroke-linecap="round"{dash}><title>{html.escape(s.id)}</title></polyline>')
    marks = []
    for s in p.stations:
        if s.longitude is None:
            continue
        x, y = xy(float(s.longitude), float(s.latitude))
        marks.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="#fff" stroke="#222524" stroke-width="1.5"/>'
                     f'<text x="{x + 7:.1f}" y="{y + 4:.1f}" font-size="10" fill="#222524" font-family="Arial">{html.escape(s.id)}</text>')
    return (f'<figure><svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Schematic of retained segments and stations">'
            f'<rect width="{W}" height="{H}" fill="#EDF4F7" rx="8"/>{"".join(lines)}{"".join(marks)}</svg>'
            '<figcaption>Schematic drawn from the package geometry (WGS84), not a satellite image. Solid: compatible; dashed: unresolved. '
            'Separate segments are never joined.</figcaption></figure>')


def human_report(p: PackagePayload, assessment: dict, signed: bool) -> str:
    e = lambda value: html.escape(str(value), quote=True)  # noqa: E731
    items = lambda values: "<ul>" + "".join(f"<li>{e(v)}</li>" for v in values) + "</ul>" if values else '<p class="muted">None recorded.</p>'  # noqa: E731
    extent = "; upstream extent unresolved" if p.upstream_extent_unresolved else ""
    banner = ('<div class="banner">Example data: synthetic records for demonstration and testing. Not findings about a real stream.</div>'
              if p.data_origin == "synthetic" else f'<div class="banner">Data origin: {e(p.data_origin)}</div>' if p.data_origin != "real" else "")
    segments = "".join(f"<tr><td>{e(s.id)}</td><td>{e(s.length_km)} km</td><td>{e(s.compatibility)}</td><td>{e(s.origin)}</td><td>{e(s.source)}</td></tr>" for s in p.retained_segments)
    stations = "".join(f"<tr><td>{e(s.id)}</td><td>{e(s.version)}</td><td>{e(s.latitude) if s.latitude else 'unknown'}</td><td>{e(s.longitude) if s.longitude else 'unknown'}</td></tr>" for s in p.stations)
    evidence = "".join(f"<tr><td>{e(o.station_id)}</td><td class=\"mono\">{e(o.id)} v{e(o.version)}</td><td>{e(o.measured_at)}</td><td>{e(o.value)} {e(o.unit)} ({e(o.mode)})</td>"
                       f"<td>{e(o.quality)} · {e(o.inclusion)}</td><td>{e(o.instrument_id)} · cal {e(o.calibration_version)} · protocol {e(o.protocol_version)} · {e(o.contributor_pseudonym)} · {e(o.origin)}</td></tr>"
                       for o in p.observations)
    versions = "".join(f"<tr><th>{e(k)}</th><td class=\"mono\">{e(v)}</td></tr>" for k, v in p.versions.model_dump().items())
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Upstream evidence report</title><style>{CSS}</style></head><body>
<header><div class="brand">upstream</div><div class="meta">{e(p.organization_name)}<br>Package <span class="mono">{e(p.package_id)}</span></div></header>
<h1>Environmental evidence report</h1>
<p class="muted">{e(p.case_scope)}</p>
{banner}
<div class="summary">
 <div class="card"><div class="label">Retained channel</div><div class="value">{e(assessment['retained_length_km'])} km</div><div>within the mapped domain{e(extent)}</div></div>
 <div class="card"><div class="label">Assessment</div><div class="value">{e(p.assessment_version)}</div><div>engine {e(p.versions.engine)}</div></div>
 <div class="card"><div class="label">Reviewed</div><div>{e(p.reviewed_at[:16].replace('T', ' '))} UTC</div><div>by pseudonym {e(p.reviewer_pseudonym)}</div></div>
</div>
<h2>Reviewed conclusion</h2><p class="conclusion">{e(p.conclusion)}</p>
<p>Assessment {e(p.assessment_id)} version {e(p.assessment_version)}, reviewed {e(p.reviewed_at)}. Observation period {e(p.observation_start)} to {e(p.observation_end)} · origin {e(p.data_origin)}</p>
<h2>Retained segments</h2>{_map_svg(p)}
<table><thead><tr><th>Segment</th><th>Length</th><th>Status</th><th>Origin</th><th>Source</th></tr></thead><tbody>{segments or '<tr><td colspan="5">No retained segments (not eligible for localization).</td></tr>'}</tbody></table>
<p class="muted">Compatible and unresolved segments are retained. Channel length is reviewed channel length, not a count of rows.</p>
<div class="two"><div><h2>Assumptions</h2>{items(p.assumptions)}</div><div><h2>Model limitations</h2>{items(p.limitations)}</div></div>
<div class="two"><div><h2>Unknowns</h2>{items(p.unknowns)}</div><div><h2>Next action</h2><p>{e(p.next_action)}</p></div></div>
<h2>Evidence and quality</h2>
<table><thead><tr><th>Station</th><th>Reading</th><th>Measured</th><th>Value</th><th>QC / inclusion</th><th>Traceability</th></tr></thead><tbody>{evidence or '<tr><td colspan="6">No readings.</td></tr>'}</tbody></table>
<h2>Stations</h2>
<table><thead><tr><th>Station</th><th>Network version</th><th>Latitude</th><th>Longitude</th></tr></thead><tbody>{stations}</tbody></table>
<h2>Versions and verification</h2>
<table><tbody>{versions}<tr><th>problem SHA-256</th><td class="mono">{e(p.problem_hash)}</td></tr>
<tr><th>predecessor manifest</th><td class="mono">{e(p.predecessor_manifest_hash or 'none')}</td></tr></tbody></table>
<p>{'Signed with a detached Ed25519 JWS (manifest.jws).' if signed else 'Unsigned package.'} Verify every file against manifest.json using the Upstream verification tool with an independently trusted key and the expected predecessor hash.
Signing proves integrity and key origin, not scientific correctness.</p>
<footer>This report supports investigation. It is not a water safety assessment, a health finding or a determination of responsibility.</footer>
</body></html>"""
