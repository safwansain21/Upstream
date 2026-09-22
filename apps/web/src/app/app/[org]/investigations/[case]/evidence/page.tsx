"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { NetworkDiagram, ReachLegend } from "../../../../../../components/network-diagram";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { schematic } from "../../../../../../lib/geo";
import { CaseTabs } from "../../../../../../components/case-tabs";
import { useOrg } from "../../../../../../lib/session";

type Hist = { id: string; revision: number; retained_length_m: string | null; created_at: string; eligible: boolean; current: boolean; publications: { status: string; reason: string; at: string }[] };
type Assessment = { id: string; revision: number; retained_length_m: string; eligible: boolean; publication: string; created_at: string; snapshot_hash: string; readiness_reasons: string[];
  retained_geometry_ids: string[]; classes: { id: string; reach_ids: string[]; length_m: string; status: string; reason: string }[];
  dependencies: { entity_type: string; entity_id: string; version: number; reason: string }[] };
type Net = { id: string; nodes: { code: string; kind: string; lon: number; lat: number }[]; edges: { id: string; code: string; from_code: string; to_code: string; length_m: string }[]; stations: { code: string }[] } | null;
type Reading = { id: string; station_code: string; instrument_serial: string; mode: string; value: string; unit: string; measured_at: string; quality: string | null; quality_reason: string | null; eligible: boolean };
const km = (m: string | number | null) => m === null ? "—" : `${(Number(m) / 1000).toFixed(2)} km`;
const last = (h: Hist) => h.publications[h.publications.length - 1]?.status ?? "draft";

function Panel({ title, a, net }: { title: string; a: Assessment; net: Net }) {
  const networkId = a.dependencies.find(d => d.entity_type === "network_version")?.entity_id;
  const sameTopology = net && networkId === net.id;
  const kept = new Set(a.retained_geometry_ids);
  const view = net && sameTopology ? schematic(net.nodes, net.edges, new Set(net.stations.map(s => s.code)), e => !a.eligible ? "unreviewed" : kept.has(e.id) ? "candidate" : "excluded") : null;
  return <section className="surface stack" aria-label={title}><h3>{title}</h3>
    <p className="numeric"><strong>{a.eligible ? km(a.retained_length_m) : "Not eligible for localization"}</strong> · {a.publication}</p>
    {view ? <NetworkDiagram compact label={`${title} schematic`} stations={view.stations} reaches={view.reaches}/> : <p className="muted">This assessment used a different network version; the map is not shown side by side because lengths may not be like-for-like.</p>}
    <ul>{a.classes.map(c => <li key={c.id}>{c.reach_ids.join(", ")} · {km(c.length_m)} · {c.status === "incompatible" ? "excluded under current bounds" : c.status}</li>)}</ul></section>;
}

