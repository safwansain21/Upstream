"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseTabs } from "../../../../../../components/case-tabs";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { WORKFLOW } from "../../../../../../lib/labels";
import { useOrg } from "../../../../../../lib/session";

type Case = { title: string; version: number; workflow: string; current_assessment_id: string | null };
type Assessment = { id: string; revision: number; retained_length_m: string; eligible: boolean; classes: { id: string; reach_ids: string[]; length_m: string; status: string }[] };
const km = (m: string) => `${(Number(m) / 1000).toFixed(2)} km`;

export default function Decision() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>(); const client = useQueryClient();
  const c = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<Case>(`/orgs/${org}/cases/${caseId}`) });
  const a = useQuery({ queryKey: ["assessment", org, caseId, "latest"], queryFn: () => api<Assessment>(`/orgs/${org}/cases/${caseId}/assessment`).catch(() => null) });
  const [action, setAction] = useState("inspection_recommended"); const [reason, setReason] = useState(""); const [segments, setSegments] = useState<string[]>([]);
  const [error, setError] = useState(""); const [done, setDone] = useState("");
  async function decide(e: React.FormEvent) {
    e.preventDefault(); setError(""); setDone("");
    try { await api(`/orgs/${org}/cases/${caseId}/decisions`, { method: "POST", json: { expected_version: c.data!.version, action, reason, assessment_id: a.data?.id ?? null, segments } });
      setDone("Decision recorded in the case history."); setReason(""); client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
    catch (err) { setError((err as Error).message); client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
  }
  if (c.error) return <main id="main-content" className="page-shell"><InlineError>{c.error.message}</InlineError></main>;
  if (!c.data) return <main id="main-content" className="page-shell"><LoadingState/></main>;
  const retained = a.data?.classes.filter(x => x.status !== "incompatible") ?? [];
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>{c.data.title}</Link> / <span aria-current="page">Decision</span></nav>
    <CaseTabs caseId={caseId} current="decision"/>
    <PageIntro title="Decision and context"><p>Current workflow: {WORKFLOW[c.data.workflow] ?? c.data.workflow}.</p></PageIntro>
    <div className="case-grid">
      <section className="surface stack" aria-labelledby="obs-heading"><h2 id="obs-heading">Environmental observations</h2>
        {a.data ? <p>Assessment {a.data.revision}: {a.data.eligible ? `${km(a.data.retained_length_m)} retained under stated assumptions.` : "localization not eligible."} The cause is not established.</p> : <p>No assessment yet.</p>}</section>
      <section className="surface stack" aria-labelledby="exp-heading"><h2 id="exp-heading">Potential exposure and access</h2>
        <p>No public-access, animal-access or habitat layers are recorded for this case. Context layers can inform attention and recipient suggestions only; they never change source compatibility.</p></section>
      <section className="surface stack" aria-labelledby="health-heading"><h2 id="health-heading">Health outcomes</h2><p>No health outcome is established or assessed by Upstream.</p></section>
    </div>
    {can("expert") ? <form className="surface stack" onSubmit={decide} aria-labelledby="decide-heading"><h2 id="decide-heading">Record a decision</h2>
      {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
      <div className="form-field"><label htmlFor="action">Decision</label><select id="action" value={action} onChange={e => setAction(e.target.value)}>
        <option value="inspection_recommended">Recommend inspection of named segments</option><option value="escalated">Escalate</option>
        <option value="closed_no_anomaly">Close: no anomaly under the investigated evidence and time</option><option value="closed_insufficient">Close: insufficient evidence</option><option value="triage">Return to triage</option></select></div>
      {action === "inspection_recommended" ? retained.length ? <fieldset><legend>Segments to inspect</legend>{retained.map(x => <label key={x.id} className="checkbox-field"><input type="checkbox" checked={segments.includes(x.id)}
        onChange={e => setSegments(s => e.target.checked ? [...s, x.id] : s.filter(y => y !== x.id))}/><span>{x.reach_ids.join(", ")} ({km(x.length_m)}, {x.status})</span></label>)}</fieldset>
        : <p className="muted">No retained segments to name; an inspection can still be recommended with a rationale.</p> : null}
      <div className="form-field"><label htmlFor="rationale">Rationale</label><textarea id="rationale" rows={3} value={reason} onChange={e => setReason(e.target.value)}/></div>
      <p className="field-help">An inspection recommendation does not change localization results. Closing with no anomaly is not a water safety certification.</p>
      <button className="button button-primary" disabled={reason.length < 10}>Record decision</button></form>
      : <EmptyState title="Decisions are recorded by expert reviewers"/>}
  </main>;
}
