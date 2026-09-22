"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ReceiptHistory } from "../../../../../components/receipts";
import { CaseStatus, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { WORKFLOW } from "../../../../../lib/labels";
import { useOrg } from "../../../../../lib/session";

type Report = { id: string; case_id: string; case_title: string; workflow: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; public_visibility: boolean; version: number; data_origin: string; created_at: string; versions: { version: number; created_at: string; change_reason: string | null }[]; media: { id: string; width: number; height: number; consent_original: boolean }[] };

function Receipt() {
  const { org } = useOrg(); const { report } = useParams<{ report: string }>(); const received = useSearchParams().get("received");
  const client = useQueryClient(); const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["report", org, report], queryFn: () => api<Report>(`/orgs/${org}/reports/${report}`) });
  async function toggleVisibility(r: Report) {
    setError("");
    try { await api(`/orgs/${org}/reports/${r.id}/visibility`, { method: "POST", json: { expected_version: r.version, public_visibility: !r.public_visibility } }); client.invalidateQueries({ queryKey: ["report", org, report] }); }
    catch (e) { setError((e as Error).message); }
  }
  if (q.error) return <InlineError>{q.error.message}</InlineError>;
  if (!q.data) return <LoadingState/>;
  const r = q.data;
  return <div className="stack">
    {received ? <p className="notice" role="status"><span aria-hidden="true">✓ </span>Your report has been received for review. The cause is not established.</p> : null}
    <section className="surface stack"><h2>Status</h2><p><CaseStatus tone="accepted">Received by the server</CaseStatus> <OriginBadge origin={r.data_origin}/></p>
      <p>Linked investigation: <Link className="text-link" href={`/app/${org}/investigations/${r.case_id}`}>{r.case_title}</Link> · {WORKFLOW[r.workflow] ?? r.workflow}</p>
      <ReceiptHistory path={`/orgs/${org}/reports/${r.id}/receipts`}/></section>
    <section className="surface stack"><h2>What you reported</h2><p>{r.description || "No description"}</p><p className="muted">{r.categories.join(", ")}</p>
      <p>{r.media.length ? `${r.media.length} ${r.media.length === 1 ? "photo" : "photos"} attached. Location data embedded in photos was removed from shared copies${r.media.some(m => m.consent_original) ? "; originals are kept privately for the review team" : ""}.` : "No photos attached."}</p>
      <p className="muted">Observed {new Date(r.observed_at).toLocaleString()} ({r.timezone}) · {r.latitude === null ? `Location to be confirmed: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}`}</p>
      <p className="muted">Submitted {new Date(r.created_at).toLocaleString()} · version {r.version}</p></section>
    <section className="surface stack"><h2>Visibility</h2>{error ? <InlineError>{error}</InlineError> : null}
      <p>{r.public_visibility ? "A generalized public summary is allowed. Precise location and your identity stay private." : "Private to the receiving organization."}</p>
      <button className="button button-outline" onClick={() => toggleVisibility(r)}>{r.public_visibility ? "Withdraw public visibility" : "Allow a generalized public summary"}</button></section>
  </div>;
}
export default function Page() {
  return <main id="main-content" className="page-shell"><PageIntro title="Your contribution"/><Suspense><Receipt/></Suspense></main>;
}
