"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BookIcon, CalendarIcon, DocIcon, FlaskIcon, PersonIcon, PinIcon, ShieldIcon } from "../../../../../components/icons";
import { TASK_STATES, TASK_TYPES, type Task } from "../../../../../components/tasks";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageState } from "../../../../../components/ui";
import { api, supabase, type ApiError } from "../../../../../lib/api";
import { db, uuidv7, type ReadingSet } from "../../../../../lib/drafts";
import { useMe, useOrg } from "../../../../../lib/session";

type Reading = { id: string; mode: string; value: string; unit: string; temperature: string | null; measured_at: string; eligible: boolean; ineligibility_reasons: string[]; submitted_task_version: number; quality: string | null };
type Detail = Task & { station_code: string | null; access_status: string | null; access_notes: string | null; instrument_serial: string | null; protocol_name: string | null; protocol_version: number | null; instructions: string | null; readings: Reading[] };
type Candidates = { people: { user_id: string; display_name: string | null; qualified: boolean }[]; instruments: { id: string; serial: string; model: string; available: boolean; verified: boolean; booked: boolean }[]; travel_note: string };
const ACCESS: Record<string, string> = { open: "Access open", closed: "Access reported closed" };
const MEASURE = ["baseline_reading", "anchor_reading", "conductance_reading", "coordinated_pair", "instrument_check"];

