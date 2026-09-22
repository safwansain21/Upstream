"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "../../../components/app-header";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../components/ui";
import { api, ApiError } from "../../../lib/api";

type View = { banner: "current" | "superseded" | "under_review"; replacement_available: boolean; manifest_hash: string; signing_status: string; artifacts: string[];
  conclusion: string; case_scope: string; data_origin: string; retained_length_km: string; limitations: string[]; assumptions: string[]; unknowns: string[];
  next_action: string; assessment_version: string; reviewed_at: string; expires_at: string;
  delivery: { acknowledged_at: string | null; acknowledged_by: string | null } | null; revision_notice: { id: string; acknowledged_at: string | null } | null };

const BANNERS = { current: ["Current package", "accepted"], under_review: ["Under review: evidence behind this package changed; a revision may follow", "warning"],
  superseded: ["Superseded: a newer assessment replaces this package", "warning"] } as const;

export default function SharedPackage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({ queryKey: ["share", token], retry: false, queryFn: () => api<View>(`/share/${token}`) });
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  async function acknowledge(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api(`/share/${token}/acknowledge`, { method: "POST", json: { name } }); setDone(true); q.refetch(); } catch (err) { setError((err as Error).message); }
  }
  let body;
  if (q.error) body = (q.error as ApiError).status === 404 ? <EmptyState title="This link is no longer available"><p>It may have expired or been withdrawn. Ask the sending organization for a current link.</p></EmptyState> : <InlineError>{q.error.message}</InlineError>;
  else if (!q.data) body = <LoadingState label="Opening the shared package…"/>;
  else {
    const v = q.data; const [label, tone] = BANNERS[v.banner];
    const acked = v.revision_notice ? v.revision_notice.acknowledged_at : v.delivery?.acknowledged_at;
    body = <>
      <p className="notice" role="status"><CaseStatus tone={tone}>{label}</CaseStatus>{v.replacement_available ? " The sending organization has issued a replacement package; use the newer link they sent you." : ""}</p>
      <section className="surface stack"><h2>Reviewed conclusion</h2><p>{v.conclusion}</p><p><OriginBadge origin={v.data_origin}/> Assessment {v.assessment_version}, reviewed {new Date(v.reviewed_at).toLocaleString()}</p><p className="muted">{v.case_scope}</p></section>
      <section className="surface stack"><h2>What this does and does not show</h2><h3>Limitations</h3><ul>{v.limitations.map(x => <li key={x}>{x}</li>)}</ul>
        <h3>Assumptions</h3><ul>{v.assumptions.map(x => <li key={x}>{x}</li>)}</ul>{v.unknowns.length ? <><h3>Unknowns</h3><ul>{v.unknowns.map(x => <li key={x}>{x}</li>)}</ul></> : null}
        <h3>Next action</h3><p>{v.next_action}</p></section>
      <section className="surface stack"><h2>Files</h2><ul>{v.artifacts.map(a => <li key={a}><a className="text-link" href={`/api/v1/share/${token}/artifacts/${a}`} download>{a}</a></li>)}</ul>
        <p className="mono" style={{ overflowWrap: "anywhere" }}>Manifest SHA-256 {v.manifest_hash}</p>
        <p>{v.signing_status === "signed" ? <>Signed with a detached Ed25519 signature. Verify with the organization’s <a className="text-link" href="/api/v1/signing-key">published public key</a>, obtained independently. A valid signature proves integrity and origin, not scientific correctness.</> : "This package is unsigned. Its manifest lists a SHA-256 hash for every file."}</p></section>
      <section className="surface stack"><h2>Acknowledge {v.revision_notice ? "this revision" : "receipt"}</h2>
        {acked ? <p role="status">Acknowledged{v.delivery?.acknowledged_by ? ` by ${v.delivery.acknowledged_by}` : ""}. Thank you.</p> :
          <form className="stack" onSubmit={acknowledge}>{error ? <InlineError>{error}</InlineError> : null}
            <p>Acknowledging records that a person at your organization has read {v.revision_notice ? "this revision notice" : "this package"}. Delivery of the link alone is not an acknowledgment.</p>
            <div className="form-field"><label htmlFor="ack-name">Your name or role</label><input id="ack-name" value={name} onChange={e => setName(e.target.value)}/></div>
            <button className="button button-primary" disabled={name.trim().length < 2}>Acknowledge</button></form>}
        {done ? <p className="visually-hidden" role="status">Acknowledgment recorded.</p> : null}
        <p className="muted">Link valid until {new Date(v.expires_at).toLocaleDateString()}.</p></section>
    </>;
  }
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="Shared evidence package"><p>You are viewing one package shared with your organization. You cannot browse other records.</p></PageIntro>{body}</main></>;
}
