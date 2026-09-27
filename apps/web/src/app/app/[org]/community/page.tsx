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
  const c = q.data; const mine = c.my_contributions;
  return <main id="main-content" className="page-shell community-page"><PageIntro title={c.organization.name}>
      <p className="community-meta">{c.organization.contact ? <span>Contact: {c.organization.contact}</span> : <span>No public contact is listed.</span>}{c.organization.example ? <OriginBadge origin="synthetic"/> : null}</p></PageIntro>
    <div className="community-layout">
      <section className="surface stack" aria-labelledby="ways-heading"><h2 id="ways-heading">Ways to help</h2><p className="muted">Real places, real progress. Everyone has a role.</p>
        <Link className="help-card primary" href="/report/new"><span><strong>Report an observation</strong><span>Share what you notice. You do not need to know the stream’s name.</span></span><span aria-hidden="true">›</span></Link>
        {c.available_tasks ? <Link className="help-card" href={`/app/${org}/tasks`}><span><strong>{c.available_tasks} field {c.available_tasks === 1 ? "task" : "tasks"} open for trained monitors</strong><span>Help with readings at named stations.</span></span><span aria-hidden="true">›</span></Link>
          : <div className="help-card is-quiet"><span><strong>No open field tasks right now</strong><span>Coordinators propose them when an investigation needs readings.</span></span></div>}
        <p className="safety-note">Use approved access points and put your safety first. Some places are private land or closed at certain times of year.</p></section>
      <section className="surface stack" aria-labelledby="mine-heading"><h2 id="mine-heading">Your contributions</h2><p className="muted">A record of what you have shared with {c.organization.name}.</p>
        <div className="contribution-tiles"><div><strong>{mine.reports}</strong><span>{mine.reports === 1 ? "report" : "reports"}</span></div><div><strong>{mine.readings}</strong><span>{mine.readings === 1 ? "reading" : "readings"}</span></div>
          <p>No rankings, no points. Contributions are valued for what they add to the shared understanding.</p></div>
        <h3>What your latest contribution changed</h3>
        <ReceiptHistory path={`/orgs/${org}/receipts`}/></section>
      <section className="surface stack community-updates" aria-labelledby="updates-heading"><h2 id="updates-heading">Published case updates</h2><p className="muted">Investigations with an assessment an expert has approved.</p>
        {c.published_updates.length ? <ol className="update-list">{c.published_updates.map(u => { const d = new Date(u.updated_at); return <li key={u.id}>
          <time dateTime={u.updated_at}><span>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>{d.getFullYear()}</time>
          <div><strong>{u.title}</strong><span>{WORKFLOW[u.workflow] ?? u.workflow}</span></div>
          <Link className="text-link" href={`/app/${org}/investigations/${u.id}`}>View investigation<span className="visually-hidden">: {u.title}</span> <span aria-hidden="true">→</span></Link></li>; })}</ol>
          : <EmptyState title="No approved assessments yet" steps={["Updates appear here after an expert approves an investigation's assessment.", "Your reports still count while an investigation is open."]}/>}</section>
    </div></main>;
}
