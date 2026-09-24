"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Arrow } from "../../../../../components/brand";
import { DocumentTitle } from "../../../../../components/document-title";
import { CalendarIcon, LockIcon, PhotoIcon, PinIcon } from "../../../../../components/icons";
import { ReceiptHistory } from "../../../../../components/receipts";
import { Timeline } from "../../../../../components/timeline";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge } from "../../../../../components/ui";
import { api, type ApiError } from "../../../../../lib/api";
import { WORKFLOW } from "../../../../../lib/labels";
import { useOrg } from "../../../../../lib/session";

type Report = { id: string; case_id: string; case_title: string; workflow: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; public_visibility: boolean; version: number; data_origin: string; created_at: string; versions: { version: number; created_at: string; change_reason: string | null }[]; media: { id: string; width: number; height: number; consent_original: boolean }[] };
const LABELS: Record<string, string> = { unusual_foam: "Unusual foam", colour_change: "Change in colour", odour: "Odour noticed", dead_wildlife: "Dead wildlife", visible_discharge: "Visible discharge", habitat_access: "Habitat or access concern", other: "Something else" };

function Receipt() {
  const { org } = useOrg(); const { report } = useParams<{ report: string }>();
  const client = useQueryClient(); const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["report", org, report], queryFn: () => api<Report>(`/orgs/${org}/reports/${report}`) });
  async function toggleVisibility(r: Report) {
    setError("");
    try { await api(`/orgs/${org}/reports/${r.id}/visibility`, { method: "POST", json: { expected_version: r.version, public_visibility: !r.public_visibility } }); client.invalidateQueries({ queryKey: ["report", org, report] }); }
    catch (e) { setError((e as Error).message); }
  }
  if (q.error) return (q.error as ApiError).status === 404
    ? <EmptyState title="Report not found" steps={["It may not exist, or it belongs to someone else.", "Your own reports are listed under Community → Your contributions."]} action={<Link className="button button-outline" href={`/app/${org}/community`}>Your contributions</Link>}/>
    : <InlineError>{q.error.message} <button type="button" className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError>;
  if (!q.data) return <LoadingState/>;
  const r = q.data;
  const reviewed = !["reported", "triage"].includes(r.workflow);
  return <div className="receipt stack-loose">
    <Timeline label="What happens to your report" steps={[
      { title: "Received", detail: "Your report has been submitted.", state: "done" },
      { title: "Linked investigation", detail: `Added to “${r.case_title}”.`, state: "done" },
      { title: "Coordinator review", detail: reviewed ? `Reviewed · ${WORKFLOW[r.workflow] ?? r.workflow}.` : "The team is reviewing your observation.", state: reviewed ? "done" : "current" },
      { title: "Follow-up", detail: "We may reach out if more information is needed.", state: "pending" }]}/>
    <div className="receipt-grid">
      <section className="surface" aria-labelledby="reported-h"><h2 id="reported-h">What you reported</h2>
        <p className="receipt-quote">{r.description || (r.categories.map(c => LABELS[c] ?? c).join(", ") || "No description")}</p>
        {r.categories.length && r.description ? <p className="subtle small">{r.categories.map(c => LABELS[c] ?? c).join(" · ")}</p> : null}
        <dl className="receipt-facts">
          <div className="icon-line"><CalendarIcon/><div><dt>Observed</dt><dd>{new Date(r.observed_at).toLocaleString()} ({r.timezone})</dd></div></div>
          <div className="icon-line"><PinIcon/><div><dt>Location</dt><dd>{r.latitude === null ? `Location to be confirmed: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}`}</dd></div></div>
          <div className="icon-line"><PhotoIcon/><div><dt>Photos</dt><dd>{r.media.length ? `${r.media.length} ${r.media.length === 1 ? "photo" : "photos"} attached. Location data embedded in photos was removed from shared copies${r.media.some(m => m.consent_original) ? "; originals are kept privately for the review team" : ""}.` : "No photos attached."}</dd></div></div>
        </dl>
        <p className="subtle small">Submitted {new Date(r.created_at).toLocaleString()} · version {r.version} · <OriginBadge origin={r.data_origin}/></p>
      </section>
      <section className="surface" aria-labelledby="visibility-h"><h2 id="visibility-h">Visibility</h2>{error ? <InlineError>{error}</InlineError> : null}
        <div className="icon-line"><LockIcon size={26}/><div><p className="lead">{r.public_visibility ? "A generalized public summary is allowed" : "Private to the receiving organization"}</p>
          <p className="muted">{r.public_visibility ? "Precise location and your identity stay private." : "Your name, exact location and photos are only visible to the review team."}</p></div></div>
        <button className={`button ${r.public_visibility ? "button-outline" : "button-primary"}`} onClick={() => toggleVisibility(r)}>{r.public_visibility ? "Withdraw public visibility" : "Allow a generalized public summary"}</button>
        <p className="subtle small">A public summary shares only a non-identifying note (time, waterbody, observation type) to help others understand local conditions.</p>
      </section>
      <div className="stack">
        <section className="surface" aria-labelledby="linked-h"><h2 id="linked-h">Linked investigation</h2>
          <Link className="linked-case" href={`/app/${org}/investigations/${r.case_id}`}><strong>{r.case_title}</strong><CaseStatus tone="active">{WORKFLOW[r.workflow] ?? r.workflow}</CaseStatus><Arrow/></Link>
          <p className="muted small">Your report is considered alongside other observations and data.</p>
          <div className="receipt-effect"><ReceiptHistory path={`/orgs/${org}/reports/${r.id}/receipts`}/></div></section>
        <section className="surface" aria-labelledby="next-h"><h2 id="next-h">What happens next</h2>
          <ol className="numbered"><li>The team reviews your report.</li><li>They look for connections with other reports and data.</li><li>They may reach out if they need more information.</li><li>You will receive an update here when there is news to share.</li></ol></section>
      </div>
    </div>
    <p className="receipt-foot">Observations do not prove a source or indicate water safety.</p>
  </div>;
}
function ReceiptTitle() {
  const received = useSearchParams().get("received");
  return <div className="page-intro receipt-intro"><DocumentTitle title="Your contribution"/><div>
    {received ? <h1>Your report has been received for review. <span className="title-second">The cause is not established.</span></h1> : <h1>Your contribution</h1>}
    <div className="intro-copy"><p>{received ? "Thank you for noticing. Your observation will be reviewed by the team and considered alongside other evidence." : "What you reported, who can see it, and what it has changed so far."}</p></div></div></div>;
}
export default function Page() {
  return <main id="main-content" className="page-shell"><Suspense><ReceiptTitle/><Receipt/></Suspense></main>;
}
