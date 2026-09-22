"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { WORKFLOW } from "../../../../lib/labels";
import { useOrg } from "../../../../lib/session";

type CaseRow = { id: string; title: string; locality: string | null; workflow: string; data_origin: string; updated_at: string; report_count: number; mine: boolean; network_id: string | null };

export default function Investigations() {
  const { org } = useOrg();
  const [q, setQ] = useState(""); const [workflow, setWorkflow] = useState(""); const [origin, setOrigin] = useState(""); const [mine, setMine] = useState(false);
  const params = new URLSearchParams({ q, workflow, origin, mine: String(mine) });
  const list = useInfiniteQuery({
    queryKey: ["cases", org, q, workflow, origin, mine],
    queryFn: ({ pageParam }) => api<{ items: CaseRow[]; next_cursor: string | null }>(`/orgs/${org}/cases?${params}&cursor=${encodeURIComponent(pageParam)}`),
    initialPageParam: "", getNextPageParam: last => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap(p => p.items) ?? [];
  return <main id="main-content" className="page-shell"><PageIntro title="Where will you look next?" action={<Link className="button button-primary" href="/report/new">+ New observation</Link>}><p>Explore investigations and contribute where you can.</p></PageIntro>
    <form className="button-row" role="search" onSubmit={e => e.preventDefault()}>
      <div className="form-field"><label htmlFor="q">Search a stream, place or case number</label><input id="q" type="search" value={q} onChange={e => setQ(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="workflow">Status</label><select id="workflow" value={workflow} onChange={e => setWorkflow(e.target.value)}><option value="">All statuses</option>{Object.entries(WORKFLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="form-field"><label htmlFor="origin">Data origin</label><select id="origin" value={origin} onChange={e => setOrigin(e.target.value)}><option value="">All</option><option value="real">Field</option><option value="synthetic">Example</option><option value="replayed">Replayed</option></select></div>
      <label className="checkbox-field"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)}/><span>Involving me</span></label>
    </form>
    {list.error ? <InlineError>{list.error.message} <button className="button button-quiet" onClick={() => list.refetch()}>Retry</button></InlineError> : null}
    {list.isPending ? <LoadingState/> : rows.length === 0 && !list.error ? <EmptyState title="No investigations match" action={<Link className="button button-primary" href="/report/new">Report an observation</Link>}><p>No records in this workspace match these filters. That does not mean nothing is happening at the stream.</p></EmptyState> :
      <ul className="example-list" aria-label="Investigations">{rows.map(c => <li key={c.id}><Link className="example-row" href={`/app/${org}/investigations/${c.id}`}>
        <div><h2>{c.title}</h2><p><CaseStatus>{WORKFLOW[c.workflow] ?? c.workflow}</CaseStatus> <OriginBadge origin={c.data_origin}/></p>
          <p className="muted">{c.locality || "Location to be confirmed"} · {c.network_id ? "Local map recorded" : "Map verification needed"} · {c.report_count} {c.report_count === 1 ? "report" : "reports"} · updated {new Date(c.updated_at).toLocaleDateString()}{c.mine ? " · your report" : ""}</p></div>
        <span className="text-link">Open<span className="visually-hidden"> {c.title}</span></span></Link></li>)}</ul>}
    {list.hasNextPage ? <button className="button button-outline" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Show more"}</button> : null}
  </main>;
}
