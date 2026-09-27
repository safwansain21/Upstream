"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TASK_TYPES } from "../../../../../components/tasks";
import { Term } from "../../../../../components/term";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useMe, useOrg } from "../../../../../lib/session";

type Member = { user_id: string; status: string; display_name: string; capabilities: string[]; qualifications: string[] };
/** Each capability in plain words; administration is listed last because it grants none of the others. */
/** "anchor_reading until 2028-01-01" -> "Anchor reading (until 1 Jan 2028)". */
const qualification = (q: string) => { const [type, until] = q.split(" until "); return `${TASK_TYPES[type] ?? type}${until ? ` (until ${new Date(until).toLocaleDateString(undefined, { dateStyle: "medium" })})` : ""}`; };
const CAPS: [string, string, string][] = [["coordinate", "Coordinate", "Create and run investigations, propose and assign tasks."], ["expert", "Expert", "Review evidence and approve or reopen assessments."],
  ["network_verify", "Network verify", "Check and publish local stream maps."], ["evidence_view", "Evidence view", "Read all evidence in this organization."],
  ["monitor", "Monitor", "Take field readings when qualified."], ["admin", "Admin", "Manage members and settings; grants no review rights."]];

export default function Organization() {
  const { org, can, membership } = useOrg(); const me = useMe().data?.user_id; const client = useQueryClient();
  const q = useQuery({ queryKey: ["members", org], enabled: can("admin"), queryFn: () => api<Member[]>(`/orgs/${org}/members`) });
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const [search, setSearch] = useState(""); const [chosen, setChosen] = useState("");
  async function call(path: string, json: unknown, message: string) {
    setError(""); setDone("");
    try { await api(path, { method: "POST", json }); setDone(message); client.invalidateQueries({ queryKey: ["members", org] }); } catch (e) { setError((e as Error).message); }
  }
  if (!can("admin")) return <main id="main-content" className="page-shell settings-page"><PageIntro title={membership?.name ?? "Organization"}/>
    <EmptyState title="Membership is managed by organization administrators" steps={[`Your capabilities here: ${membership?.capabilities.map(c => CAPS.find(([k]) => k === c)?.[1] ?? c).join(", ") || "contributor"}.`,
      "Ask an administrator if you need to coordinate, review evidence or take readings. Nobody can grant capabilities to themselves."]}/></main>;
  const rows = (q.data ?? []).filter(m => !search || m.display_name.toLowerCase().includes(search.toLowerCase()));
  const m = rows.find(x => x.user_id === chosen) ?? rows[0];
  const locked = !m || m.user_id === me || m.status !== "active" || reason.trim().length < 5;
  return <main id="main-content" className="page-shell settings-page"><PageIntro title="Organization members"><p>Capabilities are organization-scoped. Administration does not grant expert review or network verification by itself, and nobody can grant capabilities to themselves.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
    {q.error ? <InlineError>{q.error.message} <button type="button" className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading members…"/> : !q.data.length ? <EmptyState title="No members yet" steps={["People join through an invitation or by submitting their first report."]}/> :
    <div className="members-layout">
      <section className="members-list" aria-label="Members">
        <div className="form-field"><label htmlFor="member-search" className="visually-hidden">Search members</label><input id="member-search" type="search" placeholder="Search members by name" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <div className="table-scroll" role="region" aria-label="Member list" tabIndex={0}><table className="data-table compact"><thead><tr><th scope="col">Member</th><th scope="col">Status</th><th scope="col">Capabilities</th><th scope="col"><Term k="qualification">Qualifications</Term></th></tr></thead>
          <tbody>{rows.map(x => <tr key={x.user_id} className={x.user_id === m?.user_id ? "is-selected" : undefined}>
            <td><button type="button" className="row-button" aria-pressed={x.user_id === m?.user_id} onClick={() => setChosen(x.user_id)}>{x.display_name}{x.user_id === me ? " (you)" : ""}</button></td>
            <td><CaseStatus tone={x.status === "active" ? "accepted" : "warning"}>{x.status}</CaseStatus></td><td>{x.capabilities.length} enabled</td>
            <td>{x.qualifications.length ? x.qualifications.map(qualification).join(", ") : "—"}</td></tr>)}</tbody></table></div>
        <p className="muted">Showing {rows.length} of {q.data.length} members.</p></section>
      {m ? <aside className="surface member-detail" aria-labelledby="member-heading"><div className="member-head"><h2 id="member-heading">{m.display_name}{m.user_id === me ? " (you)" : ""}</h2><CaseStatus tone={m.status === "active" ? "accepted" : "warning"}>{m.status}</CaseStatus></div>
        <div className="form-field"><label htmlFor="reason">Reason for changes (recorded in the audit log)</label><textarea id="reason" rows={2} value={reason} onChange={e => setReason(e.target.value)}/>
          <p className="field-help">{m.user_id === me ? "You cannot change your own capabilities." : m.status !== "active" ? "Restore the membership before changing capabilities." : reason.trim().length < 5 ? "Write a short reason first; each change is recorded with your name, the time and the capabilities before and after." : "Each switch saves at once and is recorded with this reason."}</p></div>
        <ul className="capability-list" aria-label={`Capabilities for ${m.display_name}`}>{CAPS.map(([key, label, text]) => <li key={key}>
          <label className="switch-row"><span><strong>{label}</strong><span>{text}</span></span>
            <span className="switch"><input type="checkbox" role="switch" checked={m.capabilities.includes(key)} disabled={locked}
              onChange={e => call(`/orgs/${org}/members/${m.user_id}/capabilities`, { capability: key, grant: e.target.checked, reason }, `${label} ${e.target.checked ? "granted to" : "removed from"} ${m.display_name}.`)}/><span className="track" aria-hidden="true"/></span></label></li>)}</ul>
        {m.user_id !== me ? <div className="member-status"><button className={`button ${m.status === "active" ? "button-danger" : "button-outline"}`} disabled={reason.trim().length < 5}
          onClick={() => call(`/orgs/${org}/members/${m.user_id}/status`, { status: m.status === "active" ? "revoked" : "active", reason }, `Membership ${m.status === "active" ? "revoked" : "restored"}.`)}>{m.status === "active" ? "Revoke membership" : "Restore membership"}</button></div> : null}
      </aside> : null}
    </div>}
  </main>;
}
