"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { BRANCHES, PLATE, REEDS, ScenePicture } from "./scene-picture";
import { startWater } from "./water";

export const motionAllowed = () => document.documentElement.dataset.motion === "full" ||
  (document.documentElement.dataset.motion !== "reduced" && !matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * The dusk river. Every art layer (plate, water, foliage, route) sits in one "art box" in plate coordinates
 * (1672×941) that CSS sizes like object-fit: cover, so they stay aligned at every viewport size.
 * hero: the landing's full scene. screen: public pages (first screen, fades to night). band: workspace masthead.
 */
export function DuskScene({ variant, route, eager = false, still = false }: { variant: "hero" | "screen" | "band"; route?: ReactNode; eager?: boolean; still?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The band shows only a graded sliver of water, and a loading screen is gone in a moment: both keep a still plate, no WebGL
  // context. A still screen loads its images eagerly: a lazy image unmounted before it loads stays registered with the
  // document and keeps the whole detached scene alive (measured: one scene per workspace navigation).
  const live = variant !== "band" && !still;
  useEffect(() => {
    const scene = host.current, surface = canvas.current, plate = scene?.querySelector<HTMLImageElement>(".scene-plate");
    if (!scene) return;
    scene.querySelectorAll<SVGPathElement>(".hero-route path, .scene-route path").forEach(path =>
      path.style.setProperty("--path-length", `${Math.ceil(path.getTotalLength())}px`));
    scene.classList.add("routes-ready");
    let visible = true;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const active = () => visible && !document.hidden && !saveData && motionAllowed();
    const water = surface && plate ? startWater(surface, plate, "/upstream-dark/water-zone-matte.svg", active) : null;
    // one switch for water and foliage: offscreen, hidden tab, reduced motion or save-data stops both; resume is seamless
    const refresh = () => { scene.toggleAttribute("data-paused", !active()); water?.refresh(); };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
    io.observe(scene);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("upstream-preferences", refresh);
    motion.addEventListener("change", refresh);
    refresh();
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("upstream-preferences", refresh); motion.removeEventListener("change", refresh); water?.stop(); };
  }, []);
  return <div ref={host} className={`dusk-scene dusk-${variant}`} data-scene="river" aria-hidden="true">
    <div className="scene-art">
      <ScenePicture asset={PLATE} className="scene-plate" eager={eager} sizes={variant === "band" ? "(max-width: 750px) 750px, 100vw" : "(max-aspect-ratio: 1672/941) 178vh, 100vw"}/>
      {live ? <canvas ref={canvas} className="scene-water" data-motion="water"/> : null}
      {variant !== "band" ? <>
        <div className="scene-foliage scene-branches"><ScenePicture asset={BRANCHES} eager={still} sizes="(max-aspect-ratio: 1672/941) 68vh, 38vw"/></div>
        <div className="scene-foliage scene-reeds"><ScenePicture asset={REEDS} eager={still} sizes="(max-aspect-ratio: 1672/941) 130vh, 73vw"/></div>
      </> : null}
    </div>
    <div className="scene-grade"/>
    {route ? <div className="scene-art scene-overlay">{route}</div> : null}
  </div>;
}
