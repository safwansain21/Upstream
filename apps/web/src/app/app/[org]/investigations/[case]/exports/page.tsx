"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, PageIntro } from "../../../../../../components/ui";
import { api, download } from "../../../../../../lib/api";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { useOrg } from "../../../../../../lib/session";

type Delivery = { id: string; recipient: string; state: string; delivered_at: string | null; attempts: number; acknowledged_at: string | null; acknowledged_by: string | null };
type Notice = { id: string; recipient: string; delivery_state: string; acknowledged_at: string | null; acknowledgment_actor: string | null };
type Package = { id: string; revision: number; manifest_hash: string; signing_status: string; created_at: string; assessment_status: string; artifacts: string[]; predecessor_id: string | null; deliveries: Delivery[]; notices: Notice[] };
type Hist = { id: string; revision: number; current: boolean };
type Recipient = { id: string; name: string; method: string };
type Job = { id: string; state: string; progress_stage: string; last_error: string | null };

/** What each artifact holds, in plain words (names come from the package builder). */
const ARTIFACTS: Record<string, string> = {
  "report.pdf": "Summary report for people to read", "assessment.json": "The assessment and its stated assumptions", "observations.json": "Reports and readings the assessment used",
  "evidence.geojson": "Stations and reaches as map data", "bundle.fhir.json": "FHIR R4 bundle for health information systems", "manifest.json": "List of every file and its hash", "manifest.jws": "Signature over the manifest", "report.html": "Summary report as a web page",
};
const kind = (name: string) => name.endsWith(".fhir.json") ? "FHIR" : (name.split(".").pop() ?? "").toUpperCase();
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function SendPanel({ org, pkg, recipients, onSent }: { org: string; pkg: Package; recipients: Recipient[]; onSent: () => void }) {
  const [rid, setRid] = useState(""); const [confirm, setConfirm] = useState(false); const [error, setError] = useState(""); const [link, setLink] = useState("");
  async function send() {
    setError(""); setLink("");
    try { const r = await api<{ share_path: string; attempts: number; revision_notice_id: string | null }>(`/orgs/${org}/packages/${pkg.id}/deliveries`, { method: "POST", json: { recipient_id: rid } });
      setLink(`${location.origin}${r.share_path}`); setConfirm(false); onSent(); }
    catch (e) { setError((e as Error).message); }
  }
  if (!recipients.length) return <p className="muted">No recipients are set up yet. An organization administrator adds them under Settings → Integrations.</p>;
  const name = recipients.find(r => r.id === rid)?.name;
  return <div className="stack" role="group" aria-label={`Send package revision ${pkg.revision}`}>{error ? <InlineError>{error}</InlineError> : null}
    <div className="form-field"><label htmlFor={`r-${pkg.id}`}>Recipient</label><select id={`r-${pkg.id}`} value={rid} onChange={e => setRid(e.target.value)}><option value="">Select a recipient…</option>{recipients.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
    <label className="checkbox-field"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} disabled={!rid}/><span>I am explicitly sending this package{name ? ` to ${name}` : ""}.</span></label>
    <button className="button button-primary send-button" disabled={!rid || !confirm} onClick={send}>Send package</button>
    {link ? <div className="notice" role="status"><p>Sent. Share this scoped link with the recipient now; it is shown only once and expires in 30 days.</p><p className="mono" style={{ overflowWrap: "anywhere" }}>{link}</p></div> : null}</div>;
}

/** Created → delivered → acknowledged, lit only by the recorded state (delivery and a person's acknowledgment are distinct). */
function Lifecycle({ pkg }: { pkg: Package }) {
  const delivered = pkg.deliveries.some(d => d.delivered_at), acknowledged = pkg.deliveries.some(d => d.acknowledged_at);
  const steps: [string, string, boolean][] = [["Created", pkg.signing_status === "signed" ? "Assembled and signed" : "Assembled, unsigned", true],
    ["Delivered", delivered ? "Sent to a recipient" : "Not sent yet", delivered], ["Acknowledged", acknowledged ? "Confirmed by a person" : "No person has confirmed yet", acknowledged]];
  const reached = acknowledged ? 2 : delivered ? 1 : 0;
  return <ol className="package-lifecycle" aria-label="Package lifecycle" style={{ "--reached": reached } as React.CSSProperties}>
    {steps.map(([label, note, done]) => <li key={label} className={done ? "is-done" : undefined}><span className="life-dot" aria-hidden="true"/><strong>{label}</strong><span>{note}</span></li>)}</ol>;
}

