"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { NetworkDiagram, ReachLegend } from "../../../../../../components/network-diagram";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { schematic } from "../../../../../../lib/geo";
import { useOrg } from "../../../../../../lib/session";

type VersionRow = { id: string; version: number; status: string; source: string; license: string; published_at: string | null; review_reason: string | null; current: boolean };
type Version = { id: string; case_id: string; version: number; status: string; source: string; license: string; boundary_treatment: string; review_reason: string | null;
  evidence_refs: string[]; import_warnings: string[]; validation: string[];
  diff: { added: string[]; removed: string[]; direction_changed: string[]; status_changed: string[]; length_before_m: string; length_after_m: string } | null;
  nodes: { code: string; kind: string; lon: number; lat: number }[];
  edges: { id: string; code: string; from_code: string; to_code: string; length_m: string; flow_status: string; connectivity: string; culvert: boolean }[];
  stations: { id: string; code: string; status: string; access_status: string; lon: number; lat: number }[] };

export default function MapSetup() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const client = useQueryClient();
  const versions = useQuery({ queryKey: ["network-versions", org, caseId], queryFn: () => api<VersionRow[]>(`/orgs/${org}/cases/${caseId}/network/versions`) });
  const draftRow = versions.data?.find(v => v.status === "proposed");
  const shown = draftRow ?? versions.data?.find(v => v.current);
  const detail = useQuery({ queryKey: ["network-version", org, shown?.id], enabled: !!shown, queryFn: () => api<Version>(`/orgs/${org}/networks/${shown!.id}`) });
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const refresh = () => { client.invalidateQueries({ queryKey: ["network-versions", org, caseId] }); client.invalidateQueries({ queryKey: ["network-version", org] }); client.invalidateQueries({ queryKey: ["network", org, caseId] }); };
  async function call(path: string, method: string, json?: unknown, done = "Saved.") {
    setError(""); setStatus("");
    try { await api(path, { method, json }); setStatus(done); refresh(); } catch (e) { setError((e as Error).message); }
  }
  const editor = can("coordinate") || can("network_verify");
  const v = detail.data; const draft = v?.status === "proposed";
  const view = v ? schematic(v.nodes, v.edges, new Set(v.stations.map(s => s.code)), e => ((v.edges.find(x => x.id === e.id)?.connectivity === "verified" && v.edges.find(x => x.id === e.id)?.flow_status === "verified") ? "candidate" : "unreviewed")) : null;

  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>Investigation overview</Link> / <span aria-current="page">Map setup</span></nav>
    <PageIntro title="Local map and readiness"><p>Imported or drawn linework is a proposal. Connectivity, flow direction and stations become usable for localization only after documented review and publication.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}{status ? <p className="notice" role="status">{status}</p> : null}
    {versions.error ? <InlineError>{versions.error.message}</InlineError> : !versions.data ? <LoadingState/> : <>
      <section className="surface stack" aria-labelledby="versions-heading"><h2 id="versions-heading">Network versions</h2>
        {versions.data.length ? <ul>{versions.data.map(r => <li key={r.id}>Version {r.version} · <CaseStatus tone={r.status === "reviewed" ? "accepted" : "warning"}>{r.status === "proposed" ? "Draft" : r.status}</CaseStatus>{r.current ? " · current" : ""} · {r.source} ({r.license}){r.review_reason ? ` · ${r.review_reason}` : ""}</li>)}</ul>
          : <p>No local network yet. Map verification is needed before source-area localization; the case remains a useful coordination record.</p>}
        {editor && !draftRow ? <StartDraft org={org} caseId={caseId} canCopy={versions.data.some(r => r.current)} onDone={() => { setStatus("Draft created."); refresh(); }} onError={setError}/> : null}
      </section>
      {shown && !v ? (detail.error ? <InlineError>{detail.error.message}</InlineError> : <LoadingState/>) : null}
      {v ? <>
        <section className="surface stack" aria-labelledby="draft-heading"><h2 id="draft-heading">{draft ? `Draft version ${v.version}` : `Published version ${v.version}`}</h2>
          {view && view.stations.length ? <><NetworkDiagram label={`Schematic of network version ${v.version}`} stations={view.stations} reaches={view.reaches}/><ReachLegend/></> : <EmptyState title="No geometry in this version"/>}
          {v.import_warnings.length ? <div className="notice"><strong>Import warnings</strong><ul>{v.import_warnings.map(w => <li key={w}>{w}</li>)}</ul></div> : null}
          <div><strong>Localization support checks</strong>{v.validation.length ? <ul>{v.validation.map(r => <li key={r}>{r}</li>)}</ul> : <p>No topology or review blockers.</p>}</div>
          {v.diff ? <p>Changes from the current version: {v.diff.added.length} added, {v.diff.removed.length} removed, {v.diff.direction_changed.length} direction changes, {v.diff.status_changed.length} status changes. Channel length {(Number(v.diff.length_before_m) / 1000).toFixed(2)} → {(Number(v.diff.length_after_m) / 1000).toFixed(2)} km.</p> : null}
        </section>
        <section className="surface stack" aria-labelledby="reaches-heading"><h2 id="reaches-heading">Reaches</h2>
          <div className="table-scroll" role="region" aria-label="Reaches" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Reach</th><th scope="col">From → to</th><th scope="col">Length</th><th scope="col">Flow direction</th><th scope="col">Connectivity</th>{draft && editor ? <th scope="col">Edit</th> : null}</tr></thead>
            <tbody>{v.edges.map(e => <tr key={e.id}><td>{e.code}{e.culvert ? " · culvert" : ""}</td><td>{e.from_code} → {e.to_code}</td><td className="numeric">{Number(e.length_m).toFixed(0)} m</td><td>{e.flow_status}</td><td>{e.connectivity}</td>
              {draft && editor ? <td><div className="button-row">
                <button className="button button-quiet" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { flow_status: "verified" })}>Direction verified</button>
                <button className="button button-quiet" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { flow_status: "reverse" })}>Reverse</button>
                <button className="button button-quiet" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { connectivity: "verified" })}>Connection verified</button>
                <button className="button button-quiet" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { culvert: true })}>Flag culvert / unknown link</button></div></td> : null}</tr>)}</tbody></table></div>
        </section>
        <section className="surface stack" aria-labelledby="stations-heading"><h2 id="stations-heading">Stations</h2>
          {v.stations.length ? <ul>{v.stations.map(s => <li key={s.id}>{s.code} · {s.status} · access {s.access_status} · {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
            {draft && editor && s.status !== "approved" ? <> <button className="button button-quiet" onClick={() => call(`/orgs/${org}/networks/${v.id}/stations/${s.id}/approve`, "POST", undefined, `Station ${s.code} approved.`)}>Approve position</button></> : null}</li>)}</ul> : <p>No stations yet.</p>}
          {draft && editor ? <AddStation org={org} nid={v.id} onDone={() => { setStatus("Station placed."); refresh(); }} onError={setError}/> : null}
        </section>
        {draft && can("network_verify") ? <PublishForm org={org} nid={v.id} onDone={() => { setStatus("Published. Earlier assessments keep the version they used."); refresh(); }} onError={setError}/> : draft ? <p className="muted">Publishing needs network verification capability.</p> : null}
      </> : null}
    </>}
  </main>;
}

