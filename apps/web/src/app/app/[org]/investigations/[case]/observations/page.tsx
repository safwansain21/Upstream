"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CaseHeader } from "../../../../../../components/case-tabs";
import { FlaskIcon, PeopleIcon } from "../../../../../../components/icons";
import { Term } from "../../../../../../components/term";
import { EmptyState, InlineError, LoadingState, OriginBadge, PageIntro, PageState } from "../../../../../../components/ui";
import { summary, type ReportAi } from "../../../../../../lib/ai-checks";
import { api } from "../../../../../../lib/api";
import { REPORT_CATEGORIES } from "../../../../../../lib/labels";
import { useOrg } from "../../../../../../lib/session";

type Report = { id: string; description: string; categories: string[]; observed_at: string; timezone: string; landmark: string; location_precision: string; accuracy_m: string | null;
  latitude: number | null; longitude: number | null; data_origin: string; ai?: ReportAi };
type Reading = { id: string; entity_id: string; version: number; station_code: string; instrument_serial: string; mode: string; value: string; unit: string; temperature: string | null;
  measured_at: string; received_at: string; eligible: boolean; ineligibility_reasons: string[]; quality: string | null; quality_reason: string | null; comparable: boolean | null; visit_id: string; data_origin: string };

const CATEGORY = Object.fromEntries(REPORT_CATEGORIES.map(([k, v]) => [k, v.replace(/ \(.*\)$/, "")]));
const QUALITY: Record<string, string> = { accepted: "Accepted", suspect: "Suspect", excluded: "Excluded", pending: "Pending review" };
const WINDOWS: [string, string][] = [["", "All time"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["365", "Last year"]];
const when = (iso: string) => { const d = new Date(iso); return <><span>{d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span> <span>{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></>; };

/** Assessment use in plain words; the reason stays visible for history-only readings. */
function use(r: Reading) {
  if (!r.eligible) return { word: "No", note: r.ineligibility_reasons.length ? `History only: ${r.ineligibility_reasons.join("; ")}` : "History only" };
  if (r.quality === "accepted") return r.comparable === false ? { word: "Not yet", note: "Accepted; comparability pending" } : { word: "Yes", note: "" };
  return { word: "Not yet", note: "Not used until reviewed" };
}

function csv(rows: Reading[]) {
  const cells = [["measured_at", "station", "value", "unit", "mode", "temperature_c", "quality", "assessment_use", "instrument", "visit", "origin"],
    ...rows.map(r => [r.measured_at, r.station_code, r.value, r.unit, r.mode, r.temperature ?? "", r.quality ?? "pending", use(r).word, r.instrument_serial, r.visit_id, r.data_origin])];
  const text = cells.map(row => row.map(c => /[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: "readings.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

export default function Observations() {
  const { org, can } = useOrg(); const { case: caseId } = useParams<{ case: string }>();
  const review = can("expert") || can("coordinate") || can("evidence_view");
  const detail = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<{ title: string; reports: Report[] }>(`/orgs/${org}/cases/${caseId}`) });
  const readings = useQuery({ queryKey: ["readings", org, caseId], enabled: review, queryFn: () => api<Reading[]>(`/orgs/${org}/cases/${caseId}/readings`) });
  const [quality, setQuality] = useState(""); const [station, setStation] = useState("");
  const [period, setPeriod] = useState(""); const [placed, setPlaced] = useState(""); const [kind, setKind] = useState("");
  if (detail.error) return <PageState title="Observations & readings" error={detail.error} retry={() => detail.refetch()}/>;
  if (!detail.data) return <PageState title="Observations & readings"/>;
  const now = Date.now();
  const reports = detail.data.reports.filter(r => (!period || now - new Date(r.observed_at).getTime() <= Number(period) * 864e5)
    && (!placed || (placed === "located" ? r.latitude !== null : r.latitude === null)) && (!kind || r.categories.includes(kind)));
  const kinds = [...new Set(detail.data.reports.flatMap(r => r.categories))];
  const all = readings.data ?? [];
  const rows = all.filter(r => (!quality || (r.quality ?? "pending") === quality) && (!station || r.station_code === station));
  const stations = [...new Set(all.map(r => r.station_code))].sort();
  const origins = [...new Set(rows.map(r => r.data_origin))]; // one shared origin is stated once, mixed origins per row

  return <main id="main-content" className="page-shell case-page observations-page">
    <CaseHeader caseId={caseId} current="observations"/>
    <PageIntro title="Observations & readings"><p>Community reports and instrument measurements are separate kinds of evidence. Each reading keeps its own version, calibration and review history.</p></PageIntro>
    <div className="observations-layout">
    <section className="stack reports-panel" aria-labelledby="reports-heading">
      <div className="observation-panel-head"><h2 id="reports-heading"><PeopleIcon size={34}/>Community reports</h2><span className="panel-count">{detail.data.reports.length} {detail.data.reports.length === 1 ? "report" : "reports"}</span>
        <Link href="/report/new" className="button button-primary button-small">Report an observation</Link></div>
      {detail.data.reports.length ? <div className="reading-filters" role="group" aria-label="Filter reports">
        <label className="filter-pill"><span className="visually-hidden">Period</span><select value={period} onChange={e => setPeriod(e.target.value)}>{WINDOWS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="filter-pill"><span className="visually-hidden">Location</span><select value={placed} onChange={e => setPlaced(e.target.value)}><option value="">All locations</option><option value="located">With coordinates</option><option value="landmark">Location to be confirmed</option></select></label>
        <label className="filter-pill"><span className="visually-hidden">Type</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="">All types</option>{kinds.map(k => <option key={k} value={k}>{CATEGORY[k] ?? k}</option>)}</select></label>
      </div> : null}
      {!detail.data.reports.length ? <EmptyState title="No reports visible to you" steps={review ? ["Reports linked to this case appear here as people submit them.", "Reports stay separate from readings; neither alone establishes a cause."]
          : ["You see the reports you can access in this workspace.", "If you noticed something at this stream, report it: a careful note starts an investigation."]}/>
        : !reports.length ? <p className="muted">No reports match these filters.</p>
        : <ol className="observation-report-list">{reports.map(r => <li key={r.id}>
          <Link href={`/app/${org}/reports/${r.id}`} className="report-row" aria-label={`Report from ${new Date(r.observed_at).toLocaleDateString()}: ${r.categories.map(c => CATEGORY[c] ?? c).join(", ") || "community observation"}`}>
            <span className="report-card-meta"><time dateTime={r.observed_at}>{when(r.observed_at)}</time>{r.categories.length ? <span className="report-kind">{r.categories.map(c => CATEGORY[c] ?? c).join(" · ")}</span> : null}</span>
            <span className="report-title">{r.description ? r.description.split(/(?<=[.!?])\s/)[0].slice(0, 80) : r.categories.map(c => CATEGORY[c] ?? c).join(", ") || "Community observation"}</span>
            {r.description && r.description.length > 80 ? <span className="report-text">{r.description}</span> : null}
            <span className="report-card-place">{r.latitude === null ? `Location to be confirmed: “${r.landmark}”` : `${r.landmark ? `${r.landmark} · ` : ""}${r.latitude.toFixed(4)}, ${r.longitude!.toFixed(4)}`}{r.accuracy_m ? ` · ± ${Math.round(Number(r.accuracy_m))} m` : ` · ${r.location_precision}`}</span>
            {r.ai && summary(r.ai) ? <span className="report-card-ai">{summary(r.ai)}</span> : null}
            {r.data_origin !== "real" ? <OriginBadge origin={r.data_origin}/> : null}
            <span className="row-chevron" aria-hidden="true">›</span></Link></li>)}</ol>}
    </section>
    {review ? <section className="stack readings-panel" aria-labelledby="readings-heading">
      <div className="observation-panel-head"><h2 id="readings-heading"><FlaskIcon size={34}/>Instrument readings</h2><span className="panel-count">{all.length} {all.length === 1 ? "reading" : "readings"} at {stations.length} {stations.length === 1 ? "station" : "stations"}</span></div>
      <div className="reading-filters">
        <div className="form-field filter-pill"><label htmlFor="s-filter" className="visually-hidden">Station</label><select id="s-filter" value={station} onChange={e => setStation(e.target.value)}><option value="">All stations</option>{stations.map(s => <option key={s} value={s}>Station {s}</option>)}</select></div>
        <div className="form-field filter-pill"><label htmlFor="q-filter" className="visually-hidden">Quality</label><select id="q-filter" value={quality} onChange={e => setQuality(e.target.value)}><option value="">All quality</option><option value="pending">Pending review</option><option value="accepted">Accepted</option><option value="suspect">Suspect</option><option value="excluded">Excluded</option></select></div>
        {rows.length ? <button type="button" className="button button-outline button-small reading-export" onClick={() => csv(rows)}>Download CSV</button> : null}</div>
      {readings.error ? <InlineError>{readings.error.message} <button type="button" className="button button-quiet" onClick={() => readings.refetch()}>Retry</button></InlineError> : !readings.data ? <LoadingState label="Loading readings…"/>
        : !all.length ? <EmptyState title="No readings yet" steps={can("coordinate") ? ["Propose a field task at a station; trained monitors take the readings.", "Readings appear here once submitted, then wait for quality review."] : ["Readings appear after trained monitors submit assigned tasks.", "Each one waits for quality review before it can inform an assessment."]}/>
        : !rows.length ? <p className="muted">No readings match these filters.</p> :
        <div className="table-scroll" role="region" aria-label="Readings" tabIndex={0}><table className="data-table readings-table">{origins.length === 1 && origins[0] !== "real" ? <caption><OriginBadge origin={origins[0]}/> Every reading shown here is example data.</caption> : null}<thead><tr><th scope="col">Measured</th><th scope="col"><Term k="station">Station</Term></th><th scope="col" className="numeric">Conductivity</th><th scope="col" className="numeric">Temperature (°C)</th><th scope="col">Quality</th><th scope="col">Use in assessment</th></tr></thead>
          <tbody>{rows.map(r => { const u = use(r); const q = r.quality ?? "pending"; return <tr key={r.id}>
            <td><time dateTime={r.measured_at}>{when(r.measured_at)}</time><span className="cell-note"><span className="mono">{r.instrument_serial}</span> · visit <span className="mono">{r.visit_id.slice(0, 8)}</span></span>{origins.length > 1 && r.data_origin !== "real" ? <OriginBadge origin={r.data_origin}/> : null}</td>
            <td>{r.station_code}</td>
            <td className="numeric">{r.mode === "true_sc25_enclosure" ? <span className="cell-note">Reviewed SC25 enclosure</span> : <>{r.value} <span className="unit">{r.unit}</span><span className="cell-note">{r.mode === "raw" ? "raw" : "meter SC25"}</span></>}</td>
            <td className="numeric">{r.temperature ?? "—"}</td>
            <td><span className={`quality quality-${q}`}><span className="dot" aria-hidden="true"/>{QUALITY[q] ?? q}</span>{r.quality_reason ? <span className="cell-note">{r.quality_reason}</span> : null}</td>
            <td>{u.word}{u.note ? <span className="cell-note">{u.note}</span> : null}</td></tr>; })}</tbody></table></div>}
      <div className="callout reading-limits"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        <div><strong>A reading alone cannot identify a chemical or source.</strong>Readings show that something in the water changed, not what it is or where it came from. Conductivity is compared as <Term k="sc25">SC25</Term>; use depends on calibration, quality review and stated assumptions.</div></div>
    </section> : <section className="stack readings-panel observation-permission" aria-labelledby="readings-heading"><h2 id="readings-heading">Instrument readings</h2>
      <EmptyState title="Readings are shared with the review team" steps={["Trained monitors take readings at fixed stations; reviewers check each one before it counts.", "Your reports stay part of this investigation either way. You will be told when an assessment your report informed changes."]}/></section>}
    </div>
  </main>;
}
