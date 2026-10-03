"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { BRANCHES, PLATE, REEDS, SUN_PATCH, ScenePicture } from "./scene-picture";
import { resetRouteClock, startRouteClock, startWater, type GlRoute } from "./water";

type RouteWindow = Window & { __upstreamRoute?: GlRoute | null };
/** A light route asks the page's live scene to draw it inside the water (see LightRoute `publish`). */
export function publishRoute(route: GlRoute | null) {
  (window as RouteWindow).__upstreamRoute = route;
  window.dispatchEvent(new Event("upstream-route"));
}

export const motionAllowed = () => document.documentElement.dataset.motion === "full" ||
  (document.documentElement.dataset.motion !== "reduced" && !matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * The dusk river. Every art layer (plate, water, foliage, route) sits in one "art box" in plate coordinates
 * (1672×941) that CSS sizes like object-fit: cover, so they stay aligned at every viewport size.
 * hero: the landing's full scene. screen: public pages (first screen, fades to night). band: workspace masthead.
 */
/** `reeds={false}`: a page whose line must start where the foreground reeds stand (how it works) leaves them out. */
/** `fixed`: long reading pages keep the river behind the text as it scrolls instead of leaving it at the top. */
/** `sunrise`: the landing opens before dawn; the sun clears the ridge and the scene lights up (CSS only; reduced motion
 *  shows the risen sun). */
export function DuskScene({ variant, route, eager = false, still = false, reeds = true, fixed = false, sunrise = false }: { variant: "hero" | "screen" | "band"; route?: ReactNode; eager?: boolean; still?: boolean; reeds?: boolean; fixed?: boolean; sunrise?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The band shows only a graded sliver of water, and a loading screen is gone in a moment: both keep a still plate, no WebGL
  // context. A still screen paints the plate as a CSS background and has no <img> at all: an image element unmounted while
  // its load is pending keeps the whole detached screen alive (measured: one ~100-node scene per public navigation, even
  // with eager loading). The foliage is left out for that moment.
  const live = variant !== "band" && !still;
  useEffect(() => {
    const scene = host.current, surface = canvas.current, plate = scene?.querySelector<HTMLImageElement>(".scene-plate");
    if (!scene) return;
    let visible = true;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const active = () => visible && !document.hidden && !saveData && motionAllowed();
    const water = surface && plate ? startWater(surface, plate, "/upstream-dark/water-zone-matte.svg", active) : null;
    // The route clock starts when the water can draw the route; without that layer (no WebGL, reduced motion, a still
    // scene) or if it is slow to get ready, the SVG copy and the labels start on their own.
    // Only a live scene owns the clock (a still band further down the page never does).
    const owner = Boolean(surface);
    if (owner) resetRouteClock();
    let fallback = owner ? window.setTimeout(() => { // after this commit's routes have published themselves
      const waits = water && active() && (window as RouteWindow).__upstreamRoute;
      if (waits) fallback = window.setTimeout(startRouteClock, 1600); else startRouteClock();
    }, 0) : 0;
    const takeRoute = () => water?.setRoute((window as RouteWindow).__upstreamRoute ?? null);
    if (owner) { window.addEventListener("upstream-route", takeRoute); takeRoute(); }
    // one switch for water and foliage: offscreen, hidden tab, reduced motion or save-data stops both; resume is seamless
    const refresh = () => { scene.toggleAttribute("data-paused", !active()); water?.refresh(); };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
    io.observe(scene);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("upstream-preferences", refresh);
    motion.addEventListener("change", refresh);
    refresh();
    return () => { if (owner) { window.clearTimeout(fallback); window.removeEventListener("upstream-route", takeRoute); resetRouteClock(); } io.disconnect(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("upstream-preferences", refresh); motion.removeEventListener("change", refresh); water?.stop(); };
  }, []);
  return <div ref={host} className={`dusk-scene dusk-${variant}${fixed ? " dusk-fixed" : ""}`} data-scene="river" aria-hidden="true">
    <div className="scene-art">
      {still ? <div className="scene-plate scene-plate-still"/> : <ScenePicture asset={PLATE} className="scene-plate" eager={eager} sizes={variant === "band" ? "(max-width: 750px) 750px, 100vw" : "(max-aspect-ratio: 1672/941) 178vh, 100vw"}/>}
      {sunrise ? <div className="scene-sunrise"><ScenePicture asset={SUN_PATCH} eager sizes="15vw"/>
        <div className="sun-sky"><div className="sun-body"><span className="sun-glow"/><span className="sun-disc"/></div></div></div> : null}
      {live ? <canvas ref={canvas} className="scene-water" data-motion="water"/> : null}
      {variant !== "band" && !still ? <>
        <div className="scene-foliage scene-branches"><ScenePicture asset={BRANCHES} sizes="(max-aspect-ratio: 1672/941) 68vh, 38vw"/></div>
        {reeds ? <div className="scene-foliage scene-reeds"><ScenePicture asset={REEDS} sizes="(max-aspect-ratio: 1672/941) 130vh, 73vw"/></div> : null}
      </> : null}
    </div>
    {sunrise ? <div className="scene-dawn"/> : null}
    <div className="scene-grade"/>
    {route ? <div className="scene-art scene-overlay">{route}</div> : null}
  </div>;
}
