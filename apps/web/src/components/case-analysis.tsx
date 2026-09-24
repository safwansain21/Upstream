"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { READINESS_HELP } from "../lib/readiness";
import { Arrow } from "./brand";
import { TargetIcon } from "./icons";
import { NetworkDiagram, ReachLegend, REACH_WORDS, type NetworkReach } from "./network-diagram";
import { Term } from "./term";
import { CaseStatus, InlineError, LoadingState, OriginBadge } from "./ui";

type Network = { version: number; status: string; source: string; license: string; flow_regime: string; boundary_treatment: string;
  nodes: { id: string; code: string; kind: string; lon: number; lat: number }[];
  edges: { id: string; code: string; from_code: string; to_code: string; length_m: string }[];
  stations: { code: string; status: string; access_status: string }[] };
type Assessment = { id: string; revision: number; retained_length_m: string; created_at: string; publication: string; eligible: boolean;
  readiness_reasons: string[]; outside_domain_unresolved: boolean; model_conflict: boolean; computation_incomplete: boolean; assumptions: string[];
  retained_geometry_ids: string[]; classes: { id: string; signature: string[]; reach_ids: string[]; geometry_ids: string[]; length_m: string; status: string; reason: string }[];
  recommendations: { id: string; action_id: string; score_bound_m: string | null; score_status: string; rationale: string; retained_length_m: string; label: string }[];
  dependencies: { entity_type: string; entity_id: string; version: number; reason: string }[] };
type Readiness = { eligible: boolean; checks: { label: string; state: string; reasons: string[] }[] };
type Job = { id: string; state: string; progress_stage: string; elapsed_seconds: number; last_error: string | null };
type Reading = { id: string; station_code: string; mode: string; value: string; unit: string; temperature: string | null; measured_at: string; eligible: boolean; quality: string | null };

export const km = (m: string | number) => `${(Number(m) / 1000).toFixed(2)} km`;
const RANK: Record<string, number> = { queued: 0, running: 1, done: 2, failed: 2, cancelled: 2 };
const stationOf = (actionId: string) => actionId.replace("visit-", "");

/** Disjoint retained segments: connected components of retained edges; never visually or numerically joined. */
function segments(network: Network, retained: Set<string>) {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const kept = network.edges.filter(e => retained.has(e.id));
  kept.forEach(e => parent.set(find(e.from_code), find(e.to_code)));
  return new Set(kept.map(e => find(e.from_code))).size;
}

/**
 * Case overview analysis: the local network with retained and ruled-out stretches, what each stretch's status rests on,
 * the planner's next useful station, analysis controls and readiness. `glance` fills the left column; `highlight`
 * lets the evidence timeline point at the stretches a revision changed.
 */
