"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { AlertIcon, BinocularsIcon, LayersIcon, LockIcon } from "../../../../../../components/icons";
import { NetworkDiagram, ReachLegend } from "../../../../../../components/network-diagram";
import { Term } from "../../../../../../components/term";
import { EmptyState, InlineError, LoadingState, PageIntro, PageState } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { schematic } from "../../../../../../lib/geo";
import { WORKFLOW } from "../../../../../../lib/labels";
import { useOrg } from "../../../../../../lib/session";

type Case = { title: string; version: number; workflow: string; current_assessment_id: string | null; reports: unknown[] };
type Assessment = { id: string; revision: number; retained_length_m: string; eligible: boolean; retained_geometry_ids: string[]; assumptions: string[]; classes: { id: string; reach_ids: string[]; length_m: string; status: string }[] };
type Net = { nodes: { code: string; kind: string; lon: number; lat: number }[]; edges: { id: string; code: string; from_code: string; to_code: string; length_m: string }[]; stations: { code: string }[] } | null;
type Cite = { kind: string; source: string; data_origin: string };
type Context = { layers: (Cite & { id: string; license: string; sensitive: boolean })[]; attention: { level: "elevated" | "routine"; because: Cite[] };
  suggestions: { recipient_id: string; name: string; because: Cite[] }[]; statement: string };
const LAYER: Record<string, string> = { public_access: "Public access", animal_access: "Animal access", habitat: "Habitat" };
const cite = (c: Cite) => `${LAYER[c.kind] ?? c.kind} (source: ${c.source}${c.data_origin === "synthetic" ? ", synthetic" : ""})`;
const km = (m: string) => `${(Number(m) / 1000).toFixed(2)} km`;
const ACTIONS: [string, string, string][] = [
  ["inspection_recommended", "Recommend inspection", "Request a field inspection of named segments."],
  ["escalated", "Escalate", "Pass to a regulatory or community organization."],
  ["closed_no_anomaly", "Close: no anomaly", "Under the investigated evidence and time. Not a water safety certification."],
  ["closed_insufficient", "Close: insufficient evidence", "Not enough information to continue at this time."],
  ["triage", "Return to triage", "Send back for coordination."],
];

