"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ReceiptHistory } from "../../../../components/receipts";
import { EmptyState, OriginBadge, PageIntro, PageState } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { WORKFLOW } from "../../../../lib/labels";
import { useOrg } from "../../../../lib/session";

type Community = { organization: { name: string; contact: string | null; example: boolean }; available_tasks: number; my_contributions: { reports: number; readings: number };
  published_updates: { id: string; title: string; workflow: string; updated_at: string }[] };

export default function CommunityPage() {
  const { org } = useOrg();
  const q = useQuery({ queryKey: ["community", org], queryFn: () => api<Community>(`/orgs/${org}/community`) });
  if (q.error) return <PageState title="Community" error={q.error} retry={() => q.refetch()}/>;
  if (!q.data) return <PageState title="Community"/>;
  const c = q.data;
  return <main id="main-content" className="page-shell"><PageIntro title={c.organization.name}><p>{c.organization.example ? <OriginBadge origin="synthetic"/> : null} {c.organization.contact || "No public contact is listed."}</p></PageIntro>
    <div className="case-grid">
      <section className="surface stack" aria-labelledby="ways-heading"><h2 id="ways-heading">Ways to help</h2>
        <p><Link className="text-link" href="/report/new">Report an observation</Link>. You do not need to know the stream’s name.</p>
        <p>{c.available_tasks ? <><Link className="text-link" href={`/app/${org}/tasks`}>{c.available_tasks} task(s)</Link> are open for people with the right training.</> : "No open field tasks right now."}</p>
        <p className="muted">Field tasks use approved access points and trained monitors. Nobody is ranked by number of samples or reports.</p></section>
      <section className="surface stack" aria-labelledby="mine-heading"><h2 id="mine-heading">Your contributions</h2>
        <p>{c.my_contributions.reports} report(s) · {c.my_contributions.readings} reading(s)</p>
        <ReceiptHistory path={`/orgs/${org}/receipts`}/></section>
      <section className="surface stack" aria-labelledby="updates-heading"><h2 id="updates-heading">Published case updates</h2>
        {c.published_updates.length ? <ul>{c.published_updates.map(u => <li key={u.id}>{u.title} · {WORKFLOW[u.workflow] ?? u.workflow} · {new Date(u.updated_at).toLocaleDateString()}</li>)}</ul>
          : <EmptyState title="No approved assessments yet"/>}</section>
    </div></main>;
}
