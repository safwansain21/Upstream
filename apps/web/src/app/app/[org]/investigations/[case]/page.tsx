"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { CaseAnalysis } from "../../../../../components/case-analysis";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { WORKFLOW } from "../../../../../lib/labels";
import { useOrg } from "../../../../../lib/session";

type Report = { id: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; accuracy_m: string | null };
type CaseDetail = { id: string; title: string; locality: string | null; workflow: string; data_origin: string; version: number; network_id: string | null; current_assessment_id: string | null; reports: Report[]; events: { sequence: number; event_type: string; occurred_at: string }[] };

export default function CaseOverview() {
  const { org, can } = useOrg(); const { case: id } = useParams<{ case: string }>();
  const detail = useQuery({ queryKey: ["case", org, id], queryFn: () => api<CaseDetail>(`/orgs/${org}/cases/${id}`) });
  if (detail.error) return <main id="main-content" className="page-shell">{(detail.error as any).status === 404
    ? <EmptyState title="Investigation not found" action={<Link className="button button-outline" href={`/app/${org}/investigations`}>All investigations</Link>}><p>It may not exist, or it is not shared with you.</p></EmptyState>
    : <InlineError>{detail.error.message}</InlineError>}</main>;
  if (!detail.data) return <main id="main-content" className="page-shell"><LoadingState/></main>;
  const c = detail.data;
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations`}>Investigations</Link> / <span aria-current="page">{c.title}</span></nav>
    <div className="page-intro"><div><h1>{c.title}</h1><p><CaseStatus>{WORKFLOW[c.workflow] ?? c.workflow}</CaseStatus> <span>Cause unconfirmed</span> <OriginBadge origin={c.data_origin}/></p><p className="muted">{c.locality || "Location to be confirmed"}</p></div></div>
    <nav className="tab-nav" aria-label="Investigation sections"><Link className="active" aria-current="page" href={`/app/${org}/investigations/${id}`}>Overview</Link><Link href={`/app/${org}/investigations/${id}/tasks`}>Tasks</Link></nav>
    <CaseAnalysis org={org} caseId={id} canAnalyse={can("coordinate") || can("expert")} canReview={can("coordinate") || can("expert") || can("evidence_view")}/>
    <div className="case-grid">
      <section className="surface stack" aria-labelledby="reports-heading"><h2 id="reports-heading">Reports</h2>
        <ul>{c.reports.map(r => <li key={r.id}><p>{r.description || r.categories.join(", ")}</p><p className="muted">Observed {new Date(r.observed_at).toLocaleString()} ({r.timezone}) · {r.latitude === null ? `Location unresolved: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}${r.accuracy_m ? ` ±${r.accuracy_m} m` : ""} (${r.location_precision})`}</p></li>)}</ul>
      </section>
      <section className="surface stack" aria-labelledby="history-heading"><h2 id="history-heading">Recent activity</h2>
        <ol>{c.events.map(e => <li key={e.sequence}><span className="mono">{e.event_type}</span> · {new Date(e.occurred_at).toLocaleString()}</li>)}</ol>
      </section>
    </div></main>;
}
