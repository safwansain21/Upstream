"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { useOrg } from "../../../../lib/session";

type Note = { id: string; type: string; object_id: string | null; message: string; read_at: string | null; created_at: string };
const LABEL: Record<string, string> = { report_receipt: "Report received", assignment: "Task assignment", task_change: "Task changed", contribution_effect: "Contribution effect",
  assessment_superseded: "Assessment update" };
/** One quiet line glyph per kind of update (24px grid, stroke only). */
const GLYPH: Record<string, string> = {
  report_receipt: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5", assignment: "M8 5h8v3H8zM6 6H5v15h14V6h-1M9 13l2 2 4-4", task_change: "M5 12h10M12 7l5 5-5 5M19 5v14",
  contribution_effect: "M5 20V13M10 20V9M15 20v-5M20 20V5", assessment_superseded: "M4 6c3-1 5-1 8 1 3-2 5-2 8-1v13c-3-1-5-1-8 1-3-2-5-2-8-1zM12 7v13",
};
/** Where each update leads; assessment notices name no investigation, so they have no link (recorded as missing API data). */
function action(org: string, n: Note): [string, string] | null {
  if (!n.object_id) return null;
  if (n.type === "report_receipt") return ["View report", `/app/${org}/reports/${n.object_id}`];
  if (n.type === "assignment" || n.type === "task_change") return ["View task", `/app/${org}/tasks/${n.object_id}`];
  if (n.type === "contribution_effect") return ["See what it changed", `/app/${org}/community`];
  return null;
}
const dayKey = (iso: string) => { const d = new Date(iso), today = new Date(); const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "This week" : "Earlier"; };

export default function Notifications() {
  const { org } = useOrg(); const client = useQueryClient();
  const q = useQuery({ queryKey: ["notifications", org], queryFn: () => api<Note[]>(`/orgs/${org}/notifications`) });
  const [show, setShow] = useState<"all" | "unread">("all"); const [error, setError] = useState("");
  async function read(id: string) {
    setError("");
    await api(`/orgs/${org}/notifications/${id}/read`, { method: "POST" }).catch((e: Error) => setError(e.message));
    client.invalidateQueries({ queryKey: ["notifications", org] });
  }
  const notes = (q.data ?? []).filter(n => show === "all" || !n.read_at);
  const groups: [string, Note[]][] = [];
  for (const n of notes) { const k = dayKey(n.created_at); const g = groups.find(([key]) => key === k); if (g) g[1].push(n); else groups.push([k, [n]]); }
  const unread = (q.data ?? []).filter(n => !n.read_at).length;
  return <main id="main-content" className="page-shell notifications-page"><PageIntro title="Updates that matter" action={q.data?.length ? <div className="form-field filter-pill"><label htmlFor="note-filter" className="visually-hidden">Show</label>
      <select id="note-filter" value={show} onChange={e => setShow(e.target.value as "all" | "unread")}><option value="all">All updates</option><option value="unread">Unread ({unread})</option></select></div> : null}>
      <p>Updates about your reports, tasks and the assessments your contributions informed. No marketing messages.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading updates…"/>
      : !q.data.length ? <EmptyState title="No notifications yet" steps={["You will see report receipts, task assignments and revision notices here.", "When an assessment your report informed is approved or revised, you are told what changed."]}/>
      : !notes.length ? <p className="muted">Everything is read. <button type="button" className="button button-quiet" onClick={() => setShow("all")}>Show all updates</button></p>
      : <div className="note-timeline">{groups.map(([day, list]) => <section key={day} aria-labelledby={`day-${day}`}><h2 id={`day-${day}`} className="note-day">{day}</h2>
        <ul className="note-list" aria-label={`Notifications, ${day.toLowerCase()}`}>{list.map(n => { const go = action(org, n); const when = new Date(n.created_at); return <li key={n.id} className={n.read_at ? "is-read" : "is-unread"}>
          <span className="note-node" aria-hidden="true"/>
          <span className="note-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={GLYPH[n.type] ?? GLYPH.task_change}/></svg></span>
          <div className="note-body"><h3>{LABEL[n.type] ?? n.type}{n.read_at ? null : <span className="unread-dot"><span className="visually-hidden"> (new)</span></span>}</h3><p>{n.message}</p></div>
          <div className="note-actions"><time dateTime={n.created_at}>{day === "Today" || day === "Yesterday" ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
            {go ? <Link className="button button-outline button-small" href={go[1]}>{go[0]} <span aria-hidden="true">→</span></Link> : null}
            {!n.read_at ? <button type="button" className="button button-quiet button-small" onClick={() => read(n.id)}>Mark as read</button> : null}</div></li>; })}</ul></section>)}</div>}
  </main>;
}
