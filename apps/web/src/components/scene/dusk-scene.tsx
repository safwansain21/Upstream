"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { BRANCHES, PLATE, REEDS, ScenePicture } from "./scene-picture";
import { startWater } from "./water";

export const motionAllowed = () => document.documentElement.dataset.motion !== "reduced" && !matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The dusk river. Every art layer (plate, water, foliage, route) sits in one "art box" in plate coordinates
 * (1672×941) that CSS sizes like object-fit: cover, so they stay aligned at every viewport size.
 * hero: the landing's full scene. screen: public pages (first screen, fades to night). band: workspace masthead.
 */
export function DuskScene({ variant, route, eager = false }: { variant: "hero" | "screen" | "band"; route?: ReactNode; eager?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = host.current, surface = canvas.current, plate = scene?.querySelector<HTMLImageElement>(".scene-plate");
    if (!scene || !surface || !plate) return;
    scene.querySelectorAll<SVGPathElement>(".hero-route path, .scene-route path").forEach(path =>
      path.style.setProperty("--path-length", `${Math.ceil(path.getTotalLength())}px`));
    scene.classList.add("routes-ready");
    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(scene);
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const stop = startWater(surface, plate, "/upstream-dark/water-zone-matte.svg", () => visible && !document.hidden && !saveData && motionAllowed());
    return () => { io.disconnect(); stop(); };
  }, []);
  const foliage = variant !== "band";
  return <div ref={host} className={`dusk-scene dusk-${variant}`} data-scene="river" aria-hidden="true">
    <div className="scene-art">
      <ScenePicture asset={PLATE} className="scene-plate" eager={eager} sizes={variant === "band" ? "(max-width: 750px) 750px, 100vw" : "(max-aspect-ratio: 1672/941) 178vh, 100vw"}/>
      <canvas ref={canvas} className="scene-water" data-motion="water"/>
      {foliage ? <>
        <div className="scene-foliage scene-branches"><ScenePicture asset={BRANCHES} sizes="(max-aspect-ratio: 1672/941) 68vh, 38vw"/></div>
        <div className="scene-foliage scene-reeds"><ScenePicture asset={REEDS} sizes="(max-aspect-ratio: 1672/941) 130vh, 73vw"/></div>
      </> : null}
    </div>
    <div className="scene-grade"/>
    {route ? <div className="scene-art scene-overlay">{route}</div> : null}
  </div>;
}