export default function Exports() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>(); const client = useQueryClient();
  const allowed = can("expert") || can("coordinate") || can("evidence_view");
  const pkgs = useQuery({ queryKey: ["packages", org, caseId], enabled: allowed, queryFn: () => api<Package[]>(`/orgs/${org}/cases/${caseId}/packages`) });
  const hist = useQuery({ queryKey: ["assessments", org, caseId], enabled: allowed, queryFn: () => api<Hist[]>(`/orgs/${org}/cases/${caseId}/assessments`) });
  const recipients = useQuery({ queryKey: ["recipients", org], enabled: can("expert"), queryFn: () => api<Recipient[]>(`/orgs/${org}/recipients`) });
  const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState(""); const [verified, setVerified] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState(""); const [copied, setCopied] = useState(false);
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
  if (!allowed) return <main id="main-content" className="page-shell case-page"><CaseHeader caseId={caseId} current="exports"/>
    <EmptyState title="Evidence packages are for the review team" steps={["Once an expert approves an assessment, it can be packaged as a signed, unchangeable record.", "Recipients receive a scoped link from the reviewing expert; your reports are part of what they see, without your name."]}/></main>;
  const list = [...(pkgs.data ?? [])].sort((a, b) => b.revision - a.revision);
  const p = list.find(x => x.id === chosen) ?? list[0];
  const canCreate = can("expert") || can("coordinate");

  return <main id="main-content" className="page-shell case-page packages-page">
    <CaseHeader caseId={caseId} current="exports"/>
    <PageIntro title="Evidence packages"><p>One approved assessment, one immutable package. Creating it sends nothing; sending to a recipient is a separate, explicit action.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}
    {hist.isPending || !current ? null
      : packaged.has(current.revision) ? null
      : canCreate ? <div className="package-create callout"><span aria-hidden="true"/><div><strong>Assessment {current.revision} is approved and not yet packaged.</strong>
          <div className="button-row"><button className="button button-primary" disabled={!!job && job.state !== "done" && job.state !== "failed"} onClick={create}>Create package for assessment {current.revision}</button>
          {job ? <p role="status" className="muted">{job.state === "done" ? "Package created." : job.state === "failed" ? `Export failed: ${job.last_error}` : `${job.progress_stage}…`}</p> : null}</div></div></div>
      : <p className="package-create muted">Assessment {current.revision} is approved; an expert or coordinator creates its package.</p>}
    {pkgs.error ? <InlineError>{pkgs.error.message} <button type="button" className="button button-quiet" onClick={() => pkgs.refetch()}>Retry</button></InlineError> : !pkgs.data ? <LoadingState label="Loading packages…"/>
    : !p ? <EmptyState title="No packages yet" steps={!current ? ["No approved assessment yet. An expert approves an assessment on the Evidence tab before it can be packaged.", "Creating a package later sends nothing; sending is a separate, explicit step."]
        : canCreate ? ["Package the approved assessment above; nothing is sent when you create it.", "Then choose a recipient and send it deliberately."] : ["Packages appear here once an approved assessment is packaged."]}/>
    : <>
      <Lifecycle pkg={p}/>
      {list.length > 1 ? <div className="tab-nav package-picker" role="tablist" aria-label="Packages">{list.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === p.id} onClick={() => setChosen(x.id)}>
        <span className={`version-dot ${x.assessment_status === "approved" ? "current" : ""}`} aria-hidden="true"/>Assessment {x.revision}{x.assessment_status === "approved" ? " · current" : ""}</button>)}</div> : null}
      <div className="packages-layout">
        <section className="surface stack package-card" aria-labelledby={`p-${p.id}`}>
          <div className="package-head"><div><h2 id={`p-${p.id}`}>Assessment {p.revision} package</h2>
            <p className="muted">{p.assessment_status === "approved" ? <span className="package-current">Current · </span> : <CaseStatus tone="warning">{p.assessment_status}</CaseStatus>} Created {stamp(p.created_at)}{p.predecessor_id ? " · supersedes an earlier package" : ""}</p></div>
            <CaseStatus tone={p.signing_status === "signed" ? "accepted" : "neutral"}>{p.signing_status === "signed" ? "Signed (Ed25519)" : "Unsigned"}</CaseStatus></div>
          <div className="manifest"><span className="manifest-label">Manifest (SHA-256)</span><div className="manifest-row"><code className="mono">{p.manifest_hash}</code>
            <button type="button" className="button button-outline button-small" onClick={() => navigator.clipboard?.writeText(p.manifest_hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined)}>{copied ? "Copied" : "Copy"}</button></div></div>
          <div className="table-scroll" role="region" aria-label="Package artifacts" tabIndex={0}><table className="data-table compact artifact-table"><thead><tr><th scope="col">Artifact</th><th scope="col">Type</th><th scope="col"><span className="visually-hidden">Download</span></th></tr></thead>
            <tbody>{p.artifacts.map(name => <tr key={name}><td><span className="artifact-name">{name}</span><span className="cell-note">{ARTIFACTS[name] ?? "Package file"}</span></td><td>{kind(name)}</td>
              <td><button className="button button-quiet button-small" aria-label={`Download ${name}`} onClick={() => download(`/orgs/${org}/packages/${p.id}/artifacts/${name}`, name).catch(e => setError(e.message))}>Download</button></td></tr>)}</tbody></table></div>
          <div className="package-verify"><button className="button button-outline" onClick={() => verify(p)}>Verify integrity</button>{verified[p.id] ? <p role="status">{verified[p.id]}</p> : <p className="muted">Checks every file against the signed manifest.</p>}</div>
          <p className="package-note">This package records observations and analysis. Observations and readings do not show where a change came from, or that the water is fine.</p>
        </section>
        <aside className="packages-aside">
          {can("expert") && p.assessment_status === "approved" ? <section className="surface stack" aria-labelledby="send-heading"><h2 id="send-heading">Send this package</h2><p className="muted">Creating a package does not send it. Choose a recipient and send it intentionally.</p>
            <SendPanel org={org} pkg={p} recipients={recipients.data ?? []} onSent={refresh}/></section>
            : <section className="surface stack"><h2>Sending</h2><p className="muted">{p.assessment_status === "approved" ? "The reviewing expert sends packages to recipients." : "Only the current package can be sent. Recipients of earlier packages receive a revision notice."}</p></section>}
          <section className="surface stack" aria-labelledby="ledger-heading"><h2 id="ledger-heading">Delivery ledger</h2>
            {p.deliveries.length ? <div className="table-scroll" role="region" aria-label="Deliveries" tabIndex={0}><table className="data-table compact"><thead><tr><th scope="col">Recipient</th><th scope="col">Transport</th><th scope="col" className="numeric">Attempts</th><th scope="col">Human acknowledgment</th></tr></thead>
              <tbody>{p.deliveries.map(d => <tr key={d.id}><td>{d.recipient}</td><td>{d.state}{d.delivered_at ? <span className="cell-note">{stamp(d.delivered_at)}</span> : null}</td><td className="numeric">{d.attempts}</td>
                <td className={d.acknowledged_at ? "is-ready" : "is-missing"}>{d.acknowledged_at ? <span className="review-state"><span className="check-mark" aria-hidden="true"/>{d.acknowledged_by} · {stamp(d.acknowledged_at)}</span> : "Not acknowledged"}</td></tr>)}</tbody></table></div>
              : <p className="muted">Not sent to anyone.</p>}
            {p.notices.length ? <div className="map-review-group"><h3>Revision notices</h3><ul>{p.notices.map(n => <li key={n.id}>{n.recipient}: {n.delivery_state} · {n.acknowledged_at ? `acknowledged by ${n.acknowledgment_actor}` : "awaiting acknowledgment"}</li>)}</ul></div> : null}
          </section>
        </aside>
      </div>
    </>}
  </main>;
}
