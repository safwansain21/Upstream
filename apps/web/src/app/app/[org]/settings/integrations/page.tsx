"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Recipient = { id: string; name: string; method: string; destination: string | null; verified: boolean; concerns: string[] };
type Delivery = { id: string; recipient: string; method: string; state: string; attempts: number; last_error: string | null; next_attempt_at: string | null };
const CONCERNS: [string, string][] = [["public_access", "Public access"], ["animal_access", "Animal access"], ["habitat", "Habitat"]];
type Key = { configured: boolean; key_id?: string; public_key_sha256?: string; note?: string };
type Status = Record<string, string>;

export default function Integrations() {
  const { org, can } = useOrg(); const client = useQueryClient();
  const recipients = useQuery({ queryKey: ["recipients", org], queryFn: () => api<Recipient[]>(`/orgs/${org}/recipients`) });
  const key = useQuery({ queryKey: ["signing-key"], queryFn: () => api<Key>("/signing-key") });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status") });
  const deliveries = useQuery({ queryKey: ["deliveries", org], enabled: can("admin"), queryFn: () => api<Delivery[]>(`/orgs/${org}/deliveries`) });
  const [name, setName] = useState(""); const [concerns, setConcerns] = useState<string[]>([]); const [error, setError] = useState("");
  const [destination, setDestination] = useState(""); const [secret, setSecret] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { const r = await api<{ signing_secret?: string }>(`/orgs/${org}/recipients`, { method: "POST", json: { name, concerns, ...(destination ? { method: "webhook", destination } : {}) } });
      setSecret(r.signing_secret ?? ""); setName(""); setDestination(""); setConcerns([]); client.invalidateQueries({ queryKey: ["recipients", org] }); }
    catch (err) { setError((err as Error).message); }
  }
  async function retry(id: string) {
    setError("");
    try { await api(`/orgs/${org}/deliveries/${id}/retry`, { method: "POST" }); client.invalidateQueries({ queryKey: ["deliveries", org] }); }
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
        : <ul>{recipients.data.map(r => <li key={r.id}>{r.name} · {r.method === "webhook" ? `signed webhook to ${r.destination}` : "scoped portal link"}{r.concerns.length ? ` · suggested for ${r.concerns.map(c => CONCERNS.find(x => x[0] === c)?.[1] ?? c).join(", ").toLowerCase()} context` : ""}</li>)}</ul>}
      {can("admin") ? <form className="stack" onSubmit={add}>{error ? <InlineError>{error}</InlineError> : null}
        <div className="form-field"><label htmlFor="rname">Recipient organization or role</label><input id="rname" value={name} onChange={e => setName(e.target.value)}/></div>
        <fieldset><legend>Suggest this recipient when a case has context layers for</legend>{CONCERNS.map(([id, label]) => <label key={id} className="checkbox-field">
          <input type="checkbox" checked={concerns.includes(id)} onChange={e => setConcerns(c => e.target.checked ? [...c, id] : c.filter(x => x !== id))}/><span>{label}</span></label>)}</fieldset>
        <div className="form-field"><label htmlFor="rdest">Webhook destination (optional)</label><input id="rdest" type="url" inputMode="url" placeholder="https://" value={destination} onChange={e => setDestination(e.target.value)} aria-describedby="rdest-help"/>
          <p className="field-help" id="rdest-help">HTTPS on port 443 to a public address only. Requests are signed (HMAC-SHA256); redirects are not followed.</p></div>
        {secret ? <p className="notice" role="status">Signing secret, shown once: <span className="mono">{secret}</span></p> : null}
        <p className="field-help">Every recipient also gets a scoped, expiring link to one package and can acknowledge it. A webhook response only confirms transport receipt.</p>
        <button className="button button-outline" disabled={name.trim().length < 2}>Add recipient</button></form> : null}
    </section>
    {can("admin") ? <section className="surface stack" aria-labelledby="deliveries-heading"><h2 id="deliveries-heading">Delivery status</h2>
      {deliveries.error ? <InlineError>{deliveries.error.message}</InlineError> : !deliveries.data ? <LoadingState/> : !deliveries.data.length ? <EmptyState title="Nothing sent yet"/>
        : <ul>{deliveries.data.map(d => <li key={d.id}>{d.recipient} · {d.state}{d.method === "webhook" ? ` · ${d.attempts} attempt(s)` : ""}{d.last_error ? ` · ${d.last_error}` : ""}
          {d.state === "queued" && d.next_attempt_at && d.attempts ? ` · next try ${new Date(d.next_attempt_at).toLocaleString()}` : ""}
          {d.state === "failed" ? <> <button type="button" className="button button-quiet" onClick={() => retry(d.id)}>Retry</button></> : null}</li>)}</ul>}
    </section> : null}</main>;
}
