import type { NetworkReach, NetworkStation } from "../components/network-diagram";

type Node = { code: string; kind: string; lon: number; lat: number };
type Edge = { id: string; code: string; from_code: string; to_code: string; length_m: string };

/** Display-only equirectangular projection of stored WGS84 nodes into schematic coordinates (never used for science). */
export function schematic(nodes: Node[], edges: Edge[], stationCodes: Set<string>, state: (edge: Edge) => NetworkReach["state"], describe?: (n: Node) => string) {
  if (!nodes.length) return { stations: [] as NetworkStation[], reaches: [] as NetworkReach[] };
  const lats = nodes.map(n => n.lat), lons = nodes.map(n => n.lon);
  const cos = Math.cos((Math.min(...lats) * Math.PI) / 180);
  const span = Math.max((Math.max(...lons) - Math.min(...lons)) * cos, Math.max(...lats) - Math.min(...lats)) || 1;
  const stations = nodes.map(n => ({ id: n.code, x: ((n.lon - Math.min(...lons)) * cos / span) * 520, y: ((Math.max(...lats) - n.lat) / span) * 520,
    label: stationCodes.has(n.code) ? n.code : "", description: describe ? describe(n) : `${n.code} · ${n.kind}` }));
  const km = (m: string) => `${(Number(m) / 1000).toFixed(2)} km`;
  const reaches = edges.map(e => ({ id: e.id, label: `${e.code} (${km(e.length_m)})`, from: e.from_code, to: e.to_code, state: state(e) }));
  return { stations, reaches };
}
