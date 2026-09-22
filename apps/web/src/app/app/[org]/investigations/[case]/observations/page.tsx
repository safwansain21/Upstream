"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseTabs } from "../../../../../../components/case-tabs";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../../../components/ui";
import { api } from "../../../../../../lib/api";
import { useOrg } from "../../../../../../lib/session";

type Report = { id: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; latitude: number | null; longitude: number | null; data_origin: string };
type Reading = { id: string; entity_id: string; version: number; station_code: string; instrument_serial: string; mode: string; value: string; unit: string; temperature: string | null;
  measured_at: string; received_at: string; eligible: boolean; ineligibility_reasons: string[]; quality: string | null; quality_reason: string | null; comparable: boolean | null; visit_id: string; data_origin: string };

export default function Observations() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const review = can("expert") || can("coordinate") || can("evidence_view");
  const detail = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<{ title: string; reports: Report[] }>(`/orgs/${org}/cases/${caseId}`) });
  const readings = useQuery({ queryKey: ["readings", org, caseId], enabled: review, queryFn: () => api<Reading[]>(`/orgs/${org}/cases/${caseId}/readings`) });
  const [quality, setQuality] = useState(""); const [station, setStation] = useState("");
  if (detail.error) return <main id="main-content" className="page-shell"><InlineError>{detail.error.message}</InlineError></main>;
  if (!detail.data) return <main id="main-content" className="page-shell"><LoadingState/></main>;
  const rows = (readings.data ?? []).filter(r => (!quality || (r.quality ?? "pending") === quality) && (!station || r.station_code === station));
  return <main id="main-content" className="page-shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href={`/app/${org}/investigations/${caseId}`}>{detail.data.title}</Link> / <span aria-current="page">Observations</span></nav>
    <CaseTabs caseId={caseId} current="observations"/>
    <PageIntro title="Observations"><p>Reports describe what people saw; readings are measurements with their own versions, calibration and review. Each reading is listed separately; repeats are not merged into one value.</p></PageIntro>
    <section className="surface stack" aria-labelledby="reports-heading"><h2 id="reports-heading">Reports ({detail.data.reports.length})</h2>
      {detail.data.reports.length ? <ul>{detail.data.reports.map(r => <li key={r.id}><p>{r.description || r.categories.join(", ")} <OriginBadge origin={r.data_origin}/></p>
        <p className="muted">Observed {new Date(r.observed_at).toLocaleString()} ({r.timezone}) · {r.latitude === null ? `Location to be confirmed: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)} (${r.location_precision})`}</p></li>)}</ul>
        : <EmptyState title="No reports visible to you"/>}</section>
    {review ? <section className="surface stack" aria-labelledby="readings-heading"><h2 id="readings-heading">Readings</h2>
      <div className="button-row">
        <div className="form-field"><label htmlFor="q-filter">Quality</label><select id="q-filter" value={quality} onChange={e => setQuality(e.target.value)}><option value="">All</option><option value="pending">Pending review</option><option value="accepted">Accepted</option><option value="suspect">Suspect</option><option value="excluded">Excluded</option></select></div>
        <div className="form-field"><label htmlFor="s-filter">Station</label><select id="s-filter" value={station} onChange={e => setStation(e.target.value)}><option value="">All</option>{[...new Set((readings.data ?? []).map(r => r.station_code))].sort().map(s => <option key={s}>{s}</option>)}</select></div></div>
      {readings.error ? <InlineError>{readings.error.message}</InlineError> : !readings.data ? <LoadingState/> : !rows.length ? <EmptyState title="No readings match"><p>Readings appear after trained monitors submit assigned tasks.</p></EmptyState> :
        <div className="table-scroll" role="region" aria-label="Readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Station</th><th scope="col">Measured</th><th scope="col">Value</th><th scope="col">Temperature</th><th scope="col">Instrument · visit</th><th scope="col">Quality</th><th scope="col">Assessment use</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.station_code}</td><td>{new Date(r.measured_at).toLocaleString()}<br/><span className="muted">received {new Date(r.received_at).toLocaleString()}</span></td>
            <td className="numeric">{r.mode === "true_sc25_enclosure" ? "Reviewed SC25 enclosure" : `${r.value} ${r.unit} (${r.mode === "raw" ? "raw" : "meter SC25"})`}</td><td className="numeric">{r.temperature ?? "—"}</td>
            <td><span className="mono">{r.instrument_serial}</span> · <span className="mono">{r.visit_id.slice(0, 8)}</span></td>
            <td><CaseStatus tone={r.quality === "accepted" ? "accepted" : r.quality ? "warning" : "neutral"}>{r.quality ?? "pending review"}</CaseStatus>{r.quality_reason ? <p className="muted">{r.quality_reason}</p> : null}</td>
            <td>{!r.eligible ? `History only: ${r.ineligibility_reasons.join("; ")}` : r.quality === "accepted" ? (r.comparable === false ? "Accepted; comparability pending" : "Eligible") : "Not used until reviewed"}</td></tr>)}</tbody></table></div>}
    </section> : <p className="muted">Measurement details are available to the review team.</p>}
  </main>;
}
