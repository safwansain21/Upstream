"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { NetworkDiagram } from "../../../../../../components/network-diagram";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { schematic } from "../../../../../../lib/geo";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { Term } from "../../../../../../components/term";
import { useOrg } from "../../../../../../lib/session";

type VersionRow = { id: string; version: number; status: string; source: string; license: string; published_at: string | null; review_reason: string | null; current: boolean };
type Version = { id: string; case_id: string; version: number; status: string; source: string; license: string; boundary_treatment: string; review_reason: string | null;
  evidence_refs: string[]; import_warnings: string[]; validation: string[];
  diff: { added: string[]; removed: string[]; direction_changed: string[]; status_changed: string[]; length_before_m: string; length_after_m: string } | null;
  nodes: { code: string; kind: string; lon: number; lat: number }[];
  edges: { id: string; code: string; from_code: string; to_code: string; length_m: string; flow_status: string; connectivity: string; culvert: boolean }[];
  stations: { id: string; code: string; status: string; access_status: string; lon: number; lat: number }[] };

const FLOW: Record<string, string> = { verified: "Downstream, verified", unknown: "Not yet checked", reverse: "Reversed, awaiting check" };
const LINK: Record<string, string> = { verified: "Connected, verified", mapped_unverified: "Mapped, unchecked" };
const km = (m: string | number) => (Number(m) / 1000).toFixed(2);
type ReviewTab = "summary" | "linework" | "connectivity" | "evidence";
const TABS: [ReviewTab, string][] = [["summary", "Summary"], ["linework", "Linework"], ["connectivity", "Connectivity"], ["evidence", "Evidence"]];

