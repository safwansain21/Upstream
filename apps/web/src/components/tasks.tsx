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

export function TaskList({ org, caseId, filter }: { org: string; caseId?: string; filter: "mine" | "available" | "all" }) {
  const me = useMe().data?.user_id;
  const q = useQuery({ queryKey: ["tasks", org, caseId ?? ""], queryFn: () => api<Task[]>(`/orgs/${org}/tasks${caseId ? `?case=${caseId}` : ""}`) });
  if (q.error) return <InlineError>{q.error.message}</InlineError>;
  if (!q.data) return <LoadingState/>;
  const rows = q.data.filter(t => filter === "all" || (filter === "mine" ? t.assignee_id === me : t.state === "proposed" && t.assignee_id !== me));
  if (!rows.length) return <EmptyState title={filter === "mine" ? "No tasks assigned to you" : filter === "available" ? "No tasks available to you right now" : "No tasks yet"}>
    <p>{filter === "available" ? "Tasks appear here when a coordinator proposes work you are qualified for." : "Tasks are proposed by coordinators from readiness needs or assessment recommendations."}</p></EmptyState>;
  return <div className="table-scroll" role="region" aria-label="Tasks" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Task</th><th scope="col">Investigation</th><th scope="col">Station</th><th scope="col">Window</th><th scope="col">State</th></tr></thead>
    <tbody>{rows.map(t => <tr key={t.id}><td><Link className="text-link" href={`/app/${org}/tasks/${t.id}`}>{TASK_TYPES[t.task_type] ?? t.task_type}</Link><p className="muted">{t.purpose}</p></td>
      <td>{t.case_title}</td><td>{t.station_code ?? "—"}</td><td>{new Date(t.window_start).toLocaleString()} – {new Date(t.window_end).toLocaleTimeString()}</td>
      <td><CaseStatus tone={TASK_STATES[t.state]?.[1]}>{TASK_STATES[t.state]?.[0] ?? t.state}</CaseStatus>{t.reason ? <p className="muted">{t.reason}</p> : null}</td></tr>)}</tbody></table></div>;
}
