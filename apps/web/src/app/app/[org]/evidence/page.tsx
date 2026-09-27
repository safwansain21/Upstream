"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Term } from "../../../../components/term";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { useOrg } from "../../../../lib/session";

type Row = { case_id: string; title: string; review_hold: boolean; assessment_id: string; revision: number; retained_length_m: string | null; created_at: string; status: string };
const LABEL: Record<string, string> = { draft: "New assessment awaiting review", under_review: "Approved assessment under review", more_evidence: "More evidence requested", approved: "Approved" };
const MEANING: Record<string, string> = {
  draft: "The analysis finished and nothing from it is published yet. An expert approves it, asks for more evidence, or leaves it unpublished.",
  under_review: "An approved assessment has been reopened, for example because evidence changed. Recipients keep the earlier version until this one is decided.",
  more_evidence: "An expert asked for more evidence before deciding. Field work or corrections come next.",
};
type Filter = "all" | "draft" | "under_review" | "hold";
const ago = (iso: string) => { const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5); const f = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return Math.abs(days) >= 1 ? f.format(days, "day") : f.format(Math.round((new Date(iso).getTime() - Date.now()) / 36e5), "hour"); };
const km = (m: string | null) => m === null ? "None recorded" : `${(Number(m) / 1000).toFixed(2)} km`;

export default function ReviewQueue() {
  const { org, can } = useOrg();
  const allowed = can("expert") || can("coordinate") || can("evidence_view");
  const q = useQuery({ queryKey: ["review-queue", org], queryFn: () => api<Row[]>(`/orgs/${org}/review-queue`), enabled: allowed });
  const [filter, setFilter] = useState<Filter>("all"); const [open, setOpen] = useState("");
  if (!allowed) return <main id="main-content" className="page-shell"><PageIntro title="Evidence review"/>
    <EmptyState title="Evidence review is for the review team" steps={["Experts decide whether an assessment is published; nothing is published before that.", "Your reports and their receipts show what your contributions changed."]}/></main>;
  const rows = q.data ?? [];
  const count = (f: Filter) => rows.filter(r => f === "all" || (f === "hold" ? r.review_hold : r.status === f)).length;
  const shown = rows.filter(r => filter === "all" || (filter === "hold" ? r.review_hold : r.status === filter));
  const selected = shown.find(r => r.assessment_id === open) ?? shown[0];
  const tabs: [Filter, string][] = [["all", "All waiting"], ["draft", "New assessments"], ["under_review", "Reopened"], ["hold", "On hold"]];
  return <main id="main-content" className="page-shell review-queue-page"><PageIntro title="Evidence review"><p>New assessments, evidence changes and revisions that need an expert decision. Nothing is published until an expert approves it.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>
      : !q.data ? <LoadingState label="Loading the review queue…"/>
      : !rows.length ? <EmptyState title="Nothing waiting for review" steps={can("expert") ? ["New assessments appear here after an analysis completes.", "Reopened assessments return here when their evidence changes."] : ["New assessments appear here after an analysis completes; an expert decides on each."]}/>
      : <>
        <div className="tab-nav" role="tablist" aria-label="Filter the review queue">{tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{label}<span className="tab-count">{count(id)}</span></button>)}</div>
        <div className="review-queue-layout">
          {shown.length ? <ul className="queue-list" aria-label="Review queue">{shown.map(r => <li key={r.assessment_id} className={`queue-item ${selected?.assessment_id === r.assessment_id ? "is-open" : ""}`}>
            <button type="button" className="queue-select" aria-pressed={selected?.assessment_id === r.assessment_id} onClick={() => setOpen(r.assessment_id)}><span className="visually-hidden">Show details for {r.title}</span></button>
            <div className="queue-body"><div className="queue-badges"><CaseStatus tone={r.status === "under_review" || r.review_hold ? "warning" : "info"}>{LABEL[r.status] ?? r.status}</CaseStatus>{r.review_hold ? <CaseStatus tone="warning">On hold</CaseStatus> : null}</div>
              <h2>{r.title}</h2>
              <dl className="queue-facts"><div><dt>Revision</dt><dd>v{r.revision}</dd></div><div><dt>Computed</dt><dd><time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>{ago(r.created_at)}</time></dd></div>
                <div><dt>Retained length (conditional)</dt><dd>{km(r.retained_length_m)}</dd></div></dl></div>
            <Link className="button button-outline button-small queue-review" href={`/app/${org}/investigations/${r.case_id}/evidence`}>Review<span className="visually-hidden"> {r.title}</span> <span aria-hidden="true">→</span></Link></li>)}</ul>
            : <p className="muted">Nothing in this view.</p>}
          {selected ? <aside className="surface queue-detail" aria-labelledby="queue-detail-heading"><span className="eyebrow">Selected</span><h2 id="queue-detail-heading">{selected.title}</h2>
            <p>{MEANING[selected.status] ?? "This assessment is waiting for a decision."}{selected.review_hold ? " The case is on review hold, so nothing about it is published until an expert clears the hold." : ""}</p>
            <dl className="map-facts"><div><dt>Assessment</dt><dd>Revision {selected.revision}</dd></div><div><dt>Computed</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
              <div><dt><Term k="retained">Retained</Term> length</dt><dd>{km(selected.retained_length_m)}</dd></div></dl>
            <p className="map-review-note">A retained stretch is worth checking under the stated assumptions. It is not a finding about the water or a source.</p>
            <Link className="button button-primary" href={`/app/${org}/investigations/${selected.case_id}/evidence`}>Open the evidence <span aria-hidden="true">→</span></Link></aside> : null}
        </div></>}
  </main>;
}
