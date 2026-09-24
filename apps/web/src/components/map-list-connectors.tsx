"use client";
import { useEffect, useRef, type RefObject } from "react";

type Row = { id: string; lon: number; lat: number };
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const MAX = 24;

/**
 * Correspondence lines from each visible listed case (its real row) to its real marker (MapLibre project()).
 * UI lines, not waterways: they sit above the map, never take pointer events, and are hidden when the map is simplified.
 * Geometry is recomputed on map movement, resize and scroll, and written straight to the SVG (no React state per frame).
 * Each curve arcs by a stable per-case offset, so crossings are deliberate and stay put when the list reorders.
 */
export function MapListConnectors({ container, map, rows, active }: { container: RefObject<HTMLElement | null>; map: any; rows: Row[]; active?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const host = container.current, layer = svg.current;
    if (!host || !layer || !map) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const box = host.getBoundingClientRect(), mapBox = map.getContainer().getBoundingClientRect();
      const viewTop = Math.max(0, -box.top), viewBottom = viewTop + innerHeight;
      let shown = 0;
      for (const row of rows) {
        const path = layer.querySelector<SVGPathElement>(`[data-connector-for="${row.id}"]`), el = host.querySelector<HTMLElement>(`[data-connector-row="${row.id}"]`);
        if (!path) continue;
        const r = el?.getBoundingClientRect();
        const p = map.project([row.lon, row.lat]);
        const ax = r ? r.right - box.left + 10 : 0, ay = r ? r.top - box.top + r.height / 2 : 0;
        const mx = mapBox.left - box.left + p.x, my = mapBox.top - box.top + p.y;
        const inMap = p.x >= 0 && p.y >= 0 && p.x <= mapBox.width && p.y <= mapBox.height;
        const visible = !!r && ay > viewTop - 20 && ay < viewBottom + 20 && inMap && shown < MAX;
        path.style.display = visible ? "" : "none";
        if (!visible) continue;
        shown++;
        const dx = mx - ax, bend = ((hash(row.id) % 5) - 2) * 34;
        path.setAttribute("d", `M${ax} ${ay} C${ax + dx * .45} ${ay + bend} ${mx - dx * .38} ${my - bend * .7} ${mx} ${my}`);
        path.style.setProperty("--path-length", `${Math.ceil(path.getTotalLength())}px`);
        path.classList.add("draw-ready");
      }
      layer.setAttribute("width", String(box.width)); layer.setAttribute("height", String(box.height));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    map.on("move", schedule); addEventListener("scroll", schedule, { passive: true }); addEventListener("resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); map.off("move", schedule); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); };
  }, [container, map, rows]);
  return <svg ref={svg} className={`map-connectors ${active ? "has-active" : ""}`} aria-hidden="true">
    {rows.map((row, i) => <path key={row.id} data-connector-for={row.id} className={active === row.id ? "active" : undefined} style={{ animationDelay: `${Math.min(i, 12) * 110}ms`, display: "none" }}/>)}
  </svg>;
}