function StartDraft({ org, caseId, canCopy, onDone, onError }: { org: string; caseId: string; canCopy: boolean; onDone: () => void; onError: (m: string) => void }) {
  const [source, setSource] = useState(""); const [license, setLicense] = useState(""); const [file, setFile] = useState<File | null>(null);
  async function start(copy: boolean) {
    onError("");
    try {
      let geojson: unknown = undefined;
      if (!copy) {
        if (!file) throw new Error("Choose a GeoJSON file.");
        if (file.size > 10 * 1024 * 1024) throw new Error("GeoJSON imports are limited to 10 MB.");
        try { geojson = JSON.parse(await file.text()); } catch { throw new Error("The file is not valid JSON."); }
      }
      await api(`/orgs/${org}/cases/${caseId}/network/drafts`, { method: "POST", json: copy ? {} : { source, license, geojson } }); onDone();
    } catch (e) { onError((e as Error).message); }
  }
  return <div className="stack"><h3>Start a draft</h3>
    {canCopy ? <button className="button button-outline" onClick={() => start(true)}>Edit a copy of the current version</button> : null}
    <div className="form-field"><label htmlFor="geojson">Import GeoJSON linework (LineString reaches; optional Point features with a “station” property)</label><input id="geojson" type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={e => setFile(e.target.files?.[0] ?? null)}/></div>
    <div className="button-row"><div className="form-field"><label htmlFor="src">Source</label><input id="src" value={source} onChange={e => setSource(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="lic">Licence</label><input id="lic" value={license} onChange={e => setLicense(e.target.value)}/></div></div>
    <p className="field-help">Imported links start as mapped but unverified. Nothing is uploaded to OpenStreetMap or an authority.</p>
    <button className="button button-primary" disabled={!file || source.length < 3 || license.length < 2} onClick={() => start(false)}>Import as draft</button></div>;
}

function AddStation({ org, nid, onDone, onError }: { org: string; nid: string; onDone: () => void; onError: (m: string) => void }) {
  const [code, setCode] = useState(""); const [lat, setLat] = useState(""); const [lon, setLon] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault(); onError("");
    try { await api(`/orgs/${org}/networks/${nid}/stations`, { method: "POST", json: { code, lat: Number(lat), lon: Number(lon) } }); setCode(""); onDone(); }
    catch (err) { onError((err as Error).message); }
  }
  return <form className="stack" onSubmit={add} aria-label="Add station"><h3>Add a station</h3><p className="field-help">A station must lie on a mapped reach (within 5 m) or on an existing node. It is never moved to a nearby stream automatically.</p>
    <div className="button-row"><div className="form-field"><label htmlFor="scode">Station code</label><input id="scode" value={code} onChange={e => setCode(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="slat">Latitude</label><input id="slat" inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="slon">Longitude</label><input id="slon" inputMode="decimal" value={lon} onChange={e => setLon(e.target.value)}/></div></div>
    <button className="button button-outline" disabled={!code || !lat || !lon}>Place station</button></form>;
}

function PublishForm({ org, nid, onDone, onError }: { org: string; nid: string; onDone: () => void; onError: (m: string) => void }) {
  const [reason, setReason] = useState(""); const [evidence, setEvidence] = useState(""); const [boundary, setBoundary] = useState("unknown");
  const [mixing, setMixing] = useState(false); const [note, setNote] = useState("");
  async function publish(e: React.FormEvent) {
    e.preventDefault(); onError("");
    try { await api(`/orgs/${org}/networks/${nid}/publish`, { method: "POST", json: { reason, evidence: evidence.split(",").map(x => x.trim()).filter(Boolean), boundary, mixing_reviewed: mixing, domain_note: note } }); onDone(); }
    catch (err) { onError((err as Error).message); }
  }
  return <form className="surface stack" onSubmit={publish} aria-labelledby="publish-heading"><h2 id="publish-heading">Publish after verification</h2>
    <div className="form-field"><label htmlFor="preason">Verification rationale</label><textarea id="preason" rows={2} value={reason} onChange={e => setReason(e.target.value)}/></div>
    <div className="form-field"><label htmlFor="pevidence">Evidence references (comma separated)</label><input id="pevidence" value={evidence} onChange={e => setEvidence(e.target.value)}/></div>
    <div className="form-field"><label htmlFor="pboundary">Upstream boundary</label><select id="pboundary" value={boundary} onChange={e => setBoundary(e.target.value)}><option value="unknown">Unknown</option><option value="open">Open: upstream inflow possible (extent unresolved)</option><option value="closed">Closed: documented complete domain</option></select></div>
    <label className="checkbox-field"><input type="checkbox" checked={mixing} onChange={e => setMixing(e.target.checked)}/><span>Mixing assumptions reviewed</span></label>
    <div className="form-field"><label htmlFor="pnote">Domain completeness note</label><input id="pnote" value={note} onChange={e => setNote(e.target.value)}/></div>
    <p className="field-help">There is no “verify all”. Publishing creates a new immutable version; earlier assessments keep the version they used.</p>
    <button className="button button-primary" disabled={reason.length < 10 || !evidence.trim()}>Publish version</button></form>;
}
