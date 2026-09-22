"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, InlineError, LoadingState, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { useOrg } from "../../../../lib/session";

type Note = { id: string; type: string; object_id: string | null; message: string; read_at: string | null; created_at: string };
const LABEL: Record<string, string> = { report_receipt: "Report received", assignment: "Task assignment", task_change: "Task changed", contribution_effect: "Contribution effect",
  assessment_superseded: "Assessment update" };

export default function Notifications() {
  const { org } = useOrg(); const client = useQueryClient();
  const q = useQuery({ queryKey: ["notifications", org], queryFn: () => api<Note[]>(`/orgs/${org}/notifications`) });
  async function read(id: string) { await api(`/orgs/${org}/notifications/${id}/read`, { method: "POST" }).catch(() => undefined); client.invalidateQueries({ queryKey: ["notifications", org] }); }
  return <main id="main-content" className="page-shell"><PageIntro title="Notifications"><p>In-app updates about your reports, tasks and the assessments your contributions informed. No marketing messages.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState/>
      : !q.data.length ? <EmptyState title="No notifications yet"><p>You will see report receipts, task assignments and revision notices here.</p></EmptyState>
      : <ul className="stack" aria-label="Notifications">{q.data.map(n => <li key={n.id} className="surface"><p><strong>{LABEL[n.type] ?? n.type}</strong>{n.read_at ? "" : <span className="badge"> New</span>}</p>
        <p>{n.message}</p><p className="muted">{new Date(n.created_at).toLocaleString()}</p>
        {!n.read_at ? <button className="button button-quiet" onClick={() => read(n.id)}>Mark as read</button> : null}</li>)}</ul>}</main>;
}
