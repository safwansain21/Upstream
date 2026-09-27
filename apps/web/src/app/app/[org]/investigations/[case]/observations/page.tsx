"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro, PageState } from "../../../../../../components/ui";
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
  if (detail.error) return <PageState title="Observations" error={detail.error} retry={() => detail.refetch()}/>;
  if (!detail.data) return <PageState title="Observations"/>;
  const rows = (readings.data ?? []).filter(r => (!quality || (r.quality ?? "pending") === quality) && (!station || r.station_code === station));
  return <main id="main-content" className="page-shell case-page observations-page">
    <CaseHeader caseId={caseId} current="observations"/>
    <PageIntro title="Observations & readings"><p>Community reports and instrument measurements are separate kinds of evidence. Each reading keeps its own version, calibration and review history.</p></PageIntro>
    <div className="observations-layout">
    <section className="surface stack reports-panel" aria-labelledby="reports-heading"><div className="observation-panel-head"><div><span className="eyebrow">What people noticed</span><h2 id="reports-heading">Community reports <span className="count">{detail.data.reports.length}</span></h2></div><Link href="/report/new" className="button button-outline button-small">Report an observation</Link></div>
      {detail.data.reports.length ? <ol className="observation-report-list">{detail.data.reports.map(r => <li key={r.id}>
        <div className="report-card-meta"><time dateTime={r.observed_at}>{new Date(r.observed_at).toLocaleString()}</time><OriginBadge origin={r.data_origin}/></div>
        <h3>{r.categories.length ? r.categories.join(", ") : "Community observation"}</h3>
        {r.description ? <p>{r.description}</p> : null}
        <p className="report-card-place">{r.latitude === null ? `Location to be confirmed: “${r.landmark}”` : `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)} (${r.location_precision})`}</p>
        <Link href={`/app/${org}/reports/${r.id}`} className="text-link" aria-label={`View report from ${new Date(r.observed_at).toLocaleDateString()}`}>View report →</Link>
      </li>)}</ol>
        : <EmptyState title="No reports visible to you"/>}</section>
    {review ? <section className="surface stack readings-panel" aria-labelledby="readings-heading"><div className="observation-panel-head"><div><span className="eyebrow">What instruments measured</span><h2 id="readings-heading">Instrument readings <span className="count">{readings.data?.length ?? 0}</span></h2></div></div>
      <div className="reading-filters">
        <div className="form-field"><label htmlFor="q-filter">Quality</label><select id="q-filter" value={quality} onChange={e => setQuality(e.target.value)}><option value="">All</option><option value="pending">Pending review</option><option value="accepted">Accepted</option><option value="suspect">Suspect</option><option value="excluded">Excluded</option></select></div>
        <div className="form-field"><label htmlFor="s-filter">Station</label><select id="s-filter" value={station} onChange={e => setStation(e.target.value)}><option value="">All</option>{[...new Set((readings.data ?? []).map(r => r.station_code))].sort().map(s => <option key={s}>{s}</option>)}</select></div></div>
      {readings.error ? <InlineError>{readings.error.message}</InlineError> : !readings.data ? <LoadingState/> : !rows.length ? <EmptyState title="No readings match"><p>Readings appear after trained monitors submit assigned tasks.</p></EmptyState> :
        <div className="table-scroll" role="region" aria-label="Readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Station</th><th scope="col">Measured</th><th scope="col">Value</th><th scope="col">Temperature</th><th scope="col">Instrument · visit</th><th scope="col">Quality</th><th scope="col">Assessment use</th><th scope="col">Origin</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.station_code}</td><td>{new Date(r.measured_at).toLocaleString()}<br/><span className="muted">received {new Date(r.received_at).toLocaleString()}</span></td>
            <td className="numeric">{r.mode === "true_sc25_enclosure" ? "Reviewed SC25 enclosure" : `${r.value} ${r.unit} (${r.mode === "raw" ? "raw" : "meter SC25"})`}</td><td className="numeric">{r.temperature ?? "—"}</td>
            <td><span className="mono">{r.instrument_serial}</span> · <span className="mono">{r.visit_id.slice(0, 8)}</span></td>
            <td><CaseStatus tone={r.quality === "accepted" ? "accepted" : r.quality ? "warning" : "neutral"}>{r.quality ?? "pending review"}</CaseStatus>{r.quality_reason ? <p className="muted">{r.quality_reason}</p> : null}</td>
            <td>{!r.eligible ? `History only: ${r.ineligibility_reasons.join("; ")}` : r.quality === "accepted" ? (r.comparable === false ? "Accepted; comparability pending" : "Eligible") : "Not used until reviewed"}</td><td><OriginBadge origin={r.data_origin}/></td></tr>)}</tbody></table></div>}
      <p className="reading-limits">A reading alone cannot identify a chemical or source. Assessment use depends on calibration, quality review and stated assumptions.</p>
    </section> : <section className="surface observation-permission"><h2>Instrument readings</h2><p>Measurement details are available to the review team.</p></section>}
    </div>
  </main>;
}
