"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { NetworkDiagram } from "../../../../../../components/network-diagram";
import { TASK_STATES, TASK_TYPES, type Task } from "../../../../../../components/tasks";
import { Term } from "../../../../../../components/term";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { schematic } from "../../../../../../lib/geo";
import { api } from "../../../../../../lib/api";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { useOrg } from "../../../../../../lib/session";

type Net = { nodes: { code: string; kind: string; lon: number; lat: number }[]; edges: { id: string; code: string; from_code: string; to_code: string; length_m: string; flow_status: string; connectivity: string }[];
  stations: { id: string; code: string; status: string; access_status: string; lon: number; lat: number }[] } | null;
type Protocol = { id: string; name: string; version: number; status: string };
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Propose({ org, caseId }: { org: string; caseId: string }) {
  const from = useSearchParams().get("from") || ""; // e.g. visit-B2 from a recommendation
  const bound = useSearchParams().get("bound");
  const net = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Net>(`/orgs/${org}/cases/${caseId}/network`) });
  const protocols = useQuery({ queryKey: ["protocols", org], queryFn: () => api<Protocol[]>(`/orgs/${org}/protocols`) });
  const client = useQueryClient();
  const code = from.replace("visit-", "");
  const [type, setType] = useState(from ? "conductance_reading" : "location_confirmation");
  const [station, setStation] = useState("");
  const [protocol, setProtocol] = useState("");
  const [purpose, setPurpose] = useState(from ? `Measure at ${code} to help distinguish retained reaches.` : "");
  const [limitations, setLimitations] = useState(from ? `Conservative model bound${bound ? `: at most ${(Number(bound) / 1000).toFixed(2)} km would remain` : ""}. This visit may not narrow the retained area; no source discovery is promised. Use approved access points.` : "");
  const [start, setStart] = useState(local(new Date(Date.now() + 86400000))); const [end, setEnd] = useState(local(new Date(Date.now() + 86400000 + 3 * 3600000)));
  const [error, setError] = useState(""); const [done, setDone] = useState(""); const [created, setCreated] = useState("");
  const stationId = station || net.data?.stations.find(s => s.code === code)?.id || "";
  async function propose(e: React.FormEvent) {
    e.preventDefault(); setError(""); setDone("");
    try {
      const task = await api<{ id: string }>(`/orgs/${org}/tasks`, { method: "POST", json: { case_id: caseId, task_type: type, purpose, limitations, station_id: stationId || null, protocol_id: protocol || null,
        window_start: new Date(start).toISOString(), window_end: new Date(end).toISOString() } });
      setCreated(task.id); setDone("Task proposed. It is not assigned until a coordinator reviews feasibility and assigns it."); client.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) { setError((err as Error).message); }
  }
  return <form className="stack propose-task" onSubmit={propose} aria-labelledby="propose-heading"><h2 id="propose-heading">Propose a task</h2><p className="muted">Say what you want to learn. The checks below run when a coordinator assigns it.</p>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done} <Link className="text-link" href={`/app/${org}/tasks/${created}`}>Open the proposed task</Link></p> : null}
    <div className="form-grid"><div className="form-field"><label htmlFor="type">Task type</label><select id="type" value={type} onChange={e => setType(e.target.value)}>{Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <div className="form-field"><label htmlFor="station">Station</label><select id="station" value={stationId} onChange={e => setStation(e.target.value)}><option value="">No station</option>
      {net.data?.stations.map(s => <option key={s.id} value={s.id}>{s.code} · {s.status} · access {s.access_status}</option>)}</select></div>
    <div className="form-field"><label htmlFor="protocol">Protocol</label><select id="protocol" value={protocol} onChange={e => setProtocol(e.target.value)}><option value="">None</option>
      {protocols.data?.map(p => <option key={p.id} value={p.id}>{p.name} v{p.version} ({p.status})</option>)}</select></div>
    <div className="form-field"><label htmlFor="purpose">Purpose</label><textarea id="purpose" required minLength={10} rows={2} value={purpose} onChange={e => setPurpose(e.target.value)}/></div></div>
    <div className="form-field"><label htmlFor="limits">Limitations <span className="muted">(optional)</span></label><textarea id="limits" rows={2} value={limitations} onChange={e => setLimitations(e.target.value)}/><p className="field-help">For example high flow, private land or seasonal access.</p></div>
    <fieldset className="time-window"><legend>Time window</legend><div className="form-grid"><div className="form-field"><label htmlFor="start">Window start</label><input id="start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="end">Window end</label><input id="end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/></div></div></fieldset>
    <button className="button button-primary">Propose task <span aria-hidden="true">→</span></button></form>;
}

const CHECKS: [string, React.ReactNode][] = [
  ["Qualification", <>The person has a valid <Term k="qualification">qualification</Term> for this task type on the day.</>],
  ["Verified instrument", "An instrument whose calibration is valid for the whole time window."],
  ["Access", "Access to the station is confirmed and not restricted for that window."],
  ["Booking", "The person and the instrument are free for the window."]];

