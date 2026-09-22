"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Calibration = { id: string; status: string; effective_from: string; effective_until: string | null; checked_at: string; reason: string; created_at: string };
type Instrument = { id: string; serial: string; model: string; capabilities: string[]; available: boolean; calibrations: Calibration[] };
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
    <div className="button-row">
      <div className="form-field"><label htmlFor={`${p}-status`}>Result</label><select id={`${p}-status`} value={status} onChange={e => setStatus(e.target.value)}><option value="pass">Pass</option><option value="fail">Fail</option><option value="indeterminate">Indeterminate</option></select></div>
      <div className="form-field"><label htmlFor={`${p}-from`}>Effective from</label><input id={`${p}-from`} type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}/></div>
      <div className="form-field"><label htmlFor={`${p}-until`}>Effective until (optional)</label><input id={`${p}-until`} type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}/></div>
    </div>
    <div className="form-field"><label htmlFor={`${p}-reason`}>Protocol and reason</label><input id={`${p}-reason`} value={reason} onChange={e => setReason(e.target.value)}/></div>
    <button className="button button-outline" disabled={reason.length < 10}>Record event</button></form>;
}

export default function Instruments() {
  const { org, can } = useOrg();
  const q = useQuery({ queryKey: ["instruments", org], queryFn: () => api<Instrument[]>(`/orgs/${org}/instruments`) });
  return <main id="main-content" className="page-shell"><PageIntro title="Instruments"><p>Calibration and verification events are append-only. A later event never silently rewrites what applied when a reading was taken.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>
      : !q.data ? <LoadingState/>
      : !q.data.length ? <EmptyState title="No instruments registered"><p>Administrators register meters with their specifications before field readings can be assigned.</p></EmptyState>
      : q.data.map(i => <section key={i.id} className="surface stack" aria-labelledby={`i-${i.id}`}><h2 id={`i-${i.id}`}><span className="mono">{i.serial}</span> · {i.model}</h2>
        <p><CaseStatus tone={i.available ? "accepted" : "warning"}>{i.available ? "Available" : "Unavailable"}</CaseStatus> {i.capabilities.join(", ")}</p>
        {i.calibrations.length ? <div className="table-scroll" role="region" aria-label={`${i.serial} calibration history`} tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Result</th><th scope="col">Effective</th><th scope="col">Checked</th><th scope="col">Reason</th></tr></thead>
          <tbody>{i.calibrations.map(c => <tr key={c.id}><td><CaseStatus tone={c.status === "pass" ? "accepted" : c.status === "fail" ? "error" : "warning"}>{c.status}</CaseStatus></td>
            <td>{new Date(c.effective_from).toLocaleDateString()} – {c.effective_until ? new Date(c.effective_until).toLocaleDateString() : "open"}</td><td>{new Date(c.checked_at).toLocaleString()} <span className="muted">(entered {new Date(c.created_at).toLocaleString()})</span></td><td>{c.reason}</td></tr>)}</tbody></table></div>
          : <p className="muted">No calibration history visible to you.</p>}
        {can("expert") ? <AddEvent org={org} instrument={i}/> : null}</section>)}</main>;
}
