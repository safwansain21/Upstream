"use client";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { publishRoute } from "./dusk-scene";
import { curve, random, trace, type P } from "./route-geometry";

/**
 * A luminous illustrative route in plate coordinates (1672×941), drawn once (MOTION_SPEC "Luminous routes and dots").
 * Solid lines draw with pathLength=1 dash offsets; ruled-out branches are dashes that light in order; sparkles and dots
 * arrive when the line reaches them. Everything is timed in CSS from the values set here, so the final state is the
 * plain, un-animated style (reduced motion and no-JS both see it). Decorative: always aria-hidden.
 * `publish`: the page's live water draws this route inside itself (water.ts) and this SVG becomes the fallback, shown
 * only while that layer is not drawing. Both follow the page's route clock. Unpublished routes (example cards, which
 * sit on still pictures) get a rippled displacement, reflections under their dots and a screen blend instead.
 */
export type Line = { pts: readonly P[]; lead?: P; kind?: "main" | "branch" | "ruled" | "tail" | "strand"; start: number; dur: number; ease?: "in" | "out" | "even" };
export type Dot = { at: P; tone: "origin" | "end" | "ruled" | "current"; time: number };

const EASE = { in: "cubic-bezier(.45, 0, .75, .8)", out: "cubic-bezier(.3, .45, .4, 1)", even: "cubic-bezier(.45, 0, .2, 1)" };
/** When the eased dash reaches a share f of the line (approximate inverse of the easing above). */
const reach = (f: number, ease: Line["ease"]) => ease === "in" ? f ** (1 / 1.6) : ease === "out" ? 1 - Math.sqrt(1 - f) : f < .5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
const s = (n: number) => `${Math.round(n * 1000) / 1000}s`;

/** `box` is the viewBox; the default is the scene plate, drawn at its own aspect ratio. A `stretch` box (process spines)
 *  is sized in px vertically, so strokes need no compensation and its dots are drawn in HTML by the caller. */