function TaskCard({ org, task, protocol }: { org: string; task: Task; protocol?: string }) {
  const [label, tone] = TASK_STATES[task.state] ?? [task.state, "neutral" as const];
  return <li className="task-card"><div className="task-card-head"><h4><Link href={`/app/${org}/tasks/${task.id}`}>{TASK_TYPES[task.task_type] ?? task.task_type}</Link></h4><CaseStatus tone={tone}>{label}</CaseStatus></div>
    <dl><div><dt>Time window</dt><dd>{new Date(task.window_start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} – {new Date(task.window_end).toLocaleTimeString(undefined, { timeStyle: "short" })}</dd></div>
      <div><dt>Protocol</dt><dd>{protocol ?? (task.protocol_id ? "Recorded" : "None")}</dd></div>
      <div><dt>Purpose</dt><dd>{task.purpose}</dd></div></dl>
    {task.reason ? <p className="task-card-note">{task.reason}</p> : null}</li>;
}

export default function CaseTasks() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const tasks = useQuery({ queryKey: ["tasks", org, caseId], queryFn: () => api<Task[]>(`/orgs/${org}/tasks?case=${caseId}`) });
  const net = useQuery({ queryKey: ["network", org, caseId], queryFn: () => api<Net>(`/orgs/${org}/cases/${caseId}/network`) });
  const protocols = useQuery({ queryKey: ["protocols", org], queryFn: () => api<Protocol[]>(`/orgs/${org}/protocols`) });
  const [selected, setSelected] = useState<string>();
  const coordinator = can("coordinate");
  const n = net.data;
  const view = n ? schematic(n.nodes, n.edges, new Set(n.stations.map(s => s.code)), e => { const x = n.edges.find(y => y.id === e.id); return x?.connectivity === "verified" && x.flow_status === "verified" ? "candidate" : "unreviewed"; }) : null;
  const byStation = new Map<string, Task[]>();
  for (const t of tasks.data ?? []) byStation.set(t.station_code ?? "", [...(byStation.get(t.station_code ?? "") ?? []), t]);
  const groups = [...byStation.entries()].sort(([a], [b]) => (a || "~").localeCompare(b || "~"));
  const protocolName = (id: string | null) => { const p = protocols.data?.find(x => x.id === id); return p ? `${p.name} v${p.version}` : undefined; };
  const pick = (code: string) => { setSelected(code); document.getElementById(`station-${code}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

  return <main id="main-content" className="page-shell case-page"><CaseHeader caseId={caseId} current="tasks"/>
    <PageIntro title="Case tasks"><p>A proposal becomes an assignment only after qualification, instrument, booking and access checks.</p></PageIntro>
    <div className="case-tasks-layout">
      <section className="case-task-board" aria-labelledby="task-board-heading"><h2 id="task-board-heading" className="visually-hidden">Tasks by station</h2>
        {view && view.stations.length ? <div className="task-network"><NetworkDiagram compact mode="network" label="Stations on this case's network" stations={view.stations} reaches={view.reaches} selectedStation={selected} onSelectStation={pick}/></div> : null}
        <div className="task-groups">
          {tasks.error ? <InlineError>{tasks.error.message} <button type="button" className="button button-quiet" onClick={() => tasks.refetch()}>Retry</button></InlineError> : !tasks.data ? <LoadingState label="Loading tasks…"/>
          : !groups.length ? <EmptyState title="No tasks yet" steps={coordinator ? ["Propose a task with the form: choose a station, a protocol and a time window.", "Assessment recommendations name the next useful station; start from there."]
              : ["A coordinator proposes tasks from readiness needs or the assessment's next station.", "When one matches your qualifications it appears under Field tasks."]}/>
          : groups.map(([code, list]) => { const st = n?.stations.find(s => s.code === code); return <section key={code || "none"} id={code ? `station-${code}` : undefined} className={`task-group ${selected === code ? "is-selected" : ""}`} aria-labelledby={`group-${code || "none"}`}>
              <div className="task-group-head"><span className="task-dot" aria-hidden="true"/><h3 id={`group-${code || "none"}`}>{code ? <><span className="mono">{code}</span> <Term k="station">station</Term></> : "Without a station"}</h3>
                {st ? <span className="task-group-meta">{st.lat.toFixed(4)}, {st.lon.toFixed(4)} · access {st.access_status}</span> : null}</div>
              <ul className="task-card-list">{list.map(t => <TaskCard key={t.id} org={org} task={t} protocol={protocolName(t.protocol_id)}/>)}</ul></section>; })}
        </div>
      </section>
      <aside className="case-task-aside">
        {coordinator ? <Suspense><Propose org={org} caseId={caseId}/></Suspense>
          : <div className="stack"><h2>Proposing tasks</h2><p className="muted">Coordinators propose and assign tasks. If you take readings, your assigned and available work is under <Link className="text-link" href={`/app/${org}/tasks`}>Field tasks</Link>.</p></div>}
        <section className="readiness-checks" aria-labelledby="checks-heading"><div className="checks-head"><h3 id="checks-heading">Readiness checks</h3><span className="muted">All must pass before assignment.</span></div>
          <ul className="readiness-list">{CHECKS.map(([label, text]) => <li key={label} className="is-pending"><span className="check-mark" aria-hidden="true"/><div><strong>{label}</strong><p>{text}</p></div></li>)}</ul></section>
      </aside>
    </div></main>;
}
