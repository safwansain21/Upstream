"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api, download } from "../../../../../../lib/api";
import { useOrg } from "../../../../../../lib/session";

type Delivery = { id: string; recipient: string; state: string; delivered_at: string | null; attempts: number; acknowledged_at: string | null; acknowledged_by: string | null };
type Notice = { id: string; recipient: string; delivery_state: string; acknowledged_at: string | null; acknowledgment_actor: string | null };
type Package = { id: string; revision: number; manifest_hash: string; signing_status: string; created_at: string; assessment_status: string; artifacts: string[]; predecessor_id: string | null; deliveries: Delivery[]; notices: Notice[] };
type Hist = { id: string; revision: number; current: boolean };
type Recipient = { id: string; name: string; method: string };
type Job = { id: string; state: string; progress_stage: string; last_error: string | null };

function SendPanel({ org, pkg, recipients, onSent }: { org: string; pkg: Package; recipients: Recipient[]; onSent: () => void }) {
  const [rid, setRid] = useState(""); const [confirm, setConfirm] = useState(false); const [error, setError] = useState(""); const [link, setLink] = useState("");
  async function send() {
    setError(""); setLink("");
    try { const r = await api<{ share_path: string; attempts: number; revision_notice_id: string | null }>(`/orgs/${org}/packages/${pkg.id}/deliveries`, { method: "POST", json: { recipient_id: rid } });
      setLink(`${location.origin}${r.share_path}`); setConfirm(false); onSent(); }
    catch (e) { setError((e as Error).message); }
  }
  if (!recipients.length) return <p className="muted">No recipients are configured. An organization administrator adds them under Settings → Integrations.</p>;
  const name = recipients.find(r => r.id === rid)?.name;
  return <div className="stack" role="group" aria-label={`Send package revision ${pkg.revision}`}>{error ? <InlineError>{error}</InlineError> : null}
    <div className="form-field"><label htmlFor={`r-${pkg.id}`}>Recipient</label><select id={`r-${pkg.id}`} value={rid} onChange={e => setRid(e.target.value)}><option value="">Choose…</option>{recipients.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
    <label className="checkbox-field"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} disabled={!rid}/><span>I am explicitly sending this package{name ? ` to ${name}` : ""}.</span></label>
    <button className="button button-primary" disabled={!rid || !confirm} onClick={send}>Send package</button>
    {link ? <div className="notice" role="status"><p>Sent. Share this scoped link with the recipient now; it is shown only once and expires in 30 days.</p><p className="mono" style={{ overflowWrap: "anywhere" }}>{link}</p></div> : null}</div>;
}

