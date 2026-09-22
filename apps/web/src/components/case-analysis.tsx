"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { NetworkDiagram, ReachLegend } from "./network-diagram";
import { CaseStatus, InlineError, LoadingState } from "./ui";

type Network = { version: number; status: string; source: string; license: string; flow_regime: string; boundary_treatment: string;
  nodes: { id: string; code: string; kind: string; lon: number; lat: number }[];
  edges: { id: string; code: string; from_code: string; to_code: string; length_m: string }[];
  stations: { code: string; status: string; access_status: string }[] };
type Assessment = { id: string; revision: number; retained_length_m: string; created_at: string; publication: string; eligible: boolean;
  readiness_reasons: string[]; outside_domain_unresolved: boolean; model_conflict: boolean; computation_incomplete: boolean; assumptions: string[];
  retained_geometry_ids: string[]; classes: { id: string; reach_ids: string[]; length_m: string; status: string; reason: string }[];
  recommendations: { id: string; action_id: string; score_bound_m: string | null; score_status: string; rationale: string; retained_length_m: string; label: string }[];
  dependencies: { entity_type: string; entity_id: string; version: number; reason: string }[] };
type Readiness = { eligible: boolean; checks: { label: string; state: string; reasons: string[] }[] };
type Job = { id: string; state: string; progress_stage: string; elapsed_seconds: number; last_error: string | null };

export const km = (m: string | number) => `${(Number(m) / 1000).toFixed(2)} km`;

/** Disjoint retained segments: connected components of retained edges; never visually or numerically joined. */
function segments(network: Network, retained: Set<string>) {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const kept = network.edges.filter(e => retained.has(e.id));
  kept.forEach(e => parent.set(find(e.from_code), find(e.to_code)));
  return new Set(kept.map(e => find(e.from_code))).size;
}

