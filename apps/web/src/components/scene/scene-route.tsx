import type { CSSProperties, ReactNode } from "react";
import { LightRoute } from "./light-route";
import { trace, type P } from "./route-geometry";

/**
 * A luminous line drawn across the scene water, in plate coordinates (1672×941), inside DuskScene's route layer.
 * It draws once from its first stop; each dot (and its label) arrives when the line reaches it. Ghost stops only shape
 * the curve. Illustrative only: pages always carry the same content as real text elsewhere (this is aria-hidden).
 */
export type Stop = { x: number; y: number; label?: ReactNode; detail?: ReactNode; tone?: "origin" | "done" | "current" | "pending"; below?: boolean; ghost?: boolean };

const TONE = { origin: "origin", done: "end", current: "current", pending: "ruled" } as const;
const reach = (f: number) => f < .5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2); // inverse of the even easing

export function SceneRoute({ stops, duration = 2.2, delay = .6, tail }: { stops: Stop[]; duration?: number; delay?: number; tail?: { x: number; y: number }[] }) {
  const pts: P[] = [...stops, ...(tail ?? [])].map(s => [s.x, s.y]);
  const t = trace(pts, undefined, 20);
  const when = (s: Stop) => { // the line's share at the sample nearest this stop
    const near = t.at.reduce((best, a) => Math.hypot(a.p[0] - s.x, a.p[1] - s.y) < Math.hypot(best.p[0] - s.x, best.p[1] - s.y) ? a : best);
    return delay + duration * reach(near.f);
  };
  return <>
    <LightRoute publish className="scene-route" lines={[{ pts, kind: "main", start: delay, dur: duration }]} sparkles={.8} seed={pts.length * 31 + Math.round(pts[0][0])}
      dots={stops.flatMap((s, i) => s.ghost ? [] : [{ at: pts[i], tone: TONE[s.tone ?? (i ? "done" : "origin")], time: i ? when(s) : delay - .1 }])}/>
    {stops.map((s, i) => s.label ? <div key={i} className={`scene-stop-label route-label ${s.below ? "below" : ""} ${s.tone ?? ""}`} style={{ left: `${s.x / 16.72}%`, top: `${s.y / 9.41}%`, "--t": `${(i ? when(s) : delay) + .1}s` } as CSSProperties}>
      <strong>{s.label}</strong>{s.detail ? <span>{s.detail}</span> : null}</div> : null)}
  </>;
}
