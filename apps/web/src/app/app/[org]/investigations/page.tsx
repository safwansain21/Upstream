"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ChevronIcon, DocIcon, ListIcon, MapIcon, PinIcon, SearchIcon } from "../../../../components/icons";
import { MapListConnectors } from "../../../../components/map-list-connectors";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { WORKFLOW, workflowTone } from "../../../../lib/labels";
import { useOrg } from "../../../../lib/session";

const MapView = dynamic(() => import("../../../../components/map-view").then(m => m.MapView), { ssr: false, loading: () => <LoadingState label="Loading map…"/> });

type CaseRow = { id: string; title: string; locality: string | null; workflow: string; data_origin: string; updated_at: string; report_count: number; mine: boolean; network_id: string | null;
  location: { lon: number; lat: number; accuracy_m: string | null; precision: string } | null };

/** Location text for the list: precision is always explicit; nothing is snapped to a stream (C12). */
function where(c: CaseRow) {
  if (!c.location) return `${c.locality || "Landmark only"} · location to be confirmed`;
  return `${c.locality ? `${c.locality} · ` : ""}${c.location.lat.toFixed(4)}, ${c.location.lon.toFixed(4)} (${c.location.precision}${c.location.accuracy_m ? `, ±${Number(c.location.accuracy_m).toFixed(0)} m` : ", accuracy not reported"})`;
}

export default function Investigations() {
  const { org, can } = useOrg();
  const [q, setQ] = useState(""); const [workflow, setWorkflow] = useState(""); const [origin, setOrigin] = useState(""); const [mine, setMine] = useState(false);
  const [view, setView] = useState<"list" | "map">("list"); const [selected, setSelected] = useState(""); const [hover, setHover] = useState("");
  const [map, setMap] = useState<any>(null);
  const layout = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams({ q, workflow, origin, mine: String(mine) });
  const list = useInfiniteQuery({
    queryKey: ["cases", org, q, workflow, origin, mine],
    queryFn: ({ pageParam }) => api<{ items: CaseRow[]; next_cursor: string | null }>(`/orgs/${org}/cases?${params}&cursor=${encodeURIComponent(pageParam)}`),
    initialPageParam: "", getNextPageParam: last => last.next_cursor ?? undefined,
  });
  const rows = useMemo(() => list.data?.pages.flatMap(p => p.items) ?? [], [list.data]);
  const located = useMemo(() => rows.filter(c => c.location), [rows]);
  const anchors = useMemo(() => located.map(c => ({ id: c.id, lon: c.location!.lon, lat: c.location!.lat })), [located]);
  const filtered = !!(q || workflow || origin || mine);
  return <main id="main-content" className="page-shell directory-page">
    <PageIntro title="Where will you look next?" action={<Link className="button button-primary" href="/report/new">Report an observation</Link>}><p>Explore investigations and contribute where you can.</p></PageIntro>
    <form className="filter-bar" role="search" onSubmit={e => e.preventDefault()}>
      <div className="search-field"><SearchIcon/><label htmlFor="q" className="visually-hidden">Search a stream, place or case number</label><input id="q" type="search" placeholder="Stream, place or case number" value={q} onChange={e => setQ(e.target.value)}/></div>
      <div className="form-field compact-field"><label htmlFor="workflow" className="visually-hidden">Status</label><select id="workflow" value={workflow} onChange={e => setWorkflow(e.target.value)}><option value="">All statuses</option>{Object.entries(WORKFLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="form-field compact-field"><label htmlFor="origin" className="visually-hidden">Data origin</label><select id="origin" value={origin} onChange={e => setOrigin(e.target.value)}><option value="">All data origins</option><option value="real">Field</option><option value="synthetic">Synthetic example</option><option value="replayed">Replayed</option></select></div>
      <label className="checkbox-field"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)}/><span>Involving me</span></label>
      <div className="segmented" role="group" aria-label="View"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><ListIcon/>List</button><button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}><MapIcon/>Map</button></div>
    </form>
    {list.error ? <InlineError>{list.error.message} <button className="button button-quiet" onClick={() => list.refetch()}>Retry</button></InlineError> : null}
    {list.isPending ? <LoadingState/> : rows.length === 0 && !list.error ? <EmptyState title={filtered ? "No investigations match" : "No investigations yet"}
      steps={filtered ? ["Try a broader search or clear the filters.", "No matching record does not mean nothing is happening at the stream."]
        : can("coordinate") ? ["Reports people submit open investigations here automatically.", "Share the report link with your community, or start one yourself."] : ["Start with what you noticed: a report opens an investigation for the team to review."]}
      action={<Link className="button button-primary" href="/report/new">Report an observation</Link>}/> : <>
      <p className="result-count subtle">{rows.length}{list.hasNextPage ? "+" : ""} {rows.length === 1 ? "investigation" : "investigations"}</p>
      <div ref={layout} className={`directory ${view}`}>
        <ul className="case-list" aria-label="Investigations">{rows.map(c => <li key={c.id} className={c.id === selected ? "selected" : undefined}>
          <Link className="case-row" href={`/app/${org}/investigations/${c.id}`} data-connector-row={c.location ? c.id : undefined} onFocus={() => setSelected(c.id)} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover("")}>
            <span className={`case-dot ${c.location ? "" : "uncertain"}`} aria-hidden="true"/>
            <span className="case-main"><h2>{c.title}</h2>
              <span className="row"><CaseStatus tone={workflowTone(c.workflow)}>{WORKFLOW[c.workflow] ?? c.workflow}</CaseStatus><OriginBadge origin={c.data_origin}/>{c.mine ? <span className="badge">Your report</span> : null}</span>
              <span className="meta-row"><span className="icon-inline"><DocIcon size={18}/>{c.report_count} {c.report_count === 1 ? "report" : "reports"}</span><span className="icon-inline"><PinIcon size={18}/>{where(c)}</span><span>{c.network_id ? "Local map recorded" : "Map verification needed"}</span><span>Updated {new Date(c.updated_at).toLocaleDateString()}</span></span></span>
            <ChevronIcon/><span className="visually-hidden">Open {c.title}</span></Link></li>)}</ul>
        <section className="directory-map" aria-label="Map of investigations">
          <MapView height={view === "map" ? 560 : 520} onMapReady={setMap} label={`Map of ${located.length} located investigations${located.some(c => c.data_origin === "synthetic") ? " (includes example data)" : ""}`} onSelect={setSelected}
            points={located.map(c => ({ id: c.id, lon: c.location!.lon, lat: c.location!.lat, radiusM: c.location!.accuracy_m ? Number(c.location!.accuracy_m) : null, label: c.title, selected: c.id === selected || c.id === hover }))}/>
          <ul className="map-key" aria-label="Map legend"><li><span className="key-dot"/>Located investigation</li><li><span className="key-dot selected"/>Selected</li><li><span className="key-ring"/>Location accuracy</li><li><span className="key-line"/>Links a listed case to its place; not a waterway</li></ul>
          {rows.length > located.length ? <p className="subtle small">{rows.length - located.length} investigation(s) have no confirmed coordinates and appear only in the list.</p> : null}
        </section>
        {view === "list" ? <MapListConnectors container={layout} map={map} rows={anchors} active={hover || selected}/> : null}
      </div>
      {list.hasNextPage ? <button className="button button-outline" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Show more"}</button> : null}
    </>}
  </main>;
}