export default function Exports() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>(); const client = useQueryClient();
  const allowed = can("expert") || can("coordinate") || can("evidence_view");
  const pkgs = useQuery({ queryKey: ["packages", org, caseId], enabled: allowed, queryFn: () => api<Package[]>(`/orgs/${org}/cases/${caseId}/packages`) });
  const hist = useQuery({ queryKey: ["assessments", org, caseId], enabled: allowed, queryFn: () => api<Hist[]>(`/orgs/${org}/cases/${caseId}/assessments`) });
  const recipients = useQuery({ queryKey: ["recipients", org], enabled: can("expert"), queryFn: () => api<Recipient[]>(`/orgs/${org}/recipients`) });
  const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState(""); const [verified, setVerified] = useState<Record<string, string>>({});
  const refresh = () => client.invalidateQueries({ queryKey: ["packages", org, caseId] });
  useEffect(() => {
    if (!job || job.state === "done" || job.state === "failed") return;
    const t = setTimeout(async () => { try { const next = await api<Job>(`/orgs/${org}/analyses/${job.id}`); setJob(next); if (next.state === "done") refresh(); } catch (e) { setError((e as Error).message); } }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, org]);
  const current = hist.data?.find(h => h.current);
  const packaged = new Set(pkgs.data?.map(p => p.revision));
  async function create() {
    setError("");
    try { setJob(await api<Job>(`/orgs/${org}/assessments/${current!.id}/exports`, { method: "POST" })); } catch (e) { setError((e as Error).message); }
  }
  async function verify(p: Package) {
    try { const r = await api<{ valid: boolean; signature_status?: string; reason?: string }>(`/orgs/${org}/packages/${p.id}/verify`);
      setVerified(v => ({ ...v, [p.id]: r.valid ? `Integrity verified · signature ${r.signature_status}` : `Verification failed: ${r.reason}` })); }
    catch (e) { setVerified(v => ({ ...v, [p.id]: (e as Error).message })); }
  }
  if (!allowed) return <main id="main-content" className="page-shell"><EmptyState title="Evidence packages are for the review team"><p>Recipients receive a scoped link from the reviewing expert.</p></EmptyState></main>;
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>Investigation overview</Link> / <span aria-current="page">Exports</span></nav>
    <PageIntro title="Evidence packages"><p>A package is an immutable record of one approved assessment. Creating it sends nothing; sending to a recipient is a separate, explicit action.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}
    <section className="surface stack" aria-labelledby="create-heading"><h2 id="create-heading">Create a package</h2>
      {hist.isPending ? <LoadingState/> : !current ? <p>No approved assessment yet. An expert approves an assessment on the Evidence tab before it can be packaged.</p>
        : packaged.has(current.revision) ? <p>Assessment {current.revision} is already packaged below. Packages are never regenerated.</p>
        : can("expert") || can("coordinate") ? <><button className="button button-primary" disabled={!!job && job.state !== "done" && job.state !== "failed"} onClick={create}>Create package for assessment {current.revision}</button>
          {job ? <p role="status" className="muted">{job.state === "done" ? "Package created." : job.state === "failed" ? `Export failed: ${job.last_error}` : `${job.progress_stage}…`}</p> : null}</> : null}
    </section>
    {pkgs.error ? <InlineError>{pkgs.error.message}</InlineError> : !pkgs.data ? <LoadingState/> : !pkgs.data.length ? <EmptyState title="No packages yet"/> :
      pkgs.data.map(p => <section key={p.id} className="surface stack" aria-labelledby={`p-${p.id}`}>
        <h2 id={`p-${p.id}`}>Assessment {p.revision} package</h2>
        <p><CaseStatus tone={p.assessment_status === "approved" ? "accepted" : "warning"}>{p.assessment_status === "approved" ? "Current" : p.assessment_status}</CaseStatus> <CaseStatus tone={p.signing_status === "signed" ? "accepted" : "neutral"}>{p.signing_status === "signed" ? "Signed (Ed25519)" : "Unsigned"}</CaseStatus> Created {new Date(p.created_at).toLocaleString()}{p.predecessor_id ? " · supersedes an earlier package" : ""}</p>
        <p className="mono" style={{ overflowWrap: "anywhere" }}>Manifest SHA-256 {p.manifest_hash}</p>
        <div className="button-row">{p.artifacts.map(name => <button key={name} className="button button-quiet" onClick={() => download(`/orgs/${org}/packages/${p.id}/artifacts/${name}`, name).catch(e => setError(e.message))}>Download {name}</button>)}</div>
        <div className="button-row"><button className="button button-outline" onClick={() => verify(p)}>Verify integrity</button>{verified[p.id] ? <p role="status">{verified[p.id]}</p> : null}</div>
        <h3>Deliveries</h3>
        {p.deliveries.length ? <div className="table-scroll" role="region" aria-label="Deliveries" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Recipient</th><th scope="col">Transport</th><th scope="col">Attempts</th><th scope="col">Human acknowledgment</th></tr></thead>
          <tbody>{p.deliveries.map(d => <tr key={d.id}><td>{d.recipient}</td><td>{d.state}{d.delivered_at ? ` · ${new Date(d.delivered_at).toLocaleString()}` : ""}</td><td className="numeric">{d.attempts}</td>
            <td>{d.acknowledged_at ? `${d.acknowledged_by} · ${new Date(d.acknowledged_at).toLocaleString()}` : "Not acknowledged"}</td></tr>)}</tbody></table></div> : <p className="muted">Not sent to anyone.</p>}
        {p.notices.length ? <><h3>Revision notices</h3><ul>{p.notices.map(n => <li key={n.id}>{n.recipient}: {n.delivery_state} · {n.acknowledged_at ? `acknowledged by ${n.acknowledgment_actor}` : "awaiting acknowledgment"}</li>)}</ul></> : null}
        {can("expert") && p.assessment_status === "approved" ? <SendPanel org={org} pkg={p} recipients={recipients.data ?? []} onSent={refresh}/> : null}
      </section>)}
  </main>;
}