export default function TaskDetail() {
  const { org, can } = useOrg(); const { task: id } = useParams<{ task: string }>();
  const me = useMe().data?.user_id; const client = useQueryClient();
  const q = useQuery({ queryKey: ["task", org, id], queryFn: () => api<Detail>(`/orgs/${org}/tasks/${id}`) });
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const refresh = () => { client.invalidateQueries({ queryKey: ["task", org, id] }); client.invalidateQueries({ queryKey: ["tasks"] }); };

  async function act(action: string) {
    setError(""); setStatus("");
    try { await api(`/orgs/${org}/tasks/${id}/transition`, { method: "POST", json: { expected_version: q.data!.version, action, reason } }); setReason(""); setStatus(`Task ${action} recorded.`); refresh(); }
    catch (e) { setError((e as Error).message); refresh(); } // a 409 shows the latest version; the reason text is kept
  }
  async function reportAccess(state: "closed" | "open") {
    setError("");
    try { const r = await api<{ blocked_tasks: number }>(`/orgs/${org}/stations/${q.data!.station_id}/access`, { method: "POST", json: { status: state, notes: reason } });
      setStatus(state === "closed" ? `Access reported closed. ${r.blocked_tasks} task(s) provisionally blocked until a coordinator resolves it.` : "Access marked open."); setReason(""); refresh(); }
    catch (e) { setError((e as Error).message); }
  }

  if (q.error) return (q.error as ApiError).status === 404 ? <PageState title="Field task"><EmptyState title="Task not found" action={<Link className="button button-outline" href={`/app/${org}/tasks`}>All tasks</Link>}><p>It may not exist, or it is not shared with you.</p></EmptyState></PageState>
    : <PageState title="Field task" error={q.error} retry={() => q.refetch()}/>;
  if (!q.data) return <PageState title="Field task"/>;
  const t = q.data; const mine = t.assignee_id === me; const coordinator = can("coordinate");
  const reasonField = <div className="form-field"><label htmlFor="reason">Reason or access note</label><textarea id="reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} aria-describedby="reason-help"/><p className="field-help" id="reason-help">Required to decline, block, cancel or report access. Refusing unsafe or inaccessible terrain is a valid outcome.</p></div>;

  const day = (d: string) => new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const access = t.station_code ? ACCESS[t.access_status ?? ""] ?? "Access not confirmed" : "No station for this task";

  return <main id="main-content" className="page-shell task-detail">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/tasks`}>Field tasks</Link> / <Link href={`/app/${org}/investigations/${t.case_id}`}>{t.case_title}</Link></nav>
    <div className="page-intro task-hero"><div className="task-hero-copy"><h1>{TASK_TYPES[t.task_type] ?? t.task_type}{t.station_code ? ` at ${t.station_code}` : ""}</h1>
        <p className="task-sub"><span className="task-place">{t.station_code ? `${t.station_code} · ` : ""}{t.case_title}</span><CaseStatus tone={TASK_STATES[t.state]?.[1]}>{TASK_STATES[t.state]?.[0] ?? t.state}</CaseStatus><span className="subtle small">Version {t.version}</span></p>
        <p className="task-purpose">{t.purpose}</p></div>
      <dl className="task-facts">
        <div><PersonIcon size={26}/><dt>Assigned to</dt><dd>{!t.assignee_id ? "Not assigned yet" : mine ? "You" : "A qualified member"}</dd></div>
        <div><CalendarIcon size={26}/><dt>{day(t.window_start)}</dt><dd>{time(t.window_start)} – {time(t.window_end)}<span>About {t.estimated_minutes} min</span></dd></div>
        <div><ShieldIcon size={26}/><dt>Access</dt><dd>{access}</dd></div>
      </dl></div>
    {error ? <InlineError>{error}</InlineError> : null}{status ? <p className="notice" role="status">{status}</p> : null}
    <div className="task-grid">
      <div className="task-side">
        <section className="surface" aria-labelledby="station-h"><h2 id="station-h">Station and access</h2>
          <p className="task-line"><PinIcon size={26}/><span><strong>{t.station_code ?? "No station"}</strong><span>{t.case_title}</span></span></p>
          {t.access_notes ? <p className="task-line"><ShieldIcon size={26}/><span><strong>{access}</strong><span>{t.access_notes}</span></span></p> : null}
          <p className="field-guidance"><strong>Use approved access points. Do not enter private or unsafe land.</strong> {t.limitations}</p>
          {t.reason ? <p className="muted small"><strong>Last reason:</strong> {t.reason}</p> : null}</section>
        <section className="surface" aria-labelledby="kit-h"><h2 id="kit-h">Instrument and protocol</h2>
          <ul className="task-kit">
            <li><FlaskIcon size={26}/><span><strong>Instrument</strong><span>{t.instrument_serial ? <span className="mono">{t.instrument_serial}</span> : MEASURE.includes(t.task_type) ? "Assigned with the task" : "Not required"}</span></span></li>
            <li><DocIcon size={26}/><span><strong>Protocol</strong><span>{t.protocol_name ? `${t.protocol_name} v${t.protocol_version}` : "None"}</span></span></li>
            {t.instructions ? <li><BookIcon size={26}/><span><strong>Approved instructions</strong><span>{t.instructions}</span></span></li> : null}
          </ul></section>
      </div>
      <div className="task-main">
        <section className="surface" aria-labelledby="actions-h"><h2 id="actions-h">Actions</h2>{reasonField}
          <div className="button-row">
            {t.state === "proposed" && !coordinator ? <button className="button button-primary" onClick={() => act("claim")}>Claim this task</button> : null}
            {mine && t.state === "assigned" ? <button className="button button-primary" onClick={() => act("accept")}>Accept</button> : null}
            {mine && t.state === "accepted" ? <button className="button button-primary" onClick={() => act("start")}>Start</button> : null}
            {mine && ["assigned", "accepted"].includes(t.state) ? <button className="button button-outline" disabled={reason.length < 5} onClick={() => act("decline")}>Decline</button> : null}
            {mine && ["assigned", "accepted", "in_progress"].includes(t.state) ? <button className="button button-outline" disabled={reason.length < 5} onClick={() => act("block")}>Report blocked</button> : null}
            {mine && !MEASURE.includes(t.task_type) && ["accepted", "in_progress"].includes(t.state) ? <button className="button button-primary" onClick={() => act("submit")}>Submit outcome</button> : null}
            {coordinator && t.state === "submitted" ? <button className="button button-primary" disabled={reason.length < 5} onClick={() => act("complete")}>Mark complete</button> : null}
            {coordinator && !["completed", "cancelled"].includes(t.state) ? <button className="button button-quiet" disabled={reason.length < 5} onClick={() => act("cancel")}>Cancel task</button> : null}
            {t.station_id ? <button className="button button-quiet" disabled={reason.length < 5} onClick={() => reportAccess("closed")}>Report access closed</button> : null}
            {t.station_id && coordinator && t.access_status === "closed" ? <button className="button button-quiet" disabled={reason.length < 5} onClick={() => reportAccess("open")}>Resolve: access open</button> : null}
          </div>
          {coordinator && ["proposed", "declined", "needs_revision"].includes(t.state) ? <AssignPanel org={org} task={t} onDone={refresh}/> : null}
        </section>
        {mine && MEASURE.includes(t.task_type) && ["accepted", "in_progress", "submitted", "needs_revision"].includes(t.state) ? <CaptureForm org={org} task={t} onDone={refresh}/> : null}
        <Readings org={org} readings={t.readings} canReview={can("expert") || coordinator} onDone={refresh}/>
      </div>
    </div>
  </main>;
}

function AssignPanel({ org, task, onDone }: { org: string; task: Detail; onDone: () => void }) {
  const q = useQuery({ queryKey: ["candidates", org, task.id, task.version], queryFn: () => api<Candidates>(`/orgs/${org}/tasks/${task.id}/candidates`) });
  const [person, setPerson] = useState(""); const [meter, setMeter] = useState(""); const [error, setError] = useState("");
  async function assign() {
    setError("");
    try { await api(`/orgs/${org}/tasks/${task.id}/assign`, { method: "POST", json: { expected_version: task.version, assignee_id: person, instrument_id: meter || null } }); onDone(); }
    catch (e) { setError((e as Error).message); }
  }
  if (!q.data) return q.error ? <InlineError>{q.error.message}</InlineError> : <LoadingState/>;
  return <div className="stack" role="group" aria-labelledby="assign-heading"><h3 id="assign-heading">Assign</h3>{error ? <InlineError>{error}</InlineError> : null}
    <div className="form-field"><label htmlFor="person">Person</label><select id="person" value={person} onChange={e => setPerson(e.target.value)}><option value="">Choose…</option>
      {q.data.people.map(p => <option key={p.user_id} value={p.user_id} disabled={!p.qualified && MEASURE.includes(task.task_type)}>{p.display_name ?? "Member"}{p.qualified ? " · qualified" : MEASURE.includes(task.task_type) ? " · not qualified for this window" : ""}</option>)}</select></div>
    {MEASURE.includes(task.task_type) ? <div className="form-field"><label htmlFor="meter">Verified instrument</label><select id="meter" value={meter} onChange={e => setMeter(e.target.value)}><option value="">Choose…</option>
      {q.data.instruments.map(i => <option key={i.id} value={i.id} disabled={!i.verified || i.booked || !i.available}>{i.serial} · {i.model}{!i.verified ? " · not verified for window" : i.booked ? " · booked" : ""}</option>)}</select></div> : null}
    <p className="muted">{q.data.travel_note}. Access status: {task.access_status ?? "no station"}. A planner ranking never assigns work by itself.</p>
    <button className="button button-primary" disabled={!person} onClick={assign}>Assign task</button></div>;
}

type Rep = { value: string; temperature: string; measured_at: string; notes: string };
function CaptureForm({ org, task, onDone }: { org: string; task: Detail; onDone: () => void }) {
  const now = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [mode, setMode] = useState("raw"); const [unit, setUnit] = useState("uS/cm");
  const [reps, setReps] = useState<Rep[]>([{ value: "", temperature: "", measured_at: now(), notes: "" }]);
  const [key] = useState(uuidv7); const [error, setError] = useState(""); const [result, setResult] = useState<{ readings: { eligible: boolean; reasons: string[] }[] } | null>(null);
  const [saved, setSaved] = useState<ReadingSet[]>([]);
  const set = (i: number, patch: Partial<Rep>) => setReps(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  useEffect(() => { // reading sets for this task still on this device (unsent, or refused by the server)
    const load = () => db.readings.where("task").equals(task.id).toArray().then(setSaved, () => undefined);
    load(); window.addEventListener("upstream-drafts", load);
    return () => window.removeEventListener("upstream-drafts", load);
  }, [task.id]);
  async function submit() {
    setError("");
    const body = { client_id: key, task_version: task.version, started_at: new Date(reps[0].measured_at).toISOString(), mode, unit,
      replicates: reps.map(r => ({ value: r.value, temperature: r.temperature || null, measured_at: new Date(r.measured_at).toISOString(), notes: r.notes })) };
    try { setResult(await api(`/orgs/${org}/tasks/${task.id}/readings`, { method: "POST", json: body })); onDone(); }
    catch (e) {
      if ((e as ApiError).code !== "NETWORK") return setError((e as Error).message); // entered values stay in the form
      const account = (await supabase.auth.getSession()).data.session?.user.id ?? "";
      await db.readings.put({ id: key, account, org, task: task.id, body, updatedAt: Date.now() }) // D12: sent later under this task version
        .then(() => window.dispatchEvent(new Event("upstream-drafts")), () => setError("No connection, and this browser could not save the readings. Keep this tab open."));
    }
  }
  return <section className="surface capture" aria-labelledby="capture-heading"><h2 id="capture-heading">Record readings</h2>
    <p className="muted">Record each replicate separately exactly as displayed. Say what the number represents; the server decides eligibility.</p>
    {error ? <InlineError>{error}</InlineError> : null}
    <div className="capture-kind"><div className="form-field"><label htmlFor="mode">Value type</label><select id="mode" value={mode} onChange={e => setMode(e.target.value)}><option value="raw">Raw conductivity (not temperature compensated)</option><option value="meter_sc25">Meter-reported SC25 (compensated by the meter)</option></select></div>
      <div className="form-field"><label htmlFor="unit">Unit</label><select id="unit" value={unit} onChange={e => setUnit(e.target.value)}><option value="uS/cm">µS/cm</option><option value="mS/cm">mS/cm</option></select></div></div>
    {reps.map((r, i) => <fieldset key={i} className="replicate"><legend>Replicate {i + 1}</legend><div className="replicate-fields">
      <div className="form-field"><label htmlFor={`v${i}`}>Value</label><input id={`v${i}`} inputMode="decimal" value={r.value} onChange={e => set(i, { value: e.target.value.trim() })}/></div>
      <div className="form-field"><label htmlFor={`t${i}`}>Water temperature (°C)</label><input id={`t${i}`} inputMode="decimal" value={r.temperature} onChange={e => set(i, { temperature: e.target.value.trim() })}/></div>
      <div className="form-field"><label htmlFor={`m${i}`}>Measured at</label><input id={`m${i}`} type="datetime-local" value={r.measured_at} onChange={e => set(i, { measured_at: e.target.value })}/></div>
      <div className="form-field"><label htmlFor={`n${i}`}>Quality notes</label><input id={`n${i}`} value={r.notes} onChange={e => set(i, { notes: e.target.value })}/></div>
      {reps.length > 1 ? <button type="button" className="button button-quiet" onClick={() => setReps(rs => rs.filter((_, j) => j !== i))}>Remove replicate {i + 1}</button> : null}</div></fieldset>)}
    <div className="button-row"><button type="button" className="button button-outline" onClick={() => setReps(rs => [...rs, { value: "", temperature: "", measured_at: now(), notes: "" }])}>Add replicate</button>
      <button type="button" className="button button-primary" disabled={reps.some(r => !r.value)} onClick={submit}>Submit readings</button></div>
    {saved.map(r => <div key={r.id} role="status" className="notice">{r.error ? `Not accepted by the server: ${r.error} The readings stay on this device.`
      : `Saved on this device under task version ${r.body.task_version}. Not submitted yet; they are sent when you are back online while Upstream is open.`}</div>)}
    {result ? <div role="status" className="notice">Received, pending quality review. {result.readings.filter(r => !r.eligible).length ? `History only: ${[...new Set(result.readings.flatMap(r => r.reasons))].join("; ")}` : "All replicates can be considered after review."}</div> : null}
  </section>;
}

function Readings({ org, readings, canReview, onDone }: { org: string; readings: Reading[]; canReview: boolean; onDone: () => void }) {
  const [error, setError] = useState("");
  async function decide(id: string, disposition: string) {
    const reason = prompt(`Rationale for marking this reading ${disposition} (10+ characters)`) || "";
    setError("");
    try { await api(`/orgs/${org}/readings/${id}/quality`, { method: "POST", json: { disposition, reason, comparable: disposition === "accepted" ? true : null } }); onDone(); }
    catch (e) { setError((e as Error).message); }
  }
  if (!readings.length) return null;
  return <section className="surface stack" aria-labelledby="readings-heading"><h2 id="readings-heading">Submitted readings</h2>{error ? <InlineError>{error}</InlineError> : null}
    <div className="table-scroll" role="region" aria-label="Readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Measured</th><th scope="col">Value</th><th scope="col">Temperature</th><th scope="col">Eligibility</th><th scope="col">Quality</th>{canReview ? <th scope="col">Review</th> : null}</tr></thead>
      <tbody>{readings.map(r => <tr key={r.id}><td>{new Date(r.measured_at).toLocaleString()}</td><td className="numeric">{r.value} {r.unit} <span className="muted">({r.mode === "raw" ? "raw" : "meter SC25"})</span></td><td className="numeric">{r.temperature ?? "missing"}</td>
        <td>{r.eligible ? "Eligible after review" : `History only: ${r.ineligibility_reasons.join("; ")}`}</td><td>{r.quality ?? "Pending review"}</td>
        {canReview ? <td><div className="button-row"><button className="button button-quiet" onClick={() => decide(r.id, "accepted")}>Accept</button><button className="button button-quiet" onClick={() => decide(r.id, "suspect")}>Suspect</button><button className="button button-quiet" onClick={() => decide(r.id, "excluded")}>Exclude</button></div></td> : null}</tr>)}</tbody></table></div></section>;
}
