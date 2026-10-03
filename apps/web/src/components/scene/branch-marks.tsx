"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { P } from "./route-geometry";

type Place = "above" | "right" | "below" | "left";
export type Mark = { at: P; term: string; line: string; sides?: Place[] };

/**
 * The hero's three branch ends, each a place where water joins upstream and how readings settle it. They are
 * parallel, not steps. Hover, focus or tap a dot for its note (the origin note's
 * treatment: display italic on a hairline stem). Buttons sit above the scene, placed in the scene's plate coordinates;
 * each note takes the first side that clears the hero's text, buttons and process line, and a dot cropped out of view
 * is left out.
 */
const PLATE_BOX: [number, number] = [1672, 941];
export function BranchMarks({ marks, box = PLATE_BOX }: { marks: Mark[]; box?: [number, number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<({ x: number; y: number; place: Place } | null)[]>([]);
  const [pinned, setPinned] = useState<number | null>(null); // a tap keeps a note open (touch has no hover)
  useEffect(() => {
    const layer = ref.current; if (!layer) return;
    const measure = () => {
      const art = document.querySelector(".dusk-hero .scene-art")?.getBoundingClientRect(), own = layer.getBoundingClientRect();
      if (!art) return;
      const lines = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()]; }; // the text, not its block
      const blockers = [...[...document.querySelectorAll(".hero-content h1, .hero-subtitle")].flatMap(lines),
        ...[...document.querySelectorAll(".hero-actions .button, .hero-process li, .app-header")].map(b => b.getBoundingClientRect())];
      const notes = [...layer.querySelectorAll<HTMLElement>(".branch-note")];
      setSpots(marks.map((m, i) => {
        const x = art.left - own.left + m.at[0] / box[0] * art.width, y = art.top - own.top + m.at[1] / box[1] * art.height;
        if (x < 16 || y < 16 || x > own.width - 16 || y > own.height - 16) return null;
        const note = notes[i], w = note?.offsetWidth || 240, h = note?.offsetHeight || 60, gap = 22;
        const rects: Record<Place, [number, number, number, number]> = {
          above: [x - w + 1, y - h - gap, x + 1, y - gap], right: [x + gap, y - h / 2, x + gap + w, y + h / 2],
          below: [x - w + 1, y + gap, x + 1, y + h + gap], left: [x - gap - w, y - h / 2, x - gap, y + h / 2],
        };
        const clear = (p: Place) => {
          const [l, t, r, b] = rects[p];
          if (l < 8 || t < 8 || r > own.width - 8 || b > own.height - 8) return false;
          return !blockers.some(k => l + own.left < k.right + 10 && r + own.left > k.left - 10 && t + own.top < k.bottom + 10 && b + own.top > k.top - 10);
        };
        const place = (m.sides ?? ["above", "right", "below", "left"]).find(clear);
        return place ? { x, y, place } : null;
      }));
    };
    // The marks only appear once the route has drawn (about 2 s), so nothing here runs while the page is loading: the
    // first measurement waits until the hero's text, buttons and scene have settled, then follows resizes.
    const observer = new ResizeObserver(measure);
    let frame = 0;
    const watchArt = () => { // the scene mounts on its own schedule: wait for its art box, then follow its size too
      const art = document.querySelector(".dusk-hero .scene-art");
      if (art) { observer.observe(document.documentElement); observer.observe(layer); observer.observe(art); measure(); } else frame = requestAnimationFrame(watchArt);
    };
    const start = window.setTimeout(watchArt, 1200);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(start); };
  }, [marks, box]);
  return <div ref={ref} className="branch-marks">
    {marks.map((m, i) => { const s = spots[i]; return <button key={m.term} type="button" aria-expanded={pinned === i} onClick={() => setPinned(pinned === i ? null : i)} className={`branch-mark route-label ${s ? s.place : "out"}${pinned === i ? " is-open" : ""}`}
      style={{ left: s?.x ?? 0, top: s?.y ?? 0, "--i": i } as CSSProperties}>
      <span className="branch-note"><span className="branch-term">{m.term}</span><span className="branch-line">{m.line}</span></span>
    </button>; })}
  </div>;
}
