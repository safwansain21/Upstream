"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useMe, useOrg } from "../../../../../lib/session";

type Member = { user_id: string; status: string; display_name: string; capabilities: string[]; qualifications: string[] };
const CAPS = ["coordinate", "expert", "network_verify", "evidence_view", "monitor", "admin"];

export default function Organization() {
  const { org, can, membership } = useOrg(); const me = useMe().data?.user_id; const client = useQueryClient();
  const q = useQuery({ queryKey: ["members", org], enabled: can("admin"), queryFn: () => api<Member[]>(`/orgs/${org}/members`) });
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState("");
  async function call(path: string, json: unknown, message: string) {
    setError(""); setDone("");
    try { await api(path, { method: "POST", json }); setDone(message); client.invalidateQueries({ queryKey: ["members", org] }); } catch (e) { setError((e as Error).message); }
  }
  if (!can("admin")) return <main id="main-content" className="page-shell"><PageIntro title={membership?.name ?? "Organization"}/>
    <EmptyState title="Membership is managed by organization administrators"><p>Your capabilities here: {membership?.capabilities.join(", ") || "contributor"}.</p></EmptyState></main>;
  return <main id="main-content" className="page-shell"><PageIntro title="Organization members"><p>Capabilities are organization-scoped. Administration does not grant expert review or network verification by itself, and nobody can grant capabilities to themselves.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}{done ? <p className="notice" role="status">{done}</p> : null}
    <div className="form-field"><label htmlFor="reason">Reason for changes (recorded in the audit log)</label><input id="reason" value={reason} onChange={e => setReason(e.target.value)}/></div>
    {q.error ? <InlineError>{q.error.message}</InlineError> : !q.data ? <LoadingState/> : !q.data.length ? <EmptyState title="No members"/> :
      <div className="table-scroll" role="region" aria-label="Members" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Member</th><th scope="col">Status</th><th scope="col">Capabilities</th><th scope="col">Qualifications</th><th scope="col">Membership</th></tr></thead>
        <tbody>{q.data.map(m => <tr key={m.user_id}><td>{m.display_name}{m.user_id === me ? " (you)" : ""}</td><td><CaseStatus tone={m.status === "active" ? "accepted" : "warning"}>{m.status}</CaseStatus></td>
          <td>{CAPS.map(c => <label key={c} className="checkbox-field"><input type="checkbox" checked={m.capabilities.includes(c)} disabled={m.user_id === me || m.status !== "active" || reason.length < 5}
            onChange={e => call(`/orgs/${org}/members/${m.user_id}/capabilities`, { capability: c, grant: e.target.checked, reason }, `${c} ${e.target.checked ? "granted to" : "removed from"} ${m.display_name}.`)}/><span>{c}</span></label>)}</td>
          <td>{m.qualifications.length ? m.qualifications.join(", ") : "—"}</td>
          <td>{m.user_id === me ? "—" : <button className="button button-quiet" disabled={reason.length < 5} onClick={() => call(`/orgs/${org}/members/${m.user_id}/status`, { status: m.status === "active" ? "revoked" : "active", reason }, `Membership ${m.status === "active" ? "revoked" : "restored"}.`)}>{m.status === "active" ? "Revoke membership" : "Restore membership"}</button>}</td></tr>)}</tbody></table></div>}
  </main>;
}
