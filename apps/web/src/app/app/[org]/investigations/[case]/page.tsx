"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CaseAnalysis, km } from "../../../../../components/case-analysis";
import { CaseHeader } from "../../../../../components/case-tabs";
import { DocIcon, QuestionIcon, StationIcon, ListIcon, PeopleIcon } from "../../../../../components/icons";
import { EmptyState, InlineError, PageState } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { eventLabel } from "../../../../../lib/events";
import { useOrg } from "../../../../../lib/session";

type Report = { id: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; accuracy_m: string | null };
type CaseDetail = { merged_into: string | null; id: string; title: string; locality: string | null; workflow: string; data_origin: string; version: number; network_id: string | null; current_assessment_id: string | null; reports: Report[]; events: { sequence: number; event_type: string; occurred_at: string }[] };
type Network = { version: number; status: string; stations: { code: string; status: string }[] } | null;
type Hist = { id: string; revision: number; retained_length_m: string; created_at: string; eligible: boolean; current: boolean };

export default function CaseOverview() {
  const { org, can } = useOrg(); const { case: id } = useParams<{ case: string }>();
  const review = can("coordinate") || can("expert") || can("evidence_view");
  const detail = useQuery({ queryKey: ["case", org, id], queryFn: () => api<CaseDetail>(`/orgs/${org}/cases/${id}`) });
  const network = useQuery({ queryKey: ["network", org, id], queryFn: () => api<Network>(`/orgs/${org}/cases/${id}/network`) });
  const history = useQuery({ queryKey: ["assessments", org, id], enabled: review, queryFn: () => api<Hist[]>(`/orgs/${org}/cases/${id}/assessments`) });
  const [highlight, setHighlight] = useState<Set<string>>();
  if (detail.error) return <PageState title="Investigation">{(detail.error as any).status === 404
    ? <EmptyState title="Investigation not found" steps={["It may not exist, or it is not shared with you."]} action={<Link className="button button-outline" href={`/app/${org}/investigations`}>All investigations</Link>}/>
    : <InlineError>{detail.error.message} <button type="button" className="button button-quiet" onClick={() => detail.refetch()}>Retry</button></InlineError>}</PageState>;
  if (!detail.data) return <PageState title="Investigation"/>;
  const c = detail.data;
  const approved = network.data?.stations.filter(s => s.status === "approved").length ?? 0;
  const latest = history.data?.[0];
  const first = c.reports.length ? c.reports.reduce((m, r) => r.observed_at < m.observed_at ? r : m) : null;
  const glance = <>
    <h2 className="glance-title">Investigation at a glance</h2>
    <ul className="glance-counts">
      <li><span className="glance-icon amber"><PeopleIcon/></span><strong className="numeric">{c.reports.length}</strong><span>community {c.reports.length === 1 ? "report" : "reports"}</span></li>
      <li><span className="glance-icon"><StationIcon/></span><strong className="numeric">{approved}</strong><span>{approved === 1 ? "station" : "stations"} ready for field readings</span></li>
      {review ? <li><span className="glance-icon"><DocIcon/></span><strong className="numeric">{history.data?.length ?? 0}</strong><span>{latest ? `assessment${history.data!.length === 1 ? "" : "s"} · latest keeps ${latest.eligible ? km(latest.retained_length_m) : "everything"} under consideration` : "assessments so far"}</span></li> : null}
    </ul>
    <section className="glance-block" aria-labelledby="know-h"><h3 id="know-h"><ListIcon/> What we know</h3>
      <p className="muted">{first ? `The first observation was made on ${new Date(first.observed_at).toLocaleDateString()}.` : "No observations are attached yet."} {c.reports.length > 1 ? `${c.reports.length} reports describe this change.` : ""} {network.data ? `A local map is recorded (version ${network.data.version}, ${network.data.status}).` : "No local stream map is recorded yet."}</p></section>
    <section className="glance-block" aria-labelledby="unknown-h"><h3 id="unknown-h"><QuestionIcon/> What remains unknown</h3>
      <ul className="muted"><li>The source of the change is not identified.</li><li>Water safety is not established.</li><li>Whether it comes from one event or several is unknown.</li><li>Being near a place does not make it the cause.</li></ul></section>
  </>;
  return <main id="main-content" className="page-shell case-page">
    <CaseHeader caseId={id} current="" nameIsHeading/>
    {c.merged_into ? <p className="notice" role="status">This investigation was merged. Its reports are kept with their original records and now also appear in <Link className="text-link" href={`/app/${org}/investigations/${c.merged_into}`}>the combined investigation</Link>.</p> : null}
    <CaseAnalysis org={org} caseId={id} canAnalyse={can("coordinate") || can("expert")} canReview={review} dataOrigin={c.data_origin} glance={glance} highlight={highlight}/>
    <EvidenceTimeline org={org} caseId={id} events={c.events} history={history.data ?? []} onHighlight={setHighlight}/>
    <div className="case-grid">
      <section className="surface" aria-labelledby="reports-heading"><h2 id="reports-heading">Reports</h2>
        {c.reports.length ? <ul className="report-list">{c.reports.map(r => <li key={r.id}><p>{r.description || r.categories.join(", ")}</p><p className="subtle small">Observed {new Date(r.observed_at).toLocaleString()} ({r.timezone}) · {r.latitude === null ? `Location unresolved: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}${r.accuracy_m ? ` ±${r.accuracy_m} m` : ""} (${r.location_precision})`}</p></li>)}</ul>
          : <p className="muted">No reports are attached to this investigation.</p>}
      </section>
      {can("coordinate") && !c.merged_into ? <MergePanel org={org} caseId={id} version={c.version}/> : null}
    </div></main>;
}

