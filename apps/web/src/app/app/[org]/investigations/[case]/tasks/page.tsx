"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TASK_TYPES, TaskList } from "../../../../../../components/tasks";
import { InlineError, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { CaseTabs } from "../../../../../../components/case-tabs";
import { useOrg } from "../../../../../../lib/session";

type Net = { stations: { id: string; code: string; status: string; access_status: string }[] } | null;
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
  return <form className="surface stack" onSubmit={propose} aria-labelledby="propose-heading"><h2 id="propose-heading">Propose a task</h2>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done} <Link className="text-link" href={`/app/${org}/tasks/${created}`}>Open the proposed task</Link></p> : null}
    <div className="form-field"><label htmlFor="type">Task type</label><select id="type" value={type} onChange={e => setType(e.target.value)}>{Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <div className="form-field"><label htmlFor="station">Station</label><select id="station" value={stationId} onChange={e => setStation(e.target.value)}><option value="">No station</option>
      {net.data?.stations.map(s => <option key={s.id} value={s.id}>{s.code} · {s.status} · access {s.access_status}</option>)}</select></div>
    <div className="form-field"><label htmlFor="protocol">Protocol</label><select id="protocol" value={protocol} onChange={e => setProtocol(e.target.value)}><option value="">None</option>
      {protocols.data?.map(p => <option key={p.id} value={p.id}>{p.name} v{p.version} ({p.status})</option>)}</select></div>
    <div className="form-field"><label htmlFor="purpose">Purpose</label><textarea id="purpose" required minLength={10} rows={2} value={purpose} onChange={e => setPurpose(e.target.value)}/></div>
    <div className="form-field"><label htmlFor="limits">Limitations</label><textarea id="limits" rows={2} value={limitations} onChange={e => setLimitations(e.target.value)}/></div>
    <div className="button-row"><div className="form-field"><label htmlFor="start">Window start</label><input id="start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="end">Window end</label><input id="end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/></div></div>
    <button className="button button-primary">Propose task</button></form>;
}

export default function CaseTasks() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  return <main id="main-content" className="page-shell"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>Investigation overview</Link> / <span aria-current="page">Tasks</span></nav>
    <CaseTabs caseId={caseId} current="tasks"/>
    <PageIntro title="Case tasks"><p>Proposals are not assignments. Assignment checks qualification, instrument verification, booking and access on the server.</p></PageIntro>
    <TaskList org={org} caseId={caseId} filter="all"/>
    {can("coordinate") ? <Suspense><Propose org={org} caseId={caseId}/></Suspense> : null}</main>;
}
