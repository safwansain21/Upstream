"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "../../../components/app-header";
import { DocIcon, LayersIcon, LockIcon, QuestionIcon, TargetIcon } from "../../../components/icons";
import { EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../components/ui";
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
    const v = q.data; const [label] = BANNERS[v.banner];
    const acked = v.revision_notice ? v.revision_notice.acknowledged_at : v.delivery?.acknowledged_at;
    const kind = (f: string) => f.endsWith(".pdf") ? "Report (PDF)" : f.endsWith(".html") ? "Report (web page)" : f.endsWith(".geojson") ? "Map data" : f.endsWith(".fhir.json") ? "FHIR R4 bundle" : f.endsWith(".jws") ? "Signature" : f.endsWith(".json") ? "Data (JSON)" : "File";
    body = <div className="share-layout">
      <div className="share-main">
        <section className="surface share-conclusion" aria-labelledby="conclusion-heading"><div className="share-meta"><h2 id="conclusion-heading" className="eyebrow">Reviewed conclusion</h2>
          <span><OriginBadge origin={v.data_origin}/></span><span>Assessment {v.assessment_version}</span><span>Reviewed {new Date(v.reviewed_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span></div>
          <p className="share-statement">{v.conclusion}</p><p className="muted">{v.case_scope}</p>
          {v.data_origin !== "real" ? <p className="share-caution">This is example data. It does not describe a real place or a confirmed event.</p> : null}</section>
        <section className="surface share-shows" aria-labelledby="shows-heading"><h2 id="shows-heading" className="eyebrow">What this does and does not show</h2>
          <div className="share-columns"><div><h3><DocIcon size={30}/>Limitations</h3><ul>{v.limitations.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div><h3><LayersIcon size={30}/>Assumptions</h3><ul>{v.assumptions.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div><h3><QuestionIcon size={30}/>Unknowns</h3>{v.unknowns.length ? <ul>{v.unknowns.map(x => <li key={x}>{x}</li>)}</ul> : <p>None listed.</p>}</div>
            <div><h3><TargetIcon size={30}/>Next action</h3><p>{v.next_action}</p></div></div></section>
        <section className="surface share-files" aria-labelledby="files-heading"><h2 id="files-heading" className="eyebrow">Files in this package</h2>
          <ul className="share-file-list">{v.artifacts.map(a => <li key={a}><a className="text-link" href={`/api/v1/share/${token}/artifacts/${a}`} download>{a}</a><span>{kind(a)}</span></li>)}</ul>
          <div className="manifest"><span className="manifest-label">Manifest SHA-256</span><code className="mono">{v.manifest_hash}</code></div>
          <p className="muted">{v.signing_status === "signed" ? <>Signed with a detached Ed25519 signature. Verify with the organization’s <a className="text-link" href="/api/v1/signing-key">published public key</a>, obtained independently. A valid signature proves integrity and origin, not scientific correctness.</> : "This package is unsigned. Its manifest lists a SHA-256 hash for every file."}</p></section>
      </div>
      <aside className="share-aside">
        <section className={`surface share-status is-${v.banner}`} aria-label="Package status"><p role="status"><strong><LockIcon size={22}/>{v.banner === "current" ? "Current package" : label}</strong></p>
          <p className="muted">{v.banner === "current" ? "You are viewing the latest package shared with you." : null}{v.replacement_available ? " The sending organization has issued a replacement package; use the newer link they sent you." : ""}</p>
          <p className="muted">You can open only this one package.</p></section>
        <section className="surface" aria-labelledby="details-heading"><h2 id="details-heading" className="eyebrow">Package details</h2>
          <dl className="map-facts"><div><dt>Assessment</dt><dd>{v.assessment_version}</dd></div><div><dt>Reviewed</dt><dd>{new Date(v.reviewed_at).toLocaleString()}</dd></div>
            <div><dt>Link valid until</dt><dd>{new Date(v.expires_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd></div><div><dt>Signature</dt><dd>{v.signing_status === "signed" ? "Ed25519" : "Unsigned"}</dd></div></dl></section>
        <section className="surface stack" aria-labelledby="ack-heading"><h2 id="ack-heading" className="eyebrow">Acknowledge {v.revision_notice ? "this revision" : "receipt"}</h2>
          {acked ? <p role="status" className="share-acked">Acknowledged{v.delivery?.acknowledged_by ? ` by ${v.delivery.acknowledged_by}` : ""}. Thank you.</p> :
            <form className="stack" onSubmit={acknowledge}>{error ? <InlineError>{error}</InlineError> : null}
              <p className="muted">This records that a person at your organization has read {v.revision_notice ? "this revision notice" : "this package"}. Delivery of the link alone is not an acknowledgment, and acknowledging is not agreement.</p>
              <div className="form-field"><label htmlFor="ack-name">Your name or role</label><input id="ack-name" value={name} onChange={e => setName(e.target.value)}/></div>
              <button className="button button-primary" disabled={name.trim().length < 2}>Acknowledge</button></form>}
          {done ? <p className="visually-hidden" role="status">Acknowledgment recorded.</p> : null}</section>
      </aside>
    </div>;
  }
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro eyebrow="Shared with you" title="Shared evidence package"><p>The sending organization shared one specific package with you. You can read and download it here; you cannot browse other records.</p></PageIntro>{body}</main></>;
}