export function CaseAnalysis({ org, caseId, canAnalyse, canReview, dataOrigin = "real", glance, highlight }: { org: string; caseId: string; canAnalyse: boolean; canReview: boolean; dataOrigin?: string; glance?: ReactNode; highlight?: Set<string> }) {
  const client = useQueryClient();
  const network = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Network | null>(`/orgs/${org}/cases/${caseId}/network`) });
  const assessment = useQuery({ queryKey: ["assessment", org, caseId], retry: false, enabled: canReview,
    queryFn: () => api<Assessment>(`/orgs/${org}/cases/${caseId}/assessment`).catch(e => { if ((e as ApiError).status === 404) return null; throw e; }) });
  const readiness = useQuery({ queryKey: ["readiness", org, caseId], enabled: canReview, queryFn: () => api<Readiness>(`/orgs/${org}/cases/${caseId}/readiness`) });
  const readings = useQuery({ queryKey: ["readings", org, caseId], enabled: canReview, queryFn: () => api<Reading[]>(`/orgs/${org}/cases/${caseId}/readings`) });
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [reach, setReach] = useState<string>();
  const previous = useRef<Assessment | null>(null);

  useEffect(() => { // M-10: announce the actual before/after length once, expansion and reduction alike
    const a = assessment.data;
    if (a && previous.current && previous.current.id !== a.id) setAnnouncement(`Assessment revision ${a.revision}: retained length ${km(previous.current.retained_length_m)} → ${km(a.retained_length_m)}.`);
    if (a) previous.current = a;
  }, [assessment.data]);

  useEffect(() => { // polling fallback for job status; the displayed result changes only when the complete server result exists
    if (!job || job.state === "done" || job.state === "failed" || job.state === "cancelled") return;
    const timer = setTimeout(async () => {
      try {
        const next = await api<Job>(`/orgs/${org}/analyses/${job.id}`);
        setJob(prev => prev?.id === next.id && RANK[prev.state] > RANK[next.state] ? prev : next); // H11: a late or repeated poll never moves a job backwards
        if (next.state === "done") { client.invalidateQueries({ queryKey: ["assessment", org, caseId] }); client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
      } catch (e) { setError((e as Error).message); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [job, org, caseId, client]);

  async function run() {
    setError("");
    try { setJob(await api<Job>(`/orgs/${org}/cases/${caseId}/analyses`, { method: "POST" })); }
    catch (e) { setError((e as Error).message); }
  }

  const net = network.data;
  const a = assessment.data;
  const retained = new Set(a?.eligible ? a.retained_geometry_ids : []);
  const edgeState = (id: string): NetworkReach["state"] => !a?.eligible ? "unreviewed" : retained.has(id) ? "candidate" : "excluded";
  const view = useMemo(() => {
    if (!net) return null;
    const lats = net.nodes.map(n => n.lat), lons = net.nodes.map(n => n.lon);
    const cos = Math.cos((Math.min(...lats) * Math.PI) / 180), span = Math.max((Math.max(...lons) - Math.min(...lons)) * cos, Math.max(...lats) - Math.min(...lats)) || 1;
    const stationCodes = new Set(net.stations.map(s => s.code));
    const stations = net.nodes.map(n => ({ id: n.code, x: ((n.lon - Math.min(...lons)) * cos / span) * 520, y: ((Math.max(...lats) - n.lat) / span) * 520,
      label: stationCodes.has(n.code) ? n.code : "", description: `${n.code} · ${n.kind}${stationCodes.has(n.code) ? ` · access ${net.stations.find(s => s.code === n.code)?.access_status}` : ""}` }));
    return { stations, reaches: net.edges.map(e => ({ id: e.id, label: `${e.code} (${km(e.length_m)})`, from: e.from_code, to: e.to_code, state: edgeState(e.id) })) };
  }, [net, a]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocker = readiness.data?.checks.find(c => c.state !== "ready");
  const next = a?.recommendations[0];
  const running = !!job && (job.state === "queued" || job.state === "running");
  const selectedEdge = net?.edges.find(e => e.id === reach);
  const selectedClass = selectedEdge ? a?.classes.find(c => c.geometry_ids.includes(selectedEdge.id)) : undefined;

  return <div className="case-overview">
    {glance ? <aside className="case-glance" aria-label="Investigation at a glance">{glance}</aside> : null}

    <section className="case-map surface" aria-labelledby="map-heading">
      <div className="panel-head"><h2 id="map-heading">Local network</h2>{net ? <span className="subtle small"><Term k="networkVersion">Network version</Term> {net.version} · {net.status}</span> : null}</div>
      {network.isPending ? <LoadingState/> : net && view ? <>
        <NetworkDiagram label={`Schematic of network version ${net.version}`} stations={view.stations} reaches={view.reaches} selectedReach={reach} onSelectReach={canReview && a ? setReach : undefined} highlight={highlight}
          annotation={next && a?.eligible ? { station: stationOf(next.action_id), text: "Next useful reading" } : undefined}/>
        <ReachLegend/>
        {selectedEdge ? <StretchDetail edge={selectedEdge} state={edgeState(selectedEdge.id)} cls={selectedClass} readings={readings.data ?? []} eligible={!!a?.eligible} onClose={() => setReach(undefined)}/>
          : canReview && a ? <p className="subtle small">Select a stretch to see what its status rests on.</p> : null}
        <p className="subtle small"><OriginBadge origin={dataOrigin}/> Schematic generated from network version {net.version} ({net.status}). Source: {net.source}. Licence: {net.license}. Not a satellite image.</p></>
        : <div className="map-empty"><h3>Map verification needed.</h3><p>No local network is recorded for this case. The report remains a useful coordination record; a coordinator or network verifier can start the local map.</p></div>}
    </section>

    <div className="case-side">
      {canReview && next && a ? <section className="next-step surface raised" aria-labelledby="next-heading">
        <div className="panel-head"><h2 id="next-heading"><TargetIcon/> Next useful step</h2></div>
        <p className="next-station">Measure at <strong>{stationOf(next.action_id)}</strong></p>
        <p className="lead">{next.score_bound_m === null ? `Not scored: ${next.rationale}` : Number(next.score_bound_m) >= Number(next.retained_length_m)
          ? <>No guaranteed narrowing under current bounds. No single reading can promise to shrink the area right now; this is still the most informative place to measure.</>
          : <>Whatever the reading shows, at most <span className="numeric">{km(next.score_bound_m)}</span> would stay under consideration, down from <span className="numeric">{km(next.retained_length_m)}</span>. No other station guarantees more.</>}</p>
        <p className="subtle small">{next.label}. A conservative bound from the planner: it can be beaten in practice, never made worse.</p>
        {canAnalyse ? <Link className="button button-primary button-block" href={`/app/${org}/investigations/${caseId}/tasks?from=${next.action_id}${next.score_bound_m ? `&bound=${next.score_bound_m}` : ""}`}>Propose as task <Arrow/></Link> : null}
        {a.recommendations.length > 1 ? <div className="alternatives"><h3>Other useful stations</h3><ol>{a.recommendations.slice(1, 4).map(r => <li key={r.id}><strong>{stationOf(r.action_id)}</strong> · {r.score_bound_m === null ? `not scored: ${r.rationale}` : Number(r.score_bound_m) >= Number(r.retained_length_m) ? "No guaranteed narrowing under current bounds" : `at most ${km(r.score_bound_m)} would remain`}</li>)}</ol></div> : null}
        <p className="subtle small">Proposals are not assignments. A coordinator reviews feasibility, access and qualification before assigning a task.</p>
      </section> : null}

      <section className="surface" aria-labelledby="area-heading" aria-busy={job ? job.state !== "done" && job.state !== "failed" : undefined}><h2 id="area-heading">Investigation area</h2>
        <p className="visually-hidden" aria-live="polite">{announcement}</p>
        {error ? <InlineError>{error}</InlineError> : null}
        {!canReview ? <p className="muted">Assessment details are shared with the review team. Your contribution receipt shows what your report changed.</p>
          : assessment.isPending ? <LoadingState/> : a?.eligible ? <>
            <p className="area-figure"><strong className="numeric">{km(a.retained_length_m)}</strong><span><Term k="retained">retained</Term>{a.outside_domain_unresolved ? " within the mapped domain; upstream extent unresolved" : " under stated assumptions"}</span></p>
            <p className="muted small">{net ? `${segments(net, retained)} separate retained segment(s) · ` : ""}{a.classes.filter(c => c.status === "compatible").length} compatible, {a.classes.filter(c => c.status === "unresolved").length} unresolved, {a.classes.filter(c => c.status === "incompatible").length} ruled out under current bounds</p>
            <p><CaseStatus tone={a.publication === "approved" ? "accepted" : "warning"}>{a.publication === "draft" ? "Draft · awaiting expert review" : a.publication}</CaseStatus> <span className="subtle small">Assessment {a.revision} · {new Date(a.created_at).toLocaleString()}</span></p>
            <p className="subtle small">Ruled-out stretches are incompatible under stated assumptions, not proven clean. Retained stretches are worth checking, not proven responsible.</p>
          </> : <>
            <p><strong>Investigation area not yet established.</strong></p>
            {a ? <p className="muted small">Assessment {a.revision} is mathematically inspectable but not eligible to rule anything out: {a.readiness_reasons.join("; ")}</p> : null}
            {blocker ? <p className="muted">Next prerequisite: <strong className="text-mist">{blocker.label}</strong>. {READINESS_HELP[blocker.label]?.role ?? ""}</p> : null}
          </>}
        {canAnalyse ? <div className="button-row">
          <button className="button button-outline" disabled={running} onClick={run}>{a ? "Recompute with current evidence" : "Run analysis"}</button>
          {job && running ? <button className="button button-quiet" onClick={() => api<Job>(`/orgs/${org}/analyses/${job.id}/cancel`, { method: "POST" }).then(setJob, e => setError((e as Error).message))}>Cancel analysis</button> : null}
          {job ? <p role="status" className="muted small job-status">{job.state === "done" ? "Analysis complete." : job.state === "cancelled" ? "Analysis cancelled. Earlier results are unchanged." : job.state === "failed" ? `Analysis failed: ${job.last_error}` : `${job.progress_stage} · ${job.elapsed_seconds}s elapsed${a ? " · showing previous assessment until the new one is complete" : ""}`}</p> : null}
        </div> : null}
      </section>

      {canReview && readiness.data ? <section className="surface" aria-labelledby="ready-heading"><h2 id="ready-heading">Readiness</h2>
        <p className="subtle small">Until every <Term k="readiness">readiness</Term> check passes, nothing is ruled out.</p>
        <ul className="readiness-list">{readiness.data.checks.map(c => { const help = READINESS_HELP[c.label]; return <li key={c.label} className={c.state === "ready" ? "is-ready" : c.state === "missing" ? "is-missing" : "is-pending"}>
          <span className="check-mark" aria-hidden="true"/><div><strong>{c.label}</strong>
            {c.state === "ready" ? <p>Ready</p> : c.state === "missing" ? <><p>{help ? `${help.missing} ${help.role}` : "Review needed."}</p>{c.reasons.length ? <p className="subtle small">{c.reasons.join("; ")}</p> : null}</> : <p>Checked once the earlier prerequisites are in place.</p>}</div></li>; })}</ul>
      </section> : null}
    </div>
  </div>;
}

/** What one stretch's status rests on, from the engine's class result and the accepted readings at the stations that class drains past. */
function StretchDetail({ edge, state, cls, readings, eligible, onClose }: { edge: Network["edges"][number]; state: NetworkReach["state"]; cls?: Assessment["classes"][number]; readings: Reading[]; eligible: boolean; onClose: () => void }) {
  const at = cls ? readings.filter(r => cls.signature.includes(r.station_code) && r.eligible && r.quality === "accepted") : [];
  const word = state ?? "unreviewed";
  return <div className={`stretch-detail ${word}`} role="region" aria-label={`Stretch ${edge.code}`} aria-live="polite">
    <div className="spread"><p><strong>Stretch {edge.code}</strong> · {km(edge.length_m)} · <span className="stretch-state">{REACH_WORDS[word]}</span></p><button type="button" className="button button-quiet" onClick={onClose}>Close</button></div>
    {!eligible ? <p className="muted small">This assessment is not eligible to rule anything out yet, so every stretch stays under consideration.</p>
      : cls ? <>
        <p className="muted">{word === "excluded" ? <>Ruled out: under the stated assumptions, no source on this stretch fits the accepted readings. </> : word === "candidate" ? <>Retained: a source here still fits every accepted reading, so it stays worth checking. </> : null}
          A source here would show up at {cls.signature.length ? <>station{cls.signature.length > 1 ? "s" : ""} <strong className="text-mist">{cls.signature.join(", ")}</strong></> : "no station yet"}.</p>
        <p className="subtle small">Engine: “{cls.reason}”</p>
        {at.length ? <table className="data-table compact"><caption className="visually-hidden">Accepted readings at the stations this stretch drains past</caption><thead><tr><th scope="col">Station</th><th scope="col">Reading</th><th scope="col">Measured</th></tr></thead>
          <tbody>{at.map(r => <tr key={r.id}><td>{r.station_code}</td><td className="numeric">{r.value} {r.unit}{r.mode === "meter_sc25" ? <> (<Term k="sc25">SC25</Term>)</> : ""}</td><td>{new Date(r.measured_at).toLocaleDateString()}</td></tr>)}</tbody></table>
          : <p className="subtle small">No accepted readings at those stations yet.</p>}
        <p className="subtle small">The engine reports which stretches fit, not which single reading excluded one; the readings above are the evidence it weighed.</p>
      </> : <p className="muted small">This stretch is not part of the assessed network version.</p>}
  </div>;
}