export default function Decision() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>(); const client = useQueryClient();
  const c = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<Case>(`/orgs/${org}/cases/${caseId}`) });
  const a = useQuery({ queryKey: ["assessment", org, caseId, "latest"], queryFn: () => api<Assessment>(`/orgs/${org}/cases/${caseId}/assessment`).catch(() => null) });
  const net = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Net>(`/orgs/${org}/cases/${caseId}/network`) });
  const ctx = useQuery({ queryKey: ["context", org, caseId], queryFn: () => api<Context>(`/orgs/${org}/cases/${caseId}/context`) });
  const [action, setAction] = useState("inspection_recommended"); const [reason, setReason] = useState(""); const [segments, setSegments] = useState<string[]>([]);
  const [error, setError] = useState(""); const [done, setDone] = useState("");
  async function decide(e: React.FormEvent) {
    e.preventDefault(); setError(""); setDone("");
    try { await api(`/orgs/${org}/cases/${caseId}/decisions`, { method: "POST", json: { expected_version: c.data!.version, action, reason, assessment_id: a.data?.id ?? null, segments } });
      setDone("Decision recorded in the case history."); setReason(""); client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
    catch (err) { setError((err as Error).message); client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
  }
  if (c.error) return <PageState title="Decision" error={c.error} retry={() => c.refetch()}/>;
  if (!c.data) return <PageState title="Decision"/>;
  const retained = a.data?.classes.filter(x => x.status !== "incompatible") ?? [];
  const kept = new Set(a.data?.eligible ? a.data.retained_geometry_ids : []);
  const view = net.data ? schematic(net.data.nodes, net.data.edges, new Set(net.data.stations.map(s => s.code)), x => !a.data?.eligible ? "unreviewed" : kept.has(x.id) ? "candidate" : "excluded") : null;
  return <main id="main-content" className="page-shell case-page">
    <CaseHeader caseId={caseId} current="decision"/>
    <PageIntro title="Decision and context"><p>Current workflow: {WORKFLOW[c.data.workflow] ?? c.data.workflow}. A decision is conditional on its evidence and assumptions, never a verdict on the water.</p></PageIntro>
    <div className="decision-grid">
      <section className="surface" aria-labelledby="current-heading"><h2 id="current-heading">Current assessment</h2>
        {a.data ? <p className="lead">{a.data.eligible ? <>Candidate area <Term k="retained">retained</Term> under stated assumptions: <span className="numeric">{km(a.data.retained_length_m)}</span>.</> : "Not yet eligible to rule anything out."}</p> : <p className="lead">No assessment yet.</p>}
        <p className="muted">A retained stretch is worth checking; it is not confirmed as the cause, and stretches outside it are not proven free of impact.</p>
        {view && view.stations.length ? <><NetworkDiagram compact label="Current assessment schematic" stations={view.stations} reaches={view.reaches}/><ReachLegend/></> : null}
      </section>
      <section className="surface means" aria-labelledby="means-heading"><h2 id="means-heading">What this means</h2>
        <article className="statement" aria-labelledby="obs-heading"><BinocularsIcon size={30}/><div><p className="eyebrow">1 · Environment</p><h3 id="obs-heading">Environmental observations</h3>
          {a.data ? <p>Assessment {a.data.revision}: {a.data.eligible ? `${km(a.data.retained_length_m)} retained under stated assumptions.` : "localization not eligible."} The cause is not established.</p> : <p>No assessment yet. {c.data.reports.length} report(s) describe the change.</p>}</div></article>
        <article className="statement" aria-labelledby="exp-heading"><LayersIcon size={30}/><div><p className="eyebrow">2 · People and animals</p><h3 id="exp-heading">Potential exposure and access</h3>
          {ctx.error ? <InlineError>{ctx.error.message}</InlineError> : !ctx.data ? <LoadingState/> : <>
            {ctx.data.layers.length ? <ul>{ctx.data.layers.map(l => <li key={l.id}>{cite(l)} · licence {l.license}</li>)}</ul>
              : <p>No public-access, animal-access or habitat layers are recorded for this case.</p>}
            <p><strong>Attention: {ctx.data.attention.level}</strong>{ctx.data.attention.because.length ? ` because of ${ctx.data.attention.because.map(cite).join("; ")}` : ""}.</p>
            {ctx.data.suggestions.length ? <><h4>Suggested recipients</h4><ul>{ctx.data.suggestions.map(r => <li key={r.recipient_id}>{r.name}: handles {r.because.map(cite).join("; ")}</li>)}</ul>
              <p className="subtle small">Suggestions come from recipients your administrators configured. The expert chooses recipients and purpose.</p></> : null}
            <p className="subtle small">{ctx.data.statement}</p></>}</div></article>
        <article className="statement health" aria-labelledby="health-heading"><AlertIcon size={30}/><div><p className="eyebrow">3 · Health</p><h3 id="health-heading">No health outcome is established or assessed by Upstream.</h3>
          <p>This investigation looks at environmental observations and evidence to guide next steps. Health questions belong to public-health professionals, who can receive the evidence package.</p></div></article>
      </section>
    </div>
    {can("expert") ? <form className="surface decision-form" onSubmit={decide} aria-labelledby="decide-heading">
      <div className="panel-head"><div><h2 id="decide-heading">Record a decision</h2><p className="muted">Document the assessment and recommend a next step. This does not share the case.</p></div><p className="icon-line small muted"><LockIcon size={18}/><span>Internal record: only your team sees this decision.</span></p></div>
      {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
      <fieldset><legend className="visually-hidden">Decision</legend><div className="decision-choices">{ACTIONS.map(([value, label, help]) =>
        <label key={value} className="choice choice-card"><input type="radio" name="action" value={value} checked={action === value} onChange={() => setAction(value)}/><strong>{label}</strong><span>{help}</span></label>)}</div></fieldset>
      {action === "inspection_recommended" ? retained.length ? <fieldset><legend>Segments to inspect</legend><div className="choice-grid">{retained.map(x => <label key={x.id} className="choice"><input type="checkbox" checked={segments.includes(x.id)}
        onChange={e => setSegments(s => e.target.checked ? [...s, x.id] : s.filter(y => y !== x.id))}/><span>{x.reach_ids.join(", ")} ({km(x.length_m)}, {x.status})</span></label>)}</div></fieldset>
        : <p className="muted">No retained segments to name; an inspection can still be recommended with a rationale.</p> : null}
      <div className="form-field"><label htmlFor="rationale">Rationale <span className="subtle">(required)</span></label><textarea id="rationale" rows={3} placeholder="Summarise the evidence, assumptions and your reasoning." value={reason} onChange={e => setReason(e.target.value)}/></div>
      <div className="spread"><p className="field-help">An inspection recommendation does not change localization results. Closing with no anomaly is not a water safety certification.</p>
        <button className="button button-primary" disabled={reason.length < 10}>Record decision</button></div></form>
      : <EmptyState title="Decisions are recorded by expert reviewers" steps={["You can read the assessment and its context here.", "An expert records inspection, escalation or closure decisions."]}/>}
  </main>;
}
