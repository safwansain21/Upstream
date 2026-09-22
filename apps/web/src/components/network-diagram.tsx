"use client";

import { useId, useState } from "react";

export type NetworkStation = { id: string; label: string; x: number; y: number; description?: string };
export type NetworkReach = { id: string; label?: string; from: string; to: string; points?: [number, number][]; state?: "candidate" | "excluded" | "unreviewed" };
type NetworkDiagramProps = { stations: NetworkStation[]; reaches: NetworkReach[]; selectedStation?: string; onSelectStation?: (id: string) => void; label?: string; compact?: boolean };

export function NetworkDiagram({ stations, reaches, selectedStation, onSelectStation, label = "Network schematic", compact = false }: NetworkDiagramProps) {
  const id = useId().replaceAll(":", "");
  const [localSelection, setLocalSelection] = useState<string>();
  const selected = selectedStation ?? localSelection;
  const nodes = new Map(stations.map(station => [station.id, station]));
  const xs = stations.map(s => s.x), ys = stations.map(s => s.y);
  const minX = Math.min(...xs, 0), minY = Math.min(...ys, 0);
  const width = Math.max(...xs, 100) - minX + 60, height = Math.max(...ys, 100) - minY + 60;
  function select(stationId: string) { setLocalSelection(stationId); onSelectStation?.(stationId); }
  if (!stations.length) return <div className="map-empty"><h3>A local network starts here.</h3><p>No station geometry is available yet. Add or review a local map before interpreting reaches.</p></div>;
  return <div className={`network-diagram ${compact ? "compact" : ""}`}><svg viewBox={`${minX - 30} ${minY - 30} ${width} ${height}`} role="img" aria-label={`${label}. Use the station list below to select a station.`}><defs><pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="var(--ice)"/><path d="M0 0V6" stroke="var(--river)" strokeWidth="2"/></pattern></defs>{reaches.map(reach => {
    const from = nodes.get(reach.from), to = nodes.get(reach.to);
    if (!from || !to) return null;
    const path = reach.points?.length ? `M${reach.points.map(p => p.join(",")).join(" L")}` : `M${from.x} ${from.y}C${from.x} ${(from.y + to.y) / 2},${to.x} ${(from.y + to.y) / 2},${to.x} ${to.y}`;
    return <g key={reach.id}><path d={path} fill="none" stroke={reach.state === "excluded" ? "var(--excluded)" : "var(--river)"} opacity={reach.state === "unreviewed" ? .55 : 1} strokeWidth="7" strokeLinecap="round" strokeDasharray={reach.state === "excluded" ? "5 5" : undefined}/>{reach.state === "candidate" ? <path d={path} fill="none" stroke={`url(#hatch-${id})`} strokeWidth="4"/> : null}<title>{reach.label || reach.id}: {reach.state || "unreviewed"}</title></g>;
  })}{stations.map(station => <g key={station.id}><circle cx={station.x} cy={station.y} r={selected === station.id ? 9 : 5} fill={selected === station.id ? "var(--action)" : "var(--surface)"} stroke={selected === station.id ? "var(--action)" : "var(--ink)"} strokeWidth="1.5"/><text x={station.x + 12} y={station.y + 5} fontSize="13" fill="var(--ink)" fontFamily="Source Sans 3, sans-serif" fontWeight="600">{station.label}</text></g>)}</svg><div className="station-list" aria-label="Network stations">{stations.map(station => <button key={station.id} className={`station-button ${selected === station.id ? "selected" : ""}`} aria-pressed={selected === station.id} onClick={() => select(station.id)}><span className="station-dot" aria-hidden="true"/>{station.label}</button>)}</div>{selected ? <p className="station-detail" role="status">{nodes.get(selected)?.description || `Selected station ${nodes.get(selected)?.label}`}</p> : null}</div>;
}

export function ReachLegend() { return <ul className="reach-legend" aria-label="Map legend"><li><span className="legend-station"/>Observation station</li><li><span className="legend-reach candidate"/>Under consideration</li><li><span className="legend-reach excluded"/>Excluded under current bounds</li><li><span className="legend-reach unreviewed"/>Unreviewed reach</li></ul>; }
