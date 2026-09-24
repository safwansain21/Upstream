"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { eventLabel } from "../../../../../../lib/events";
import { useOrg } from "../../../../../../lib/session";

type Event = { sequence: number; event_type: string; object_id: string | null; object_version: number | null; occurred_at: string; actor: string; payload: Record<string, unknown> };
const TYPES: [string, string][] = [["", "All activity"], ["report", "Reports"], ["task", "Tasks"], ["reading", "Readings and QC"], ["network", "Mapping"], ["analysis", "Analyses requested"],
  ["assessment", "Assessments and reviews"], ["decision", "Decisions"], ["package", "Packages and delivery"], ["access", "Access"], ["case", "Merges"]];

function describe(e: Event) {
  const p = e.payload || {};
  return Object.entries(p).filter(([, v]) => v !== null && v !== "" && typeof v !== "object").map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`).join(" · ");
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "·";

export default function History() {
  const { org } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const [type, setType] = useState(""); const [open, setOpen] = useState<number>();
  const events = useInfiniteQuery({ queryKey: ["events", org, caseId, type], initialPageParam: "",
    queryFn: ({ pageParam }) => api<{ items: Event[]; next_before: number | null }>(`/orgs/${org}/cases/${caseId}/events?type=${type}${pageParam ? `&before=${pageParam}` : ""}`),
    getNextPageParam: last => last.next_before === null ? undefined : String(last.next_before) });
  const items = events.data?.pages.flatMap(p => p.items) ?? [];
  const selected = items.find(e => e.sequence === open);
  return <main id="main-content" className="page-shell case-page">
    <CaseHeader caseId={caseId} current="history"/>
    <PageIntro title="Case history" action={<div className="form-field compact-field"><label htmlFor="type">Show</label><select id="type" value={type} onChange={e => setType(e.target.value)}>{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}>
      <p>Every revision, review and decision stays traceable. This record is append-only: earlier entries are never rewritten.</p></PageIntro>
    {events.error ? <InlineError>{events.error.message}</InlineError> : events.isPending ? <LoadingState/> : !items.length ? <EmptyState title="No activity of this type" steps={["Choose “All activity” to see the whole record."]}/> :
      <div className="history-layout">
        <ol className="history-spine" aria-label="Activity, newest first">{items.map((e, i) => <li key={e.sequence} className={`${e.event_type.startsWith("report") ? "is-report" : ""} ${open === e.sequence ? "is-open" : ""}`} style={{ ["--i" as string]: Math.min(i, 10) }}>
          <span className="spine-dot" aria-hidden="true"/>
          <time dateTime={e.occurred_at}>{new Date(e.occurred_at).toLocaleDateString()}<br/><span>{new Date(e.occurred_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></time>
          <div className="history-main"><strong>{eventLabel(e.event_type)}</strong>{e.object_version ? <span className="subtle small"> · version {e.object_version}</span> : null}{describe(e) ? <p className="subtle small">{describe(e)}</p> : null}</div>
          <span className="history-actor"><span className="avatar small-avatar" aria-hidden="true">{initials(e.actor)}</span>{e.actor}</span>
          <button type="button" className="button button-outline button-small" aria-expanded={open === e.sequence} onClick={() => setOpen(open === e.sequence ? undefined : e.sequence)}>View record</button></li>)}</ol>
        <aside className="history-detail" aria-live="polite">{selected ? <div className="surface raised">
          <p className="eyebrow">{new Date(selected.occurred_at).toLocaleString()}</p><h2>{eventLabel(selected.event_type)}</h2>
          <dl className="facts"><dt>Actor</dt><dd>{selected.actor}</dd><dt>Event</dt><dd className="mono">{selected.event_type}</dd>{selected.object_version ? <><dt>Version</dt><dd>{selected.object_version}</dd></> : null}{selected.object_id ? <><dt>Record</dt><dd className="mono small">{selected.object_id}</dd></> : null}
            {Object.entries(selected.payload || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k.replaceAll("_", " ")}</dt><dd className="small">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>
          <button type="button" className="button button-quiet" onClick={() => setOpen(undefined)}>Close record</button></div>
          : <p className="subtle small">Select “View record” on any entry to see everything it recorded.</p>}</aside>
      </div>}
    {events.hasNextPage ? <button className="button button-outline" disabled={events.isFetchingNextPage} onClick={() => events.fetchNextPage()}>Show older activity</button> : null}
  </main>;
}
