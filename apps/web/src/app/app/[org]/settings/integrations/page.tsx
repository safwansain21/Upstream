"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Recipient = { id: string; name: string; method: string; verified: boolean };
type Key = { configured: boolean; key_id?: string; public_key_sha256?: string; note?: string };
type Status = Record<string, string>;

export default function Integrations() {
  const { org, can } = useOrg(); const client = useQueryClient();
  const recipients = useQuery({ queryKey: ["recipients", org], queryFn: () => api<Recipient[]>(`/orgs/${org}/recipients`) });
  const key = useQuery({ queryKey: ["signing-key"], queryFn: () => api<Key>("/signing-key") });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status") });
  const [name, setName] = useState(""); const [error, setError] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api(`/orgs/${org}/recipients`, { method: "POST", json: { name } }); setName(""); client.invalidateQueries({ queryKey: ["recipients", org] }); }
    catch (err) { setError((err as Error).message); }
  }
  return <main id="main-content" className="page-shell"><PageIntro title="Integrations"><p>Configured, unavailable and unsigned states are shown as they are. Citizens are never asked for API keys.</p></PageIntro>
    <section className="surface stack" aria-labelledby="providers-heading"><h2 id="providers-heading">Providers</h2>
      {status.error ? <InlineError>{status.error.message}</InlineError> : !status.data ? <LoadingState/> : <ul>
        <li>Optional AI assistance: <CaseStatus tone={status.data.ai === "configured" ? "accepted" : "neutral"}>{status.data.ai === "configured" ? "Configured · not verified" : "Unavailable: all work continues manually"}</CaseStatus></li>
        <li>Email: <CaseStatus>{status.data.email === "local_mail_catcher" ? "Local test inbox only" : status.data.email}</CaseStatus></li>
        <li>Background map: <CaseStatus>{process.env.NEXT_PUBLIC_MAP_STYLE_URL ? "Configured style" : "Not configured: plain background with Upstream data"}</CaseStatus></li></ul>}
    </section>
    <section className="surface stack" aria-labelledby="signing-heading"><h2 id="signing-heading">Package signing</h2>
      {key.error ? <InlineError>{key.error.message}</InlineError> : !key.data ? <LoadingState/> : key.data.configured
        ? <p><CaseStatus tone="accepted">Signing configured</CaseStatus> Key {key.data.key_id} · <span className="mono">SHA-256 {key.data.public_key_sha256}</span></p>
        : <p><CaseStatus>Unsigned</CaseStatus> {key.data.note}</p>}
    </section>
    <section className="surface stack" aria-labelledby="recipients-heading"><h2 id="recipients-heading">Recipients</h2>
      {recipients.error ? <InlineError>{recipients.error.message}</InlineError> : !recipients.data ? <LoadingState/> : !recipients.data.length
        ? <EmptyState title="No recipients configured"><p>Packages can still be exported and downloaded. Nothing is sent automatically.</p></EmptyState>
        : <ul>{recipients.data.map(r => <li key={r.id}>{r.name} · scoped portal link</li>)}</ul>}
      {can("admin") ? <form className="stack" onSubmit={add}>{error ? <InlineError>{error}</InlineError> : null}
        <div className="form-field"><label htmlFor="rname">Recipient organization or role</label><input id="rname" value={name} onChange={e => setName(e.target.value)}/></div>
        <p className="field-help">Recipients receive a scoped, expiring link to one package and can acknowledge it. Webhook delivery is not enabled in this deployment.</p>
        <button className="button button-outline" disabled={name.trim().length < 2}>Add recipient</button></form> : null}
    </section></main>;
}