export function CaseAnalysis({ org, caseId, canAnalyse, canReview }: { org: string; caseId: string; canAnalyse: boolean; canReview: boolean }) {
  const client = useQueryClient();
  const network = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Network | null>(`/orgs/${org}/cases/${caseId}/network`) });
  const assessment = useQuery({ queryKey: ["assessment", org, caseId], retry: false, enabled: canReview,
    queryFn: () => api<Assessment>(`/orgs/${org}/cases/${caseId}/assessment`).catch(e => { if ((e as ApiError).status === 404) return null; throw e; }) });
  const readiness = useQuery({ queryKey: ["readiness", org, caseId], enabled: canReview, queryFn: () => api<Readiness>(`/orgs/${org}/cases/${caseId}/readiness`) });
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef<Assessment | null>(null);

  useEffect(() => { // M-10: announce the actual before/after length once, expansion and reduction alike
    const a = assessment.data;
    if (a && previous.current && previous.current.id !== a.id) setAnnouncement(`Assessment revision ${a.revision}: retained length ${km(previous.current.retained_length_m)} → ${km(a.retained_length_m)}.`);
    if (a) previous.current = a;
  }, [assessment.data]);

  useEffect(() => { // polling fallback for job status; the displayed result changes only when the complete server result exists
    if (!job || job.state === "done" || job.state === "failed") return;
    const timer = setTimeout(async () => {
      try {
        const next = await api<Job>(`/orgs/${org}/analyses/${job.id}`);
        setJob(next);
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
  const edgeState = (id: string) => !a?.eligible ? "unreviewed" as const : retained.has(id) ? "candidate" as const : "excluded" as const;
  let diagram = null;
  if (net) {
    const lats = net.nodes.map(n => n.lat), lons = net.nodes.map(n => n.lon);
    const cos = Math.cos((Math.min(...lats) * Math.PI) / 180), span = Math.max((Math.max(...lons) - Math.min(...lons)) * cos, Math.max(...lats) - Math.min(...lats)) || 1;
    const stationCodes = new Set(net.stations.map(s => s.code));
    const nodes = net.nodes.map(n => ({ id: n.code, x: ((n.lon - Math.min(...lons)) * cos / span) * 520, y: ((Math.max(...lats) - n.lat) / span) * 520,
      label: stationCodes.has(n.code) ? n.code : "", description: `${n.code} · ${n.kind}${stationCodes.has(n.code) ? ` · access ${net.stations.find(s => s.code === n.code)?.access_status}` : ""}` }));
    diagram = <NetworkDiagram label={`Schematic of network version ${net.version}`} stations={nodes}
      reaches={net.edges.map(e => ({ id: e.id, label: `${e.code} (${km(e.length_m)})`, from: e.from_code, to: e.to_code, state: edgeState(e.id) }))}/>;
  }
  const blocker = readiness.data?.checks.find(c => c.state !== "ready");

  return <div className="case-grid">
    <section className="surface stack" aria-labelledby="map-heading"><h2 id="map-heading">Local network</h2>
      {network.isPending ? <LoadingState/> : net ? <>{diagram}<ReachLegend/><p className="muted">Schematic generated from network version {net.version} ({net.status}). Source: {net.source}. Licence: {net.license}. Not a satellite image.</p></>
        : <p><strong>Map verification needed.</strong> No local network is recorded for this case. The report remains a useful coordination record.</p>}
    </section>

    <section className="surface stack" aria-labelledby="area-heading" aria-busy={job ? job.state !== "done" && job.state !== "failed" : undefined}><h2 id="area-heading">Investigation area</h2>
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
      {error ? <InlineError>{error}</InlineError> : null}
      {!canReview ? <p>Assessment details are shared with the review team. Your contribution receipt shows what your report changed.</p>
        : assessment.isPending ? <LoadingState/> : a?.eligible ? <>
          <p className="numeric"><strong>{km(a.retained_length_m)}</strong> under consideration{a.outside_domain_unresolved ? " within the mapped domain; upstream extent unresolved" : ""}</p>
          <p>{net ? `${segments(net, retained)} separate retained segment(s) · ` : ""}{a.classes.filter(c => c.status === "compatible").length} compatible, {a.classes.filter(c => c.status === "unresolved").length} unresolved, {a.classes.filter(c => c.status === "incompatible").length} excluded under current bounds</p>
          <p><CaseStatus tone={a.publication === "approved" ? "accepted" : "warning"}>{a.publication === "draft" ? "Draft · awaiting expert review" : a.publication}</CaseStatus> Assessment {a.revision} · {new Date(a.created_at).toLocaleString()}</p>
          <p className="muted">Excluded reaches are incompatible under stated assumptions, not proven clean. Retained reaches are worth considering, not proven responsible.</p>
        </> : <>
          <p><strong>Investigation area not yet established.</strong></p>
          {a ? <p className="muted">Assessment {a.revision} is mathematically inspectable but not eligible for localization: {a.readiness_reasons.join("; ")}</p> : null}
          {blocker ? <p>Next prerequisite: <strong>{blocker.label}</strong>{blocker.reasons.length ? ` (${blocker.reasons.join("; ")})` : ""}</p> : null}
        </>}
      {canAnalyse ? <div className="button-row">
        <button className="button button-outline" disabled={!!job && job.state !== "done" && job.state !== "failed"} onClick={run}>{a ? "Recompute with current evidence" : "Run analysis"}</button>
        {job ? <p role="status" className="muted">{job.state === "done" ? "Analysis complete." : job.state === "failed" ? `Analysis failed: ${job.last_error}` : `${job.progress_stage} · ${job.elapsed_seconds}s elapsed${a ? " · showing previous assessment until the new one is complete" : ""}`}</p> : null}
      </div> : null}
    </section>

    {canReview && a?.recommendations.length ? <section className="surface stack" aria-labelledby="next-heading"><h2 id="next-heading">Next useful observation</h2>
      <ol>{a.recommendations.slice(0, 3).map(r => <li key={r.id}><strong>{r.action_id.replace("visit-", "Measure at ")}</strong>{" · "}
        {r.score_bound_m === null ? `Not scored: ${r.rationale}` : Number(r.score_bound_m) >= Number(r.retained_length_m) ? `No guaranteed narrowing under current bounds (${r.label.toLowerCase()} ${km(r.score_bound_m)})` : `${r.label}: at most ${km(r.score_bound_m)} would remain`}</li>)}</ol>
      <p className="muted">Proposals are not assignments. A coordinator reviews feasibility, access and qualification before assigning a task.</p>
    </section> : null}

    {canReview && readiness.data ? <section className="surface stack" aria-labelledby="ready-heading"><h2 id="ready-heading">Readiness</h2>
      <ul className="readiness-list">{readiness.data.checks.map(c => <li key={c.label}><span className={c.state === "ready" ? "check-ready" : "check-missing"} aria-hidden="true">{c.state === "ready" ? "✓" : c.state === "missing" ? "!" : "○"}</span><div><strong>{c.label}</strong><p>{c.state === "ready" ? "Ready" : c.state === "missing" ? c.reasons.join("; ") : "Not evaluated until earlier prerequisites exist"}</p></div></li>)}</ul>
    </section> : null}
  </div>;
}
