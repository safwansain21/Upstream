"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Calibration = { id: string; status: string; effective_from: string; effective_until: string | null; checked_at: string; reason: string; created_at: string };
type Instrument = { id: string; serial: string; model: string; capabilities: string[]; available: boolean; calibrations: Calibration[] };
const RESULTS: [string, string][] = [["pass", "Pass"], ["fail", "Fail"], ["indeterminate", "Indeterminate"]];
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function AddEvent({ org, instrument }: { org: string; instrument: Instrument }) {
  const client = useQueryClient();
  const [status, setStatus] = useState("pass"); const [from, setFrom] = useState(local(new Date())); const [until, setUntil] = useState("");
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [saved, setSaved] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSaved("");
    try {
      await api(`/orgs/${org}/instruments/${instrument.id}/calibrations`, { method: "POST", json: { status, reason, checked_at: new Date().toISOString(),
        effective_from: new Date(from).toISOString(), effective_until: until ? new Date(until).toISOString() : null } });
      setSaved("Event recorded. Earlier readings keep the calibration that applied when they were measured."); setReason(""); client.invalidateQueries({ queryKey: ["instruments", org] });
    } catch (err) { setError((err as Error).message); }
  }
  const p = `cal-${instrument.serial}`;
  return <form className="stack" onSubmit={save} aria-label={`Record calibration or verification for ${instrument.serial}`}>
    {error ? <InlineError>{error}</InlineError> : null}{saved ? <p className="notice" role="status">{saved}</p> : null}
    <fieldset className="result-choice"><legend>Result</legend>{RESULTS.map(([value, label]) => <label key={value} className={`result-option result-${value}`}>
      <input type="radio" name={`${p}-status`} value={value} checked={status === value} onChange={() => setStatus(value)}/><span className="dot" aria-hidden="true"/>{label}</label>)}</fieldset>
    <div className="form-grid"><div className="form-field"><label htmlFor={`${p}-from`}>Effective from</label><input id={`${p}-from`} type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}/></div>
      <div className="form-field"><label htmlFor={`${p}-until`}>Effective until (optional)</label><input id={`${p}-until`} type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}/></div></div>
    <div className="form-field"><label htmlFor={`${p}-reason`}>Protocol and reason</label><textarea id={`${p}-reason`} rows={3} value={reason} onChange={e => setReason(e.target.value)}/><p className="field-help">Name the protocol and why, for example “COND-001 v2, routine field verification”.</p></div>
    <button className="button button-primary" disabled={reason.length < 10}>Record event</button></form>;
}

export default function Instruments() {
  const { org, can } = useOrg();
  const q = useQuery({ queryKey: ["instruments", org], queryFn: () => api<Instrument[]>(`/orgs/${org}/instruments`) });
  const [chosen, setChosen] = useState("");
  const list = q.data ?? []; const i = list.find(x => x.id === chosen) ?? list[0];
  return <main id="main-content" className="page-shell settings-page"><PageIntro title="Instruments"><p>Calibration and verification events are append-only. A later event never silently rewrites what applied when a reading was taken.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>
      : !q.data ? <LoadingState label="Loading instruments…"/>
      : !i ? <EmptyState title="No instruments registered" steps={["Administrators register meters with their specifications before field readings can be assigned.", "Each meter then needs a passing calibration that covers the task's time window."]}/>
      : <>{list.length > 1 ? <div className="tab-nav" role="tablist" aria-label="Instruments">{list.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === i.id} onClick={() => setChosen(x.id)}><span className="mono">{x.serial}</span></button>)}</div> : null}
        <div className="instrument-layout">
          <section className="surface stack" aria-labelledby={`i-${i.id}`}><div className="member-head"><h2 id={`i-${i.id}`}>{i.model}</h2><CaseStatus tone={i.available ? "accepted" : "warning"}>{i.available ? "Available" : "Unavailable"}</CaseStatus></div>
            <dl className="map-facts"><div><dt>Serial number</dt><dd className="mono">{i.serial}</dd></div><div><dt>Model</dt><dd>{i.model}</dd></div><div><dt>Measures</dt><dd>{i.capabilities.join(", ") || "Not recorded"}</dd></div>
              <div><dt>Latest event</dt><dd>{i.calibrations[0] ? `${i.calibrations[0].status}, effective ${day(i.calibrations[0].effective_from)}${i.calibrations[0].effective_until ? ` until ${day(i.calibrations[0].effective_until)}` : ""}` : "None recorded"}</dd></div></dl>
            <h3>Calibration and verification history</h3>
            {i.calibrations.length ? <div className="table-scroll" role="region" aria-label={`${i.serial} calibration history`} tabIndex={0}><table className="data-table compact"><thead><tr><th scope="col">Result</th><th scope="col">Effective from</th><th scope="col">Effective until</th><th scope="col">Checked</th><th scope="col">Protocol and reason</th></tr></thead>
              <tbody>{i.calibrations.map(c => <tr key={c.id}><td><span className={`quality quality-${c.status === "pass" ? "accepted" : c.status === "fail" ? "excluded" : "pending"}`}><span className="dot" aria-hidden="true"/>{RESULTS.find(([v]) => v === c.status)?.[1] ?? c.status}</span></td>
                <td>{day(c.effective_from)}</td><td>{c.effective_until ? day(c.effective_until) : "Open"}</td><td>{day(c.checked_at)}<span className="cell-note">entered {new Date(c.created_at).toLocaleString()}</span></td><td>{c.reason}</td></tr>)}</tbody></table></div>
              : <p className="muted">No calibration history visible to you.</p>}</section>
          {can("expert") ? <aside className="surface stack" aria-label="Record an event"><h2>Record verification event</h2><p className="muted">Add a new calibration or verification event for this instrument.</p><AddEvent key={i.id} org={org} instrument={i}/></aside>
            : <aside className="surface stack"><h2>Recording events</h2><p className="muted">Experts record calibration and verification events. Readings use the calibration that applied when they were measured.</p></aside>}
        </div></>}</main>;
}
