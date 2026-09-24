import type { CSSProperties, ReactNode } from "react";

/**
 * A luminous stage line drawn across the scene water, in plate coordinates (1672×941), inside DuskScene's route layer.
 * It draws once from its first stop; each dot arrives when the line reaches it. Illustrative only: the stops are
 * stages of a process, never locations. Pages always carry the same stages as real text elsewhere (this is aria-hidden).
 */
export type Stop = { x: number; y: number; label?: ReactNode; detail?: ReactNode; tone?: "origin" | "done" | "current" | "pending"; below?: boolean; ghost?: boolean };

/** Catmull-Rom through the stops, as cubic Béziers: a smooth line that passes exactly through every dot. */
export function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function SceneRoute({ stops, duration = 2.2, delay = .6, tail }: { stops: Stop[]; duration?: number; delay?: number; tail?: { x: number; y: number }[] }) {
  const d = smoothPath([...stops, ...(tail ?? [])]);
  // arrival time of each stop ∝ its share of the (approximate, chordal) path length
  const seg = stops.map((s, i) => i ? Math.hypot(s.x - stops[i - 1].x, s.y - stops[i - 1].y) : 0);
  const total = seg.reduce((a, b) => a + b, 0) + (tail ?? []).reduce((a, p, i, arr) => a + Math.hypot(p.x - (i ? arr[i - 1].x : stops.at(-1)!.x), p.y - (i ? arr[i - 1].y : stops.at(-1)!.y)), 0) || 1;
  let run = 0;
  const at = seg.map(l => (run += l) / total);
  return <>
    <svg className="scene-route" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true" style={{ "--draw": `${duration}s`, "--wait": `${delay}s` } as CSSProperties}>
      <path className="scene-route-glow" d={d}/>
      <path className="scene-route-line" d={d}/>
      {stops.map((s, i) => s.ghost ? null : <circle key={i} className={`scene-stop ${s.tone ?? "pending"}`} cx={s.x} cy={s.y} r={s.tone === "origin" || s.tone === "current" ? 7 : 5} style={{ "--at": at[i] } as CSSProperties}/>)}
    </svg>
    {stops.map((s, i) => s.label ? <div key={i} className={`scene-stop-label ${s.below ? "below" : ""} ${s.tone ?? ""}`} style={{ left: `${s.x / 16.72}%`, top: `${s.y / 9.41}%`, "--at": at[i], "--draw": `${duration}s`, "--wait": `${delay}s` } as CSSProperties}>
      <strong>{s.label}</strong>{s.detail ? <span>{s.detail}</span> : null}</div> : null)}
  </>;
}