/**
 * M-13 evidence timeline: the latest events on one spine. A marker the viewer has not seen before arrives once (remembered
 * per device). Pointing at an assessment event marks, on the map, the stretches that revision changed; the sentence
 * underneath always states the change in words.
 */
function EvidenceTimeline({ org, caseId, events, history, onHighlight }: { org: string; caseId: string; events: CaseDetail["events"]; history: Hist[]; onHighlight: (ids?: Set<string>) => void }) {
  const items = useMemo(() => [...events].sort((x, y) => x.sequence - y.sequence).slice(-6), [events]);
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    const key = `upstream.seen.${caseId}`; let before = 0;
    try { before = Number(localStorage.getItem(key) ?? 0); localStorage.setItem(key, String(Math.max(before, ...items.map(e => e.sequence), 0))); } catch { /* optional */ }
    setSeen(before);
  }, [caseId, items]);
  const [cur, prev] = history;
  const current = useQuery({ queryKey: ["assessment", org, caseId, cur?.revision], enabled: !!cur && !!prev, queryFn: () => api<{ retained_geometry_ids: string[]; eligible: boolean }>(`/orgs/${org}/cases/${caseId}/assessment?revision=${cur!.revision}`) });
  const before = useQuery({ queryKey: ["assessment", org, caseId, prev?.revision], enabled: !!prev, queryFn: () => api<{ retained_geometry_ids: string[]; eligible: boolean }>(`/orgs/${org}/cases/${caseId}/assessment?revision=${prev!.revision}`) });
  const changed = useMemo(() => {
    if (!current.data || !before.data) return undefined;
    const now = new Set(current.data.eligible ? current.data.retained_geometry_ids : []), then = new Set(before.data.eligible ? before.data.retained_geometry_ids : []);
    return new Set([...now].filter(x => !then.has(x)).concat([...then].filter(x => !now.has(x))));
  }, [current.data, before.data]);
  const delta = cur && prev ? Number(cur.retained_length_m) - Number(prev.retained_length_m) : 0;
  const lastAssessment = [...items].reverse().find(e => e.event_type.startsWith("assessment"));
  useEffect(() => { // a revision the viewer has not seen: point at what it changed, once
    if (seen === null || !lastAssessment || lastAssessment.sequence <= seen || !changed?.size) return;
    onHighlight(changed); const t = setTimeout(() => onHighlight(undefined), 2600); return () => clearTimeout(t);
  }, [seen, changed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;
  return <section className="evidence-timeline surface" aria-labelledby="activity-heading">
    <div className="panel-head"><h2 id="activity-heading">Recent activity</h2><Link className="text-link" href={`/app/${org}/investigations/${caseId}/history`}>All activity</Link></div>
    <ol className="activity-spine" style={{ ["--n" as string]: items.length }}>{items.map((e, i) => {
      const isAssessment = e === lastAssessment && changed?.size;
      return <li key={e.sequence} className={`${seen !== null && e.sequence > seen ? "is-new" : ""} ${e.event_type.startsWith("report") ? "is-report" : ""}`} style={{ ["--i" as string]: i }}
        tabIndex={isAssessment ? 0 : undefined} onMouseEnter={isAssessment ? () => onHighlight(changed) : undefined} onMouseLeave={isAssessment ? () => onHighlight(undefined) : undefined}
        onFocus={isAssessment ? () => onHighlight(changed) : undefined} onBlur={isAssessment ? () => onHighlight(undefined) : undefined}>
        <span className="activity-dot" aria-hidden="true"/><time dateTime={e.occurred_at}>{new Date(e.occurred_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
        <strong>{eventLabel(e.event_type)}</strong>{seen !== null && e.sequence > seen ? <span className="visually-hidden"> (new)</span> : null}</li>; })}</ol>
    {cur && prev ? <p className="muted small timeline-note">Assessment {cur.revision} {delta > 0 ? `expanded the area under consideration from ${km(prev.retained_length_m)} to ${km(cur.retained_length_m)}` : delta < 0 ? `narrowed the area under consideration from ${km(prev.retained_length_m)} to ${km(cur.retained_length_m)}` : `kept the area under consideration at ${km(cur.retained_length_m)}`} compared with assessment {prev.revision}.{changed?.size ? " Point at the assessment event to see the stretches that changed on the map." : ""}</p> : null}
  </section>;
}

function MergePanel({ org, caseId, version }: { org: string; caseId: string; version: number }) {
  const client = useQueryClient();
  const [q, setQ] = useState(""); const [target, setTarget] = useState(""); const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const results = useQuery({ queryKey: ["merge-search", org, q], enabled: q.length >= 2, queryFn: () => api<{ items: { id: string; title: string; locality: string | null }[] }>(`/orgs/${org}/cases?q=${encodeURIComponent(q)}&limit=10`) });
  async function merge(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api(`/orgs/${org}/cases/${caseId}/merge`, { method: "POST", json: { into_case_id: target, expected_version: version, reason } }); setDone("Merged. Both reports keep their original records and attribution.");
      client.invalidateQueries({ queryKey: ["case", org, caseId] }); }
    catch (err) { setError((err as Error).message); }
  }
  return <section className="surface" aria-labelledby="merge-heading"><h2 id="merge-heading">Merge a duplicate</h2>
    <p className="muted small">If another investigation describes the same event, merge them. Every report keeps its original record.</p>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
    <form className="stack" onSubmit={merge}>
      <div className="form-field"><label htmlFor="merge-q">Find the investigation this duplicates</label><input id="merge-q" type="search" value={q} onChange={e => setQ(e.target.value)}/></div>
      {results.data?.items.filter(i => i.id !== caseId).map(i => <label key={i.id} className="checkbox-field"><input type="radio" name="merge-target" checked={target === i.id} onChange={() => setTarget(i.id)}/><span>{i.title}{i.locality ? ` · ${i.locality}` : ""}</span></label>)}
      <div className="form-field"><label htmlFor="merge-reason">Reason</label><input id="merge-reason" value={reason} onChange={e => setReason(e.target.value)}/></div>
      <button className="button button-outline" disabled={!target || reason.length < 10}>Merge into selected investigation</button></form></section>;
}
