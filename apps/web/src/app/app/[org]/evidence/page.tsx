"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { useOrg } from "../../../../lib/session";

type Row = { case_id: string; title: string; review_hold: boolean; assessment_id: string; revision: number; retained_length_m: string | null; created_at: string; status: string };
const LABEL: Record<string, string> = { draft: "New assessment awaiting review", under_review: "Approved assessment under review", more_evidence: "More evidence requested", approved: "Approved" };

export default function ReviewQueue() {
  const { org, can } = useOrg();
  const q = useQuery({ queryKey: ["review-queue", org], queryFn: () => api<Row[]>(`/orgs/${org}/review-queue`), enabled: can("expert") || can("coordinate") || can("evidence_view") });
  if (!(can("expert") || can("coordinate") || can("evidence_view"))) return <main id="main-content" className="page-shell"><PageIntro title="Evidence review"/>
    <EmptyState title="Evidence review is for the review team"><p>Your reports and their receipts show what your contributions changed.</p></EmptyState></main>;
  return <main id="main-content" className="page-shell"><PageIntro title="Evidence review"><p>New assessments, evidence changes and revisions that need an expert decision. Nothing is published until an expert approves it.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>
      : !q.data ? <LoadingState/>
      : !q.data.length ? <EmptyState title="Nothing waiting for review"><p>New assessments appear here after an analysis completes.</p></EmptyState>
      : <ul className="example-list" aria-label="Review queue">{q.data.map(r => <li key={r.assessment_id}><Link className="example-row" href={`/app/${org}/investigations/${r.case_id}/evidence`}>
        <div><h2>{r.title}</h2><p><CaseStatus tone={r.status === "under_review" || r.review_hold ? "warning" : "neutral"}>{LABEL[r.status] ?? r.status}</CaseStatus></p>
          <p className="muted">Assessment {r.revision} · {r.retained_length_m ? `${(Number(r.retained_length_m) / 1000).toFixed(2)} km retained` : "no retained length"} · computed {new Date(r.created_at).toLocaleString()}</p></div>
        <span className="text-link">Review<span className="visually-hidden"> {r.title}</span></span></Link></li>)}</ul>}</main>;
}
