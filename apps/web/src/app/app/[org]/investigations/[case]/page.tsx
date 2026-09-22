"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "next/navigation";
import { CaseAnalysis } from "../../../../../components/case-analysis";
import { DocumentTitle } from "../../../../../components/document-title";
import { CaseTabs } from "../../../../../components/case-tabs";
import { CaseStatus, EmptyState, InlineError, OriginBadge, PageState } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { WORKFLOW } from "../../../../../lib/labels";
import { useOrg } from "../../../../../lib/session";

type Report = { id: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; accuracy_m: string | null };
type CaseDetail = { merged_into: string | null; id: string; title: string; locality: string | null; workflow: string; data_origin: string; version: number; network_id: string | null; current_assessment_id: string | null; reports: Report[]; events: { sequence: number; event_type: string; occurred_at: string }[] };

export default function CaseOverview() {
  const { org, can } = useOrg(); const { case: id } = useParams<{ case: string }>();
  const detail = useQuery({ queryKey: ["case", org, id], queryFn: () => api<CaseDetail>(`/orgs/${org}/cases/${id}`) });
  if (detail.error) return <PageState title="Investigation">{(detail.error as any).status === 404
    ? <EmptyState title="Investigation not found" action={<Link className="button button-outline" href={`/app/${org}/investigations`}>All investigations</Link>}><p>It may not exist, or it is not shared with you.</p></EmptyState>
    : <InlineError>{detail.error.message} <button type="button" className="button button-quiet" onClick={() => detail.refetch()}>Retry</button></InlineError>}</PageState>;
  if (!detail.data) return <PageState title="Investigation"/>;
  const c = detail.data;
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations`}>Investigations</Link> / <span aria-current="page">{c.title}</span></nav>
    <div className="page-intro"><DocumentTitle title={c.title}/><div><h1>{c.title}</h1><p><CaseStatus>{WORKFLOW[c.workflow] ?? c.workflow}</CaseStatus> <span>Cause unconfirmed</span> <OriginBadge origin={c.data_origin}/></p><p className="muted">{c.locality || "Location to be confirmed"}</p></div></div>
    <CaseTabs caseId={id} current=""/>
    {c.merged_into ? <p className="notice" role="status">This investigation was merged. Its reports are kept with their original records and now also appear in <Link className="text-link" href={`/app/${org}/investigations/${c.merged_into}`}>the combined investigation</Link>.</p> : null}
    <CaseAnalysis org={org} caseId={id} canAnalyse={can("coordinate") || can("expert")} canReview={can("coordinate") || can("expert") || can("evidence_view")} dataOrigin={c.data_origin}/>
    <div className="case-grid">
      <section className="surface stack" aria-labelledby="reports-heading"><h2 id="reports-heading">Reports</h2>
        <ul>{c.reports.map(r => <li key={r.id}><p>{r.description || r.categories.join(", ")}</p><p className="muted">Observed {new Date(r.observed_at).toLocaleString()} ({r.timezone}) · {r.latitude === null ? `Location unresolved: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}${r.accuracy_m ? ` ±${r.accuracy_m} m` : ""} (${r.location_precision})`}</p></li>)}</ul>
      </section>
      {can("coordinate") && !c.merged_into ? <MergePanel org={org} caseId={id} version={c.version}/> : null}
      <section className="surface stack" aria-labelledby="history-heading"><h2 id="history-heading">Recent activity</h2>
        <ol>{c.events.map(e => <li key={e.sequence}><span className="mono">{e.event_type}</span> · {new Date(e.occurred_at).toLocaleString()}</li>)}</ol>
      </section>
    </div></main>;
}

function MergePanel({ org, caseId, version }: { org: string; caseId: string; version: number }) {
  const client = useQueryClient();
  const [q, setQ] = useState(""); const [target, setTarget] = useState(""); const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const results = useQuery({ queryKey: ["merge-search", org, q], enabled: q.length >= 2, queryFn: () => api<{ items: { id: string; title: string; locality: string | null }[] }>(`/orgs/${org}/cases?q=${encodeURIComponent(q)}&limit=10`) });
  async function merge(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api(`/orgs/${org}/cases/${caseId}/merge`, { method: "POST", json: { into_case_id: target, expected_version: version, reason } }); setDone("Merged. Both reports keep their original records and attribution.");
      client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
    catch (err) { setError((err as Error).message); }
  }
  return <section className="surface stack" aria-labelledby="merge-heading"><h2 id="merge-heading">Merge a duplicate</h2>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
    <form className="stack" onSubmit={merge}>
      <div className="form-field"><label htmlFor="merge-q">Find the investigation this duplicates</label><input id="merge-q" type="search" value={q} onChange={e => setQ(e.target.value)}/></div>
      {results.data?.items.filter(i => i.id !== caseId).map(i => <label key={i.id} className="checkbox-field"><input type="radio" name="merge-target" checked={target === i.id} onChange={() => setTarget(i.id)}/><span>{i.title}{i.locality ? ` · ${i.locality}` : ""}</span></label>)}
      <div className="form-field"><label htmlFor="merge-reason">Reason</label><input id="merge-reason" value={reason} onChange={e => setReason(e.target.value)}/></div>
      <button className="button button-outline" disabled={!target || reason.length < 10}>Merge into selected investigation</button></form></section>;
}
