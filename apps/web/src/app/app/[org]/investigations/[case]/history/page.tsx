"use client";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseTabs } from "../../../../../../components/case-tabs";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { useOrg } from "../../../../../../lib/session";

type Event = { sequence: number; event_type: string; object_id: string | null; object_version: number | null; occurred_at: string; actor: string; payload: Record<string, unknown> };
const TYPES: [string, string][] = [["", "All activity"], ["report", "Reports"], ["task", "Tasks"], ["reading", "Readings and QC"], ["network", "Mapping"], ["analysis", "Analyses requested"],
  ["assessment", "Assessments and reviews"], ["decision", "Decisions"], ["package", "Packages and delivery"], ["access", "Access"], ["case", "Merges"]];

function describe(e: Event) {
  const p = e.payload || {};
  const bits = Object.entries(p).filter(([, v]) => v !== null && v !== "" && typeof v !== "object").map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`);
  return bits.join(" · ");
}

export default function History() {
  const { org } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const [type, setType] = useState("");
  const title = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<{ title: string }>(`/orgs/${org}/cases/${caseId}`) });
  const events = useInfiniteQuery({ queryKey: ["events", org, caseId, type], initialPageParam: "",
    queryFn: ({ pageParam }) => api<{ items: Event[]; next_before: number | null }>(`/orgs/${org}/cases/${caseId}/events?type=${type}${pageParam ? `&before=${pageParam}` : ""}`),
    getNextPageParam: last => last.next_before === null ? undefined : String(last.next_before) });
  const items = events.data?.pages.flatMap(p => p.items) ?? [];
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>{title.data?.title ?? "Investigation"}</Link> / <span aria-current="page">History</span></nav>
    <CaseTabs caseId={caseId} current="history"/>
    <PageIntro title="Case history"><p>An append-only record of submissions, reviews, mapping, analyses, decisions and deliveries. Earlier records are never rewritten.</p></PageIntro>
    <div className="form-field"><label htmlFor="type">Show</label><select id="type" value={type} onChange={e => setType(e.target.value)}>{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {events.error ? <InlineError>{events.error.message}</InlineError> : events.isPending ? <LoadingState/> : !items.length ? <EmptyState title="No activity of this type"/> :
      <ol className="stack" aria-label="Activity, newest first">{items.map(e => <li key={e.sequence} className="surface"><p><strong>{e.event_type.replaceAll(".", " · ").replaceAll("_", " ")}</strong>{e.object_version ? ` · version ${e.object_version}` : ""}</p>
        <p className="muted">{new Date(e.occurred_at).toLocaleString()} · {e.actor}{describe(e) ? ` · ${describe(e)}` : ""}</p></li>)}</ol>}
    {events.hasNextPage ? <button className="button button-outline" disabled={events.isFetchingNextPage} onClick={() => events.fetchNextPage()}>Show older activity</button> : null}
  </main>;
}