export default function EvidenceReview() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>(); const client = useQueryClient();
  const hist = useQuery({ queryKey: ["assessments", org, caseId], queryFn: () => api<Hist[]>(`/orgs/${org}/cases/${caseId}/assessments`) });
  const latestRev = hist.data?.[0]?.revision; const approvedRev = hist.data?.find(h => h.current)?.revision;
  const byRev = (rev?: number) => ({ queryKey: ["assessment", org, caseId, rev], enabled: rev !== undefined, queryFn: () => api<Assessment>(`/orgs/${org}/cases/${caseId}/assessment?revision=${rev}`) });
  const latest = useQuery(byRev(latestRev)); const approved = useQuery(byRev(approvedRev !== latestRev ? approvedRev : undefined));
  const net = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Net>(`/orgs/${org}/cases/${caseId}/network`) });
  const readings = useQuery({ queryKey: ["readings", org, caseId], queryFn: () => api<Reading[]>(`/orgs/${org}/cases/${caseId}/readings`) });
  const caseQ = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<{ title: string; version: number; review_hold: boolean; workflow: string }>(`/orgs/${org}/cases/${caseId}`) });
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const [decision, setDecision] = useState("inspection_recommended"); const [segments, setSegments] = useState<string[]>([]);
  const refresh = () => ["assessments", "assessment", "case", "readings", "review-queue"].forEach(k => client.invalidateQueries({ queryKey: [k] }));
  async function act(path: string, json: unknown, done: string) {
    setError(""); setStatus("");
    try { await api(path, { method: "POST", json }); setStatus(done); setReason(""); refresh(); }
    catch (e) { setError((e as Error).message); refresh(); } // rationale text is preserved on failure
  }
  async function recompute() {
    setError("");
    try { await api(`/orgs/${org}/cases/${caseId}/analyses`, { method: "POST" }); setStatus("Recomputation requested. The new draft appears here when the complete result exists."); setTimeout(refresh, 3000); }
    catch (e) { setError((e as Error).message); }
  }

  const failure = hist.error ?? caseQ.error;
  if (failure) return <main id="main-content" className="page-shell">{(failure as { status?: number }).status === 404 || (failure as { status?: number }).status === 403
    ? <EmptyState title="Evidence is not available to you" action={<Link className="button button-outline" href={`/app/${org}/investigations`}>All investigations</Link>}><p>This investigation may not exist, or its evidence is limited to the review team.</p></EmptyState>
    : <InlineError>{failure.message}</InlineError>}</main>;
  if (!hist.data || !caseQ.data) return <main id="main-content" className="page-shell"><LoadingState/></main>;
  const L = latest.data; const A = approved.data;
  const latestHist = hist.data[0];
  const delta = L && A && L.eligible && A.eligible ? Number(L.retained_length_m) - Number(A.retained_length_m) : null;
  const changed = L && A ? L.classes.filter(c => A.classes.find(x => x.id === c.id)?.status !== c.status) : [];
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>{caseQ.data.title}</Link> / <span aria-current="page">Evidence</span></nav>
    <CaseTabs caseId={caseId} current="evidence"/>
    <PageIntro title={latestHist && last(latestHist) === "draft" && A ? "A revision worth reviewing" : "Evidence and assessments"}>
      <p><CaseStatus>Cause unconfirmed</CaseStatus> {caseQ.data.review_hold ? <CaseStatus tone="warning">Review required</CaseStatus> : null}</p></PageIntro>
    {error ? <InlineError>{error}{/Evidence or assumptions changed/.test(error) ? <> <button className="button button-quiet" onClick={recompute}>Recompute with current evidence</button></> : null}</InlineError> : null}
    {status ? <p className="notice" role="status">{status}</p> : null}
    {!hist.data.length ? <EmptyState title="No assessments yet"><p>Run an analysis from the investigation overview once readiness allows it.</p></EmptyState> : <>
      <div className="case-grid">
        {A ? <Panel title={`Previous approved assessment · ${A.revision}`} a={A} net={net.data ?? null}/> : null}
        {L ? <Panel title={`${last(latestHist) === "draft" ? "Draft revision" : "Assessment"} · ${L.revision}`} a={L} net={net.data ?? null}/> : <LoadingState/>}
      </div>
      {A && L ? <section className="surface stack" aria-labelledby="changed-heading"><h2 id="changed-heading">What changed?</h2>
        <p role="status">{delta === null ? "Retained lengths are not comparable (eligibility differs)." : delta > 0 ? `Candidate area expanded by ${km(delta)}.` : delta < 0 ? `Candidate area reduced by ${km(-delta)}.` : "Retained length unchanged."}</p>
        {changed.length ? <ul>{changed.map(c => <li key={c.id}>{c.reach_ids.join(", ")}: {A.classes.find(x => x.id === c.id)?.status ?? "absent"} → {c.status}</li>)}</ul> : null}
        {readings.data?.filter(r => r.quality === "excluded" || r.quality === "suspect").map(r => <p key={r.id}>{r.station_code} reading {r.quality}: {r.quality_reason}</p>)}
      </section> : null}
      <section className="surface stack" aria-labelledby="evidence-heading"><h2 id="evidence-heading">Evidence considered</h2>
        {readings.error ? <InlineError>{readings.error.message}</InlineError> : !readings.data ? <LoadingState/> : !readings.data.length ? <p>No readings recorded.</p> :
          <div className="table-scroll" role="region" aria-label="Readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Station</th><th scope="col">Instrument</th><th scope="col">Value</th><th scope="col">Measured</th><th scope="col">Status</th></tr></thead>
            <tbody>{readings.data.map(r => <tr key={r.id}><td>{r.station_code}</td><td className="mono">{r.instrument_serial}</td><td className="numeric">{r.mode === "true_sc25_enclosure" ? "reviewed enclosure" : `${r.value} ${r.unit}`}</td><td>{new Date(r.measured_at).toLocaleString()}</td>
              <td><CaseStatus tone={r.quality === "accepted" ? "accepted" : r.quality ? "warning" : "neutral"}>{r.quality ?? "pending review"}</CaseStatus></td></tr>)}</tbody></table></div>}
      </section>
      <section className="surface stack" aria-labelledby="audit-heading"><h2 id="audit-heading">Revision audit</h2>
        <ol>{hist.data.map(h => <li key={h.id}>Assessment {h.revision} · {km(h.retained_length_m)} · {h.publications.map(p => p.status).join(" → ")}{h.current ? " · current approved" : ""}</li>)}</ol></section>
      {can("expert") && L ? <section className="surface stack" aria-labelledby="decide-heading"><h2 id="decide-heading">Review decision</h2>
        <div className="form-field"><label htmlFor="rationale">Rationale (required)</label><textarea id="rationale" rows={3} value={reason} onChange={e => setReason(e.target.value)}/></div>
        {last(latestHist) === "draft" ? <div className="button-row">
          <button className="button button-primary" disabled={reason.length < 10} onClick={() => act(`/orgs/${org}/assessments/${L.id}/approve`, { reason }, `Assessment ${L.revision} approved. Sending to recipients is a separate step.`)}>Approve revision</button>
          <button className="button button-outline" disabled={reason.length < 10} onClick={() => act(`/orgs/${org}/assessments/${L.id}/review`, { action: "more_evidence", reason }, "More evidence requested.")}>Request more evidence</button>
          <button className="button button-quiet" disabled={reason.length < 10} onClick={() => act(`/orgs/${org}/assessments/${L.id}/review`, { action: "reject", reason }, "Draft rejected.")}>Reject draft</button></div>
          : <p className="muted">The latest assessment is {last(latestHist)}. Recompute to create a new draft after evidence changes.</p>}
        <p className="field-help">Approval rechecks that no evidence, network or assumption changed since the draft was computed. Approval publishes internally; it does not send anything.</p>
        <fieldset><legend>Case decision (separate from localization)</legend>
          <div className="form-field"><label htmlFor="decision">Decision</label><select id="decision" value={decision} onChange={e => setDecision(e.target.value)}>
            <option value="inspection_recommended">Recommend inspection of named segments</option><option value="escalated">Escalate</option>
            <option value="closed_no_anomaly">Close: no anomaly under the investigated evidence and time</option><option value="closed_insufficient">Close: insufficient evidence</option></select></div>
          {decision === "inspection_recommended" ? L.classes.filter(c => c.status !== "incompatible").map(c => <label key={c.id} className="checkbox-field"><input type="checkbox" checked={segments.includes(c.id)}
            onChange={e => setSegments(s => e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id))}/><span>{c.reach_ids.join(", ")} ({km(c.length_m)})</span></label>) : null}
          <button className="button button-outline" disabled={reason.length < 10} onClick={() => act(`/orgs/${org}/cases/${caseId}/decisions`, { expected_version: caseQ.data!.version, action: decision, reason, assessment_id: L.id, segments }, "Decision recorded.")}>Record decision</button>
          <p className="field-help">Closing without an anomaly is a bounded conclusion about the investigated evidence and time, not a water safety certification.</p></fieldset>
      </section> : null}
    </>}
  </main>;
}
