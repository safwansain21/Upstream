"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

export type NetworkStation = { id: string; label: string; x: number; y: number; description?: string };
export type NetworkReach = { id: string; label?: string; from: string; to: string; points?: [number, number][]; state?: "candidate" | "excluded" | "unreviewed" };
type NetworkDiagramProps = { stations: NetworkStation[]; reaches: NetworkReach[]; selectedStation?: string; onSelectStation?: (id: string) => void; label?: string; compact?: boolean;
  selectedReach?: string; onSelectReach?: (id: string) => void; highlight?: Set<string>; annotation?: { station: string; text: string } };

export const REACH_WORDS = { candidate: "Retained · worth checking", excluded: "Ruled out under stated assumptions", unreviewed: "Not assessed" } as const;

/** Order reaches from the outlet upstream (breadth-first against the flow), so the network draws in its real topology. */
function drawOrder(reaches: NetworkReach[]) {
  const into = new Map<string, NetworkReach[]>();
  reaches.forEach(r => into.set(r.to, [...(into.get(r.to) ?? []), r]));
  const froms = new Set(reaches.map(r => r.from));
  const outlets = [...new Set(reaches.map(r => r.to))].filter(n => !froms.has(n));
  const order = new Map<string, number>();
  let frontier = outlets, depth = 0;
  while (frontier.length && depth < 200) {
    const next: string[] = [];
    frontier.forEach(node => (into.get(node) ?? []).forEach(r => { if (!order.has(r.id)) { order.set(r.id, depth); next.push(r.from); } }));
    frontier = next; depth++;
  }
  reaches.forEach(r => { if (!order.has(r.id)) order.set(r.id, depth); });
  return order;
}

export function NetworkDiagram({ stations, reaches, selectedStation, onSelectStation, label = "Network schematic", compact = false, selectedReach, onSelectReach, highlight, annotation }: NetworkDiagramProps) {
  const id = useId().replaceAll(":", "");
  const [localSelection, setLocalSelection] = useState<string>();
  const diagram = useRef<SVGSVGElement>(null);
  const selected = selectedStation ?? localSelection;
  const nodes = new Map(stations.map(station => [station.id, station]));
  const order = useMemo(() => drawOrder(reaches), [reaches]);
  const xs = stations.map(s => s.x), ys = stations.map(s => s.y);
  const minX = Math.min(...xs, 0), minY = Math.min(...ys, 0);
  const width = Math.max(...xs, 100) - minX + 80, height = Math.max(...ys, 100) - minY + 80;
  useEffect(() => {
    const svg = diagram.current;
    if (!svg) return;
    svg.querySelectorAll<SVGPathElement>(".reach-line").forEach(path =>
      path.style.setProperty("--path-length", `${Math.ceil(path.getTotalLength())}px`));
    svg.classList.add("draw-ready");
  }, [reaches]);
  function select(stationId: string) { setLocalSelection(stationId); onSelectStation?.(stationId); }
  if (!stations.length) return <div className="map-empty"><h3>A local network starts here.</h3><p>No station geometry is available yet. Add or review a local map before interpreting reaches.</p></div>;
  const pathOf = (reach: NetworkReach) => {
    const from = nodes.get(reach.from), to = nodes.get(reach.to);
    if (!from || !to) return null;
    return reach.points?.length ? `M${reach.points.map(p => p.join(",")).join(" L")}` : `M${from.x} ${from.y}C${from.x} ${(from.y + to.y) / 2},${to.x} ${(from.y + to.y) / 2},${to.x} ${to.y}`;
  };
  const note = annotation ? nodes.get(annotation.station) : undefined;
  return <div className={`network-diagram ${compact ? "compact" : ""}`}>
    <svg ref={diagram} viewBox={`${minX - 40} ${minY - 40} ${width} ${height}`} role="img" aria-label={`${label}. ${onSelectReach ? "Use the stretch list below to select a stretch." : "Use the station list below to select a station."}`}>
      <defs><filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <g className="reaches">{reaches.map(reach => {
        const d = pathOf(reach); if (!d) return null;
        const state = reach.state ?? "unreviewed";
        return <g key={reach.id} className={`reach reach-${state} ${selectedReach === reach.id ? "is-selected" : ""} ${highlight?.has(reach.id) ? "is-highlighted" : ""}`} style={{ "--i": order.get(reach.id) ?? 0 } as CSSProperties}>
          {selectedReach === reach.id ? <path d={d} className="reach-halo"/> : null}
          {state === "candidate" ? <path d={d} className="reach-glow" filter={`url(#glow-${id})`}/> : null}
          <path d={d} className="reach-line"/>
          {onSelectReach ? <path d={d} className="reach-hit" onClick={() => onSelectReach(reach.id)}/> : null}
          <title>{reach.label || reach.id}: {REACH_WORDS[state]}</title></g>;
      })}</g>
      <g className="stations">{stations.map(station => <g key={station.id} className={`station ${selected === station.id ? "is-selected" : ""} ${station.label ? "" : "junction"}`}>
        <circle cx={station.x} cy={station.y} r={selected === station.id ? 7.5 : station.label ? 5 : 2.6}/>
        {station.label ? <text x={station.x + 12} y={station.y + 4.5}>{station.label}</text> : null}</g>)}</g>
      {note ? <g className="diagram-note"><path d={`M${note.x} ${note.y - 10} V${note.y - 46}`}/><text x={note.x + 6} y={note.y - 50}>{annotation!.text}</text></g> : null}
    </svg>
    {onSelectReach ? <div className="reach-list" aria-label="Network stretches">{reaches.map(r => { const state = r.state ?? "unreviewed"; return <button key={r.id} type="button" className={`reach-button ${state} ${selectedReach === r.id ? "selected" : ""}`} aria-pressed={selectedReach === r.id} onClick={() => onSelectReach(r.id)}>
      <span className={`legend-reach ${state}`} aria-hidden="true"/><span>{r.label || r.id}</span><span className="reach-state">{REACH_WORDS[state]}</span></button>; })}</div> : null}
    <div className="station-list" aria-label="Network stations">{stations.filter(station => station.label).map(station => <button key={station.id} type="button" className={`station-button ${selected === station.id ? "selected" : ""}`} aria-pressed={selected === station.id} onClick={() => select(station.id)}><span className="station-dot" aria-hidden="true"/>{station.label}</button>)}</div>
    {selected ? <p className="station-detail" role="status">{nodes.get(selected)?.description || `Selected station ${nodes.get(selected)?.label}`}</p> : null}
  </div>;
}

export function ReachLegend({ unmapped = false }: { unmapped?: boolean }) {
  return <ul className="reach-legend" aria-label="Map legend">
    <li><span className="legend-reach candidate"/><span><strong>Retained</strong> · still worth checking</span></li>
    <li><span className="legend-reach excluded"/><span><strong>Ruled out</strong> · incompatible under stated assumptions, not proven clean</span></li>
    <li><span className="legend-reach unreviewed"/><span><strong>Not assessed</strong> · no conclusion yet</span></li>
    <li><span className="legend-station"/><span>Station</span></li>
    {unmapped ? <li><span className="legend-station uncertain"/><span>Location being confirmed</span></li> : null}
  </ul>;
}