export function LightRoute({ lines, dots, sparkles = 1, seed = 7, ink, className = "", box = [1672, 941], stretch = false, publish = false }: { lines: Line[]; dots: Dot[]; sparkles?: number; seed?: number; ink?: { id: string; from: P; to: P }; className?: string; box?: P; stretch?: boolean; publish?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => { // hand the route to the live water in plate coordinates, measured from where this SVG sits on the art box
    const el = svg.current, art = document.querySelector<HTMLCanvasElement>("canvas.scene-water")?.parentElement;
    if (!publish || !el || !art) return;
    const send = () => {
      const r = el.getBoundingClientRect(), a = art.getBoundingClientRect();
      if (!r.width || !a.width) return;
      const map = (p: P): P => [((r.left + p[0] / box[0] * r.width) - a.left) / a.width * 1672, ((r.top + p[1] / box[1] * r.height) - a.top) / a.height * 941];
      publishRoute({ sparkles: sparkles * 1.1, seed, lines: lines.map(l => ({ ...l, pts: l.pts.map(map), lead: l.lead && map(l.lead) })), dots: dots.map(d => ({ ...d, at: map(d.at) })) });
    };
    const observer = new ResizeObserver(send); observer.observe(el); observer.observe(art); send();
    return () => { observer.disconnect(); publishRoute(null); };
  }, [publish, lines, dots, sparkles, seed, box]);
  useEffect(() => { // strokes stay the same on-screen width however large the art box is drawn
    const el = svg.current; if (!el || stretch) return;
    const fit = () => el.style.setProperty("--k", String(Math.max(.2, el.clientWidth / box[0])));
    const observer = new ResizeObserver(fit); observer.observe(el); fit();
    return () => observer.disconnect();
  }, [box[0], stretch]);
  const rand = random(seed);
  const water = !stretch; // stretch spines keep a clean line: their water is drawn by the scene
  return <svg ref={svg} className={`light-route ${publish ? "route-sync" : "route-card"} ${className}`} viewBox={`0 0 ${box[0]} ${box[1]}`} preserveAspectRatio="none" aria-hidden="true">
    <defs>
      {ink ? <linearGradient id={ink.id} x1={ink.from[0]} y1={ink.from[1]} x2={ink.to[0]} y2={ink.to[1]} gradientUnits="userSpaceOnUse">
        <stop stopColor="#EEAF63"/><stop offset=".3" stopColor="#F4F0E8"/><stop offset="1" stopColor="#DDF2F0"/></linearGradient> : null}
      {water ? <>
        <filter id={`${uid}w`} x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".0024 .05" numOctaves="2" seed={seed} result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
        <radialGradient id={`${uid}r`}><stop stopColor="#f4f0e8" stopOpacity=".55"/><stop offset="1" stopColor="#f4f0e8" stopOpacity="0"/></radialGradient>
        <radialGradient id={`${uid}a`}><stop stopColor="#eeaf63" stopOpacity=".6"/><stop offset="1" stopColor="#eeaf63" stopOpacity="0"/></radialGradient></> : null}
    </defs>
    <g filter={water ? `url(#${uid}w)` : undefined}>
    {lines.map((line, i) => {
      const kind = line.kind ?? "branch", ease = line.ease ?? "even", t = trace(line.pts, line.lead, kind === "ruled" ? 48 : 20);
      const time = (f: number) => line.start + line.dur * reach(f, ease);
      const glints = kind === "strand" || kind === "tail" ? [] : Array.from({ length: Math.round(t.length / (kind === "ruled" ? 40 : 16) * sparkles) }, () => {
        const f = kind === "main" ? 1 - (1 - rand()) ** 1.7 : rand(), at = t.at[Math.min(t.at.length - 1, Math.round(f * (t.at.length - 1)))];
        const spread = (rand() - .5) * (rand() < .7 ? 16 : 44) * (kind === "main" ? .4 + f : 1);
        return { x: at.p[0] + at.normal[0] * spread, y: at.p[1] + at.normal[1] * spread, r: .6 + rand() * 1.1, o: .22 + rand() * .5, t: time(f) + .05 };
      });
      if (kind === "ruled") { // dashes of 11 units, gaps of 11, each lit as the line reaches it
        const dashes: string[] = [], times: number[] = [];
        for (let from = 0; from < t.length - 4; from += 22) {
          const run = t.at.filter(a => a.f * t.length >= from && a.f * t.length <= from + 11);
          if (run.length > 1) { dashes.push("M" + run.map(a => `${Math.round(a.p[0] * 10) / 10} ${Math.round(a.p[1] * 10) / 10}`).join(" L")); times.push(time(from / t.length)); }
        }
        return <g key={i} className="lr-ruled">{dashes.map((d, j) => <path key={j} d={d} className="lr-dash" style={{ "--t": s(times[j]) } as CSSProperties}/>)}
          {glints.map((g, j) => <circle key={j} className="lr-spark" cx={Math.round(g.x)} cy={Math.round(g.y)} r={g.r.toFixed(1)} style={{ "--t": s(g.t), "--o": g.o.toFixed(2) } as CSSProperties}/>)}</g>;
      }
      const d = curve(line.pts, line.lead), style = { "--start": s(line.start), "--dur": s(line.dur), "--ease": EASE[ease] } as CSSProperties;
      return <g key={i} className={`lr-${kind}`}>
        {kind === "main" || kind === "branch" ? <path d={d} pathLength={1} className="lr-draw lr-haze" style={style}/> : null}
        <path d={d} pathLength={1} className="lr-draw lr-line" style={style} stroke={ink && kind === "main" ? `url(#${ink.id})` : undefined}/>
        {glints.map((g, j) => <circle key={j} className="lr-spark" cx={Math.round(g.x)} cy={Math.round(g.y)} r={g.r.toFixed(1)} style={{ "--t": s(g.t), "--o": g.o.toFixed(2) } as CSSProperties}/>)}
      </g>;
    })}
    </g>
    {stretch ? null : dots.map((dot, i) => <g key={i} className={`lr-dot lr-${dot.tone}`} style={{ "--t": s(dot.time) } as CSSProperties}>
      {dot.tone === "ruled" ? null : <ellipse className="lr-reflection" cx={dot.at[0]} cy={dot.at[1]} fill={`url(#${uid}${dot.tone === "origin" || dot.tone === "current" ? "a" : "r"})`}/>}
      <circle className="lr-halo" cx={dot.at[0]} cy={dot.at[1]}/><circle className="lr-core" cx={dot.at[0]} cy={dot.at[1]}/></g>)}
  </svg>;
}
