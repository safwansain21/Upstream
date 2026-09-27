"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../lib/session";
import { CaseStatus, EmptyState, InlineError, LoadingState } from "./ui";

export type Task = { id: string; case_id: string; case_title: string; task_type: string; state: string; purpose: string; limitations: string;
  assignee_id: string | null; station_id: string | null; station_code: string | null; instrument_id: string | null; protocol_id: string | null;
  window_start: string; window_end: string; estimated_minutes: number; version: number; reason: string | null };

export const TASK_TYPES: Record<string, string> = {
  location_confirmation: "Confirm location", mapping_verification: "Verify mapping", access_confirmation: "Confirm access", repeat_imagery: "Repeat imagery",
  baseline_reading: "Baseline reading", anchor_reading: "Anchor reading", conductance_reading: "Conductance reading", coordinated_pair: "Coordinated pair",
  instrument_check: "Instrument check", expert_review: "Expert review",
};
export const TASK_STATES: Record<string, [string, "neutral" | "warning" | "accepted" | "error"]> = {
  proposed: ["Proposed", "neutral"], assigned: ["Assigned", "neutral"], accepted: ["Accepted", "neutral"], in_progress: ["In progress", "neutral"],
  submitted: ["Submitted · awaiting review", "warning"], completed: ["Completed", "accepted"], declined: ["Declined", "warning"], cancelled: ["Cancelled", "neutral"],
  expired: ["Expired", "warning"], blocked: ["Blocked", "error"], needs_revision: ["Needs revision", "warning"],
};
/** What kind of work each task is, in plain words for contributors. */
const TASK_KIND: Record<string, string> = {
  location_confirmation: "Place", mapping_verification: "Map", access_confirmation: "Access", repeat_imagery: "Photos", baseline_reading: "Water reading",
  anchor_reading: "Water reading", conductance_reading: "Water reading", coordinated_pair: "Paired water readings", instrument_check: "Instrument", expert_review: "Review",
};
const FINISHED = new Set(["completed", "cancelled", "expired", "declined"]);
const EMPTY = {
  mine: ["No tasks assigned to you", ["When a coordinator assigns you work, it appears here with its time window and place.", "You can always decline a task that is unsafe or you cannot reach."]],
  available: ["No tasks available to you right now", ["Tasks appear here when a coordinator proposes work you are qualified for.", "Qualifications are recorded by an organization administrator."]],
  all: ["No tasks yet", ["Propose tasks from an investigation's Tasks tab, starting from its readiness needs or next station."]],
} as const;

export function TaskList({ org, caseId, filter }: { org: string; caseId?: string; filter: "mine" | "available" | "all" }) {
  const me = useMe().data?.user_id;
  const q = useQuery({ queryKey: ["tasks", org, caseId ?? ""], queryFn: () => api<Task[]>(`/orgs/${org}/tasks${caseId ? `?case=${caseId}` : ""}`) });
  if (q.error) return <InlineError>{q.error.message} <button type="button" className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>;
  if (!q.data) return <LoadingState label="Loading tasks…"/>;
  const rows = q.data.filter(t => filter === "all" || (filter === "mine" ? t.assignee_id === me : t.state === "proposed" && t.assignee_id !== me));
  if (!rows.length) { const [title, steps] = EMPTY[filter]; return <EmptyState title={title} steps={[...steps]}/>; }
  const done = rows.filter(t => FINISHED.has(t.state)), open = rows.filter(t => !FINISHED.has(t.state));
  const groups = new Map<string, Task[]>();
  for (const t of open) { const key = `${t.case_title}\u0000${t.station_code ?? ""}`; groups.set(key, [...(groups.get(key) ?? []), t]); }
  const list = [...groups.entries()];
  return <div className="field-task-board">
    <nav className="task-rail" aria-label="Places with tasks"><ol>{list.map(([key]) => { const [title, code] = key.split("\u0000"); return <li key={key}>
      <a href={`#tasks-${encodeURIComponent(key)}`}><span className="rail-dot" aria-hidden="true"/><span><strong>{code || title}</strong>{code ? title : "No station"}</span></a></li>; })}</ol></nav>
    <div className="task-groups">{list.map(([key, tasks]) => { const [title, code] = key.split("\u0000"); return <section key={key} id={`tasks-${encodeURIComponent(key)}`} className="task-group" aria-label={`${code || "No station"}, ${title}`}>
      <div className="task-group-head"><h2>{code ? <span className="mono">{code}</span> : null}{title}</h2><span className="task-group-meta">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span></div>
      <ul className="field-task-list">{tasks.map(t => { const [label, tone] = TASK_STATES[t.state] ?? [t.state, "neutral" as const]; return <li key={t.id} className="field-task">
        <div className="field-task-main"><span className="field-task-kind">{code || "No station"} · {TASK_KIND[t.task_type] ?? "Task"}</span>
          <h3><Link href={`/app/${org}/tasks/${t.id}`}>{TASK_TYPES[t.task_type] ?? t.task_type}</Link></h3>
          <CaseStatus tone={filter === "available" ? "active" : tone}>{filter === "available" ? "Available to you" : label}</CaseStatus>
          <p className="field-task-purpose">{t.purpose}</p>
          <dl className="field-task-facts"><div><dt>When</dt><dd>{new Date(t.window_start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {new Date(t.window_end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</dd></div>
            <div><dt>Time needed</dt><dd>About {t.estimated_minutes} min</dd></div>
            {t.limitations ? <div><dt>Limits</dt><dd>{t.limitations}</dd></div> : null}</dl>
          {t.reason ? <p className="task-card-note">{t.reason}</p> : null}</div>
        <Link className="button button-outline button-small" href={`/app/${org}/tasks/${t.id}`} aria-hidden="true" tabIndex={-1}>View task <span aria-hidden="true">→</span></Link></li>; })}</ul></section>; })}
      {!open.length ? <p className="muted">No open tasks. Finished work is listed below.</p> : null}
      {done.length ? <details className="finished-tasks"><summary>Finished tasks ({done.length})</summary><ul>{done.map(t => <li key={t.id}><Link className="text-link" href={`/app/${org}/tasks/${t.id}`}>{TASK_TYPES[t.task_type] ?? t.task_type}</Link>
        <span>{t.case_title}{t.station_code ? ` · ${t.station_code}` : ""}</span><span>{TASK_STATES[t.state]?.[0] ?? t.state} · {new Date(t.window_start).toLocaleDateString()}</span></li>)}</ul></details> : null}</div>
  </div>;
}
