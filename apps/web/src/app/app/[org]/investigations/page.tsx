"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { WORKFLOW } from "../../../../lib/labels";
import { useOrg } from "../../../../lib/session";

const MapView = dynamic(() => import("../../../../components/map-view").then(m => m.MapView), { ssr: false, loading: () => <LoadingState label="Loading map…"/> });

type CaseRow = { id: string; title: string; locality: string | null; workflow: string; data_origin: string; updated_at: string; report_count: number; mine: boolean; network_id: string | null;
  location: { lon: number; lat: number; accuracy_m: string | null; precision: string } | null };

/** Location text for the list: precision is always explicit; nothing is snapped to a stream (C12). */
function where(c: CaseRow) {
  if (!c.location) return `${c.locality || "Landmark only"} · location to be confirmed`;
  return `${c.locality ?? ""} · ${c.location.lat.toFixed(4)}, ${c.location.lon.toFixed(4)} (${c.location.precision}${c.location.accuracy_m ? `, ±${Number(c.location.accuracy_m).toFixed(0)} m` : ", accuracy not reported"})`;
}

export default function Investigations() {
  const { org } = useOrg();
  const [q, setQ] = useState(""); const [workflow, setWorkflow] = useState(""); const [origin, setOrigin] = useState(""); const [mine, setMine] = useState(false);
  const [view, setView] = useState<"list" | "map">("list"); const [selected, setSelected] = useState("");
  const params = new URLSearchParams({ q, workflow, origin, mine: String(mine) });
  const list = useInfiniteQuery({
    queryKey: ["cases", org, q, workflow, origin, mine],
    queryFn: ({ pageParam }) => api<{ items: CaseRow[]; next_cursor: string | null }>(`/orgs/${org}/cases?${params}&cursor=${encodeURIComponent(pageParam)}`),
    initialPageParam: "", getNextPageParam: last => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap(p => p.items) ?? [];
  const located = rows.filter(c => c.location);
  return <main id="main-content" className="page-shell"><PageIntro title="Where will you look next?" action={<Link className="button button-primary" href="/report/new">+ New observation</Link>}><p>Explore investigations and contribute where you can.</p></PageIntro>
    <form className="button-row" role="search" onSubmit={e => e.preventDefault()}>
      <div className="form-field"><label htmlFor="q">Search a stream, place or case number</label><input id="q" type="search" value={q} onChange={e => setQ(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="workflow">Status</label><select id="workflow" value={workflow} onChange={e => setWorkflow(e.target.value)}><option value="">All statuses</option>{Object.entries(WORKFLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="form-field"><label htmlFor="origin">Data origin</label><select id="origin" value={origin} onChange={e => setOrigin(e.target.value)}><option value="">All</option><option value="real">Field</option><option value="synthetic">Example</option><option value="replayed">Replayed</option></select></div>
      <label className="checkbox-field"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)}/><span>Involving me</span></label>
      <div className="button-row" role="group" aria-label="View"><button type="button" className={`button ${view === "map" ? "button-primary" : "button-outline"}`} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
        <button type="button" className={`button ${view === "list" ? "button-primary" : "button-outline"}`} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div>
    </form>
    {list.error ? <InlineError>{list.error.message} <button className="button button-quiet" onClick={() => list.refetch()}>Retry</button></InlineError> : null}
    {view === "map" && rows.length ? <><MapView label={`Map of ${located.length} located investigations`} onSelect={setSelected}
      points={located.map(c => ({ id: c.id, lon: c.location!.lon, lat: c.location!.lat, radiusM: c.location!.accuracy_m ? Number(c.location!.accuracy_m) : null, label: c.title, selected: c.id === selected }))}/>
      {rows.length > located.length ? <p className="muted">{rows.length - located.length} investigation(s) have no confirmed coordinates and appear only in the list.</p> : null}</> : null}
    {list.isPending ? <LoadingState/> : rows.length === 0 && !list.error ? <EmptyState title="No investigations match" action={<Link className="button button-primary" href="/report/new">Report an observation</Link>}><p>No records in this workspace match these filters. That does not mean nothing is happening at the stream.</p></EmptyState> :
      <ul className="example-list" aria-label="Investigations">{rows.map(c => <li key={c.id} className={c.id === selected ? "selected" : undefined}><Link className="example-row" href={`/app/${org}/investigations/${c.id}`} onFocus={() => setSelected(c.id)}>
        <div><h2>{c.title}</h2><p><CaseStatus>{WORKFLOW[c.workflow] ?? c.workflow}</CaseStatus> <OriginBadge origin={c.data_origin}/></p>
          <p className="muted">{where(c)} · {c.network_id ? "Local map recorded" : "Map verification needed"} · {c.report_count} {c.report_count === 1 ? "report" : "reports"} · updated {new Date(c.updated_at).toLocaleDateString()}{c.mine ? " · your report" : ""}</p></div>
        <span className="text-link">Open<span className="visually-hidden"> {c.title}</span></span></Link></li>)}</ul>}
    {list.hasNextPage ? <button className="button button-outline" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Show more"}</button> : null}
  </main>;
}