export default function MapSetup() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const client = useQueryClient();
  const versions = useQuery({ queryKey: ["network-versions", org, caseId], queryFn: () => api<VersionRow[]>(`/orgs/${org}/cases/${caseId}/network/versions`) });
  const draftRow = versions.data?.find(v => v.status === "proposed");
  const shown = draftRow ?? versions.data?.find(v => v.current);
  const detail = useQuery({ queryKey: ["network-version", org, shown?.id], enabled: !!shown, queryFn: () => api<Version>(`/orgs/${org}/networks/${shown!.id}`) });
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const [tab, setTab] = useState<ReviewTab>("summary");
  const refresh = () => { client.invalidateQueries({ queryKey: ["network-versions", org, caseId] }); client.invalidateQueries({ queryKey: ["network-version", org] }); client.invalidateQueries({ queryKey: ["network", org, caseId] }); };
  async function call(path: string, method: string, json?: unknown, done = "Saved.") {
    setError(""); setStatus("");
    try { await api(path, { method, json }); setStatus(done); refresh(); } catch (e) { setError((e as Error).message); }
  }
  const editor = can("coordinate") || can("network_verify");
  const v = detail.data; const draft = v?.status === "proposed";
  const reviewed = (e: Version["edges"][number]) => e.connectivity === "verified" && e.flow_status === "verified";
  const view = v ? schematic(v.nodes, v.edges, new Set(v.stations.map(s => s.code)), e => (v.edges.find(x => x.id === e.id) && reviewed(v.edges.find(x => x.id === e.id)!) ? "candidate" : "unreviewed")) : null;
  const verifiedEdges = v?.edges.filter(reviewed).length ?? 0;
  const approvedStations = v?.stations.filter(s => s.status === "approved").length ?? 0;
  const openEdges = (v?.edges.length ?? 0) - verifiedEdges, openStations = (v?.stations.length ?? 0) - approvedStations;
  const ready = !!v && !draft && v.edges.length > 0 && v.stations.length > 0 && v.validation.length === 0 && openEdges === 0 && openStations === 0;
  // what is missing, and who fixes it (readiness items name the role)
  const analysisGap = !v ? "" : draft ? "Publish this draft. A network reviewer publishes it after checking." : !v.edges.length ? "Map at least one reach. A coordinator imports or draws linework."
    : !v.stations.length ? "Place a station on a reach. A coordinator places it; a network reviewer approves it." : v.validation.length ? `${v.validation.length} ${v.validation.length === 1 ? "check needs" : "checks need"} attention in the review panel.`
    : openEdges || openStations ? "Finish the connection and station reviews. A network reviewer does this." : "Version is published and every check is clear.";
  const tabKeys = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([id]) => id === tab), next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return; e.preventDefault(); const [id] = TABS[(next + TABS.length) % TABS.length]; setTab(id);
    (e.currentTarget.querySelector(`#map-tab-${id}`) as HTMLButtonElement | null)?.focus();
  };

  return <main id="main-content" className="page-shell case-page">
    <CaseHeader caseId={caseId} current="map-setup"/>
    <PageIntro title="Local map and readiness"><p>Explore the stream network, review how each <Term k="reach">reach</Term> connects, and check <Term k="readiness">readiness</Term> for analysis.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}{status ? <p className="notice" role="status">{status}</p> : null}
    {versions.error ? <InlineError>{versions.error.message} <button type="button" className="button button-quiet" onClick={() => versions.refetch()}>Retry</button></InlineError> : !versions.data ? <LoadingState label="Loading the local network…"/>
    : !versions.data.length ? <EmptyState title="No local network yet" steps={editor ? ["Import linework as GeoJSON below, or draw it in a GIS tool and import it.", "Place stations on the reaches, then review each connection before publishing."]
        : ["A coordinator imports the stream linework; a network reviewer checks and publishes it.", "Until then this case stays a useful record of what people noticed, and nothing is ruled out."]}>
        <p>Map verification comes before any stretch can be ruled out.</p>
        {editor ? <StartDraft org={org} caseId={caseId} canCopy={false} onDone={() => { setStatus("Draft created."); refresh(); }} onError={setError}/> : null}</EmptyState>
    : <>
      {shown && !v ? (detail.error ? <InlineError>{detail.error.message} <button type="button" className="button button-quiet" onClick={() => detail.refetch()}>Retry</button></InlineError> : <LoadingState label="Loading the network version…"/>) : null}
      {v ? <>
        <section className="map-readiness-strip" aria-label="Network readiness">
          <div className={draft ? "is-missing" : "is-ready"}><span className="check-mark" aria-hidden="true"/><p><strong>{draft ? `Draft network v${v.version}` : `Published network v${v.version}`}</strong><span>{v.source} · {v.license}</span></p></div>
          <div className={openEdges ? "is-missing" : "is-ready"}><span className="check-mark" aria-hidden="true"/><p><strong>{openEdges ? `${openEdges} of ${v.edges.length} connections to review` : "Direction reviewed"}</strong><span>{openEdges ? "A network reviewer confirms direction and connection" : `All ${v.edges.length} reaches checked`}</span></p></div>
          <div className={openStations || !v.stations.length ? "is-missing" : "is-ready"}><span className="check-mark" aria-hidden="true"/><p><strong>{v.stations.length ? (openStations ? `${openStations} of ${v.stations.length} stations to approve` : "Stations verified") : "No stations yet"}</strong><span>{v.stations.length ? (openStations ? "A network reviewer approves each position" : `${approvedStations} of ${v.stations.length} stations`) : "A coordinator places the first station"}</span></p></div>
          <div className={ready ? "is-ready" : "is-missing needs-review"}><span className="check-mark" aria-hidden="true"/><p><strong>{ready ? "Ready for analysis" : "Analysis not ready"}</strong><span>{analysisGap}</span></p></div>
          <a className="button button-outline button-small" href="#review-heading">View checklist <span aria-hidden="true">→</span></a>
        </section>
        <div className="map-review-layout">
          <section className="surface map-network-panel" aria-labelledby="draft-heading"><div className="map-panel-head"><div><span className="eyebrow">{draft ? "Proposed linework" : "Reviewed linework"}</span><h2 id="draft-heading">{draft ? `Draft version ${v.version}` : `Published version ${v.version}`}</h2></div><span className="badge">{draft ? "Draft · not used for analysis" : "Published"}</span></div>
            <div className="map-canvas">
              {view && view.stations.length ? <NetworkDiagram mode="network" label={`Schematic of network version ${v.version}`} stations={view.stations} reaches={view.reaches}/> : <EmptyState title="No geometry in this version">{editor && draft ? <p>Import linework to give this draft its reaches.</p> : null}</EmptyState>}
              <ul className="map-network-legend" aria-label="Map key"><li><span className="legend-reach candidate"/>Direction and connection verified</li><li><span className="legend-reach unreviewed"/>Review needed</li><li><span className="legend-station"/>Station</li></ul>
            </div>
          </section>
          <aside className="surface map-review-panel" aria-labelledby="review-heading"><h2 id="review-heading">Review the network</h2><p>Imported or drawn linework stays a proposal until its connections, stations and assumptions are checked and a <Term k="networkVersion">network version</Term> is published.</p>
            <div className="tab-nav map-review-tabs" role="tablist" aria-label="Review views" onKeyDown={tabKeys}>{TABS.map(([id, label]) =>
              <button key={id} id={`map-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="map-tab-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}</div>
            <div id="map-tab-panel" role="tabpanel" aria-labelledby={`map-tab-${tab}`} className="map-tab-panel" key={tab}>
              {tab === "summary" ? <>
                <ul className="map-version-list" aria-label="Network versions">{versions.data.map(r => <li key={r.id}><span className={`version-line ${r.status === "proposed" ? "proposed" : "reviewed"}`} aria-hidden="true"/>
                  <div><strong>{r.status === "proposed" ? `Proposed linework (v${r.version})` : `Version ${r.version}`}</strong><span>{r.status === "proposed" ? "Draft" : r.status}{r.current ? " · current" : ""}</span></div>
                  <div className="version-meta"><span>{r.source}</span><span>{r.license}{r.published_at ? ` · published ${new Date(r.published_at).toLocaleDateString()}` : ""}</span></div></li>)}</ul>
                {v.validation.length || openEdges ? <div className="callout caution"><span className="check-mark" aria-hidden="true"/><div><strong>{v.validation.length ? "Checks need attention" : `${openEdges} ${openEdges === 1 ? "connection needs" : "connections need"} review`}</strong>
                  {v.validation.length ? <ul>{v.validation.map(r => <li key={r}>{r}</li>)}</ul> : <p>A network reviewer confirms each direction and connection in the reaches table.</p>}
                  <a href="#reaches-heading">Go to reaches <span aria-hidden="true">→</span></a></div></div>
                  : <p className="map-review-clear">No topology or review blockers recorded.</p>}
                {v.import_warnings.length ? <div className="map-review-group"><h3>Import warnings</h3><ul>{v.import_warnings.map(w => <li key={w}>{w}</li>)}</ul></div> : null}
                {v.diff ? <div className="map-review-group"><h3>Changes from the current version</h3><p>{v.diff.added.length} added · {v.diff.removed.length} removed · {v.diff.direction_changed.length} direction changes · {v.diff.status_changed.length} status changes. Channel length {km(v.diff.length_before_m)} → {km(v.diff.length_after_m)} km.</p></div> : null}
              </> : tab === "linework" ? <dl className="map-facts">
                <div><dt>Reaches</dt><dd>{v.edges.length} · {km(v.edges.reduce((s, e) => s + Number(e.length_m), 0))} km</dd></div>
                <div><dt>Junctions and ends</dt><dd>{v.nodes.length}</dd></div>
                <div><dt>Culverts or unknown links</dt><dd>{v.edges.filter(e => e.culvert).length}</dd></div>
                <div><dt>Source</dt><dd>{v.source} ({v.license})</dd></div>
                <div><dt>Import warnings</dt><dd>{v.import_warnings.length ? v.import_warnings.join(" · ") : "None"}</dd></div></dl>
              : tab === "connectivity" ? <dl className="map-facts">
                <div><dt>Direction verified</dt><dd>{v.edges.filter(e => e.flow_status === "verified").length} of {v.edges.length}</dd></div>
                <div><dt>Connection verified</dt><dd>{v.edges.filter(e => e.connectivity === "verified").length} of {v.edges.length}</dd></div>
                <div><dt>Upstream boundary</dt><dd>{v.boundary_treatment || "Not recorded"}</dd></div>
                <div><dt>Topology checks</dt><dd>{v.validation.length ? v.validation.join(" · ") : "Clear"}</dd></div></dl>
              : <dl className="map-facts">
                <div><dt>Evidence references</dt><dd>{v.evidence_refs.length ? v.evidence_refs.join(", ") : "None recorded yet"}</dd></div>
                <div><dt>Review reason</dt><dd>{v.review_reason || "Recorded when the version is published"}</dd></div></dl>}
            </div>
            <p className="map-review-note">A verified network shows reviewed geometry. It does not show that the water is fine, or where a change comes from.</p>
          </aside>
        </div>
        <section className="surface stack map-table-panel" aria-labelledby="reaches-heading"><div className="map-panel-head"><h2 id="reaches-heading">Reaches ({v.edges.length})</h2></div>
          {v.edges.length ? <div className="table-scroll" role="region" aria-label="Reaches" tabIndex={0}><table className="data-table compact"><thead><tr><th scope="col">Reach</th><th scope="col">Flows to</th><th scope="col" className="numeric">Length (km)</th><th scope="col">Direction</th><th scope="col">Connection</th><th scope="col">Review status</th>{draft && editor ? <th scope="col">Review actions</th> : null}</tr></thead>
            <tbody>{v.edges.map(e => <tr key={e.id}><td>{e.code}{e.culvert ? " · culvert" : ""}</td><td><span aria-hidden="true">→ </span>{e.to_code}</td><td className="numeric">{km(e.length_m)}</td><td>{FLOW[e.flow_status] ?? e.flow_status}</td><td>{LINK[e.connectivity] ?? e.connectivity}</td>
              <td className={reviewed(e) ? "is-ready" : "is-missing"}><span className="review-state"><span className="check-mark" aria-hidden="true"/>{reviewed(e) ? "Reviewed" : "Needs review"}</span></td>
              {draft && editor ? <td><div className="row-actions">
                <button className="button button-quiet button-small" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { flow_status: "verified" })}>Direction verified</button>
                <button className="button button-quiet button-small" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { flow_status: "reverse" })}>Reverse</button>
                <button className="button button-quiet button-small" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { connectivity: "verified" })}>Connection verified</button>
                <button className="button button-quiet button-small" onClick={() => call(`/orgs/${org}/networks/${v.id}/edges/${e.id}`, "PATCH", { culvert: true })}>Flag culvert / unknown link</button></div></td> : null}</tr>)}</tbody></table></div>
            : <p className="muted">No reaches in this version yet.</p>}
        </section>
        <section className="surface stack map-table-panel" aria-labelledby="stations-heading"><h2 id="stations-heading">Stations ({v.stations.length})</h2>
          {v.stations.length ? <div className="table-scroll" role="region" aria-label="Stations" tabIndex={0}><table className="data-table compact"><thead><tr><th scope="col">Station</th><th scope="col">Position</th><th scope="col">Access</th><th scope="col">Review status</th></tr></thead>
            <tbody>{v.stations.map(s => <tr key={s.id}><td>{s.code}</td><td className="tabular">{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</td><td>{s.access_status}</td>
              <td className={s.status === "approved" ? "is-ready" : "is-missing"}><span className="review-state"><span className="check-mark" aria-hidden="true"/>{s.status === "approved" ? "Position approved" : s.status}</span>
                {draft && editor && s.status !== "approved" ? <> <button className="button button-quiet button-small" onClick={() => call(`/orgs/${org}/networks/${v.id}/stations/${s.id}/approve`, "POST", undefined, `Station ${s.code} approved.`)}>Approve position</button></> : null}</td></tr>)}</tbody></table></div>
            : <p className="muted">No stations yet. {editor ? "Place one on a mapped reach below." : "A coordinator places them; a network reviewer approves each position."}</p>}
          {draft && editor ? <AddStation org={org} nid={v.id} onDone={() => { setStatus("Station placed."); refresh(); }} onError={setError}/> : null}
        </section>
        {draft && can("network_verify") ? <PublishForm org={org} nid={v.id} onDone={() => { setStatus("Published. Earlier assessments keep the version they used."); refresh(); }} onError={setError}/> : draft ? <p className="muted">Publishing needs a network reviewer. A coordinator can prepare the draft; a network reviewer checks and publishes it.</p> : null}
        {editor && !draftRow ? <section className="surface stack" aria-labelledby="new-version-heading"><h2 id="new-version-heading">Propose a new version</h2><p className="muted">Changes are made on a draft. The published version stays in use until the draft is checked and published.</p>
          <StartDraft org={org} caseId={caseId} canCopy={versions.data.some(r => r.current)} onDone={() => { setStatus("Draft created."); refresh(); }} onError={setError}/></section> : null}
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
  return <div className="stack map-draft"><h3>Start a draft</h3>
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
