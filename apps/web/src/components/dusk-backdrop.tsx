"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { coverTransform } from "./scene-geometry";

const PLATE = "/upstream-dark/dusk-river-clean-plate.png";
const MATTE = "/upstream-dark/water-zone-matte.svg";
const FOLIAGE = "/upstream-dark/foreground-foliage-left.png";
const SOURCE_WIDTH = 1672;
const SOURCE_HEIGHT = 941;

function useWaterMotion(container: React.RefObject<HTMLDivElement | null>, canvas: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const host = container.current;
    const surface = canvas.current;
    if (!host || !surface) return;
    const context = surface.getContext("2d", { alpha: true });
    if (!context) return;
    const plate = new Image();
    const matte = new Image();
    plate.src = PLATE;
    matte.src = MATTE;
    let frame = 0;
    let visible = true;
    let lastFrame = 0;
    let activeSeconds = 0;
    let previousTime = 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5) * 0.64;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const enabled = () => !document.hidden && visible && !saveData && document.documentElement.dataset.motion !== "reduced" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => {
      const rect = host.getBoundingClientRect();
      surface.width = Math.max(1, Math.round(rect.width * ratio));
      surface.height = Math.max(1, Math.round(rect.height * ratio));
    };
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!enabled() || !plate.complete || !matte.complete || !plate.naturalWidth || !matte.naturalWidth) {
        previousTime = now;
        context.clearRect(0, 0, surface.width, surface.height);
        return;
      }
      activeSeconds += Math.min((now - (previousTime || now)) / 1000, 0.1);
      previousTime = now;
      if (now - lastFrame < 45) return;
      lastFrame = now;
      const { width, height } = surface;
      const crop = coverTransform(SOURCE_WIDTH, SOURCE_HEIGHT, width, height);
      context.clearRect(0, 0, width, height);
      const strip = 3;
      for (let y = Math.max(0, Math.floor(crop.y + crop.height * 0.34)); y < Math.min(height, crop.y + crop.height * 0.88); y += strip) {
        const depth = Math.max(0, Math.min(1, (y - crop.y) / crop.height));
        const sourceY = ((y - crop.y) / crop.height) * SOURCE_HEIGHT;
        const sourceStrip = (strip / crop.height) * SOURCE_HEIGHT + 0.5;
        const phase = (y / height) * 25;
        const offset = (Math.sin(phase + activeSeconds * 0.6) * 0.65 + Math.sin(phase * 1.9 - activeSeconds * 0.38) * 0.35) * (0.5 + depth * 2.2) * ratio;
        context.drawImage(plate, 0, sourceY, SOURCE_WIDTH, sourceStrip, crop.x + offset, y, crop.width, strip + 1);
      }
      context.globalCompositeOperation = "destination-in";
      context.drawImage(matte, crop.x, crop.y, crop.width, crop.height);
      context.globalCompositeOperation = "source-over";
    };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; }, { threshold: 0 });
    const resize = new ResizeObserver(size);
    observer.observe(host);
    resize.observe(host);
    size();
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); };
  }, [container, canvas]);
}

export function DuskBackdrop() {
  const pathname = usePathname();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useWaterMotion(host, canvas);
  return <div ref={host} className={`dusk-backdrop ${pathname === "/" ? "dusk-home" : ""}`} data-scene="river" aria-hidden="true">
    <img className="dusk-plate" src={PLATE} alt="" fetchPriority={pathname === "/" ? "high" : undefined}/>
    <canvas ref={canvas} className="dusk-water" data-motion="water"/>
    <img className="dusk-foliage dusk-branches" src={FOLIAGE} alt=""/>
    <img className="dusk-foliage dusk-reeds" src={FOLIAGE} alt=""/>
    <div className="dusk-grade"/>
    <svg className="dusk-route" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="dusk-route-gradient" x1="455" y1="708" x2="1513" y2="369" gradientUnits="userSpaceOnUse"><stop stopColor="#EEAF63"/><stop offset=".28" stopColor="#F4F0E8"/><stop offset="1" stopColor="#D8F0EF"/></linearGradient></defs>
      <g fill="none" stroke="url(#dusk-route-gradient)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        <path className="route-line route-main" data-route-path="main" pathLength="1" d="M455 708 C540 685 642 660 752 622 C856 585 939 573 993 522 C1031 484 1037 454 1108 437 C1177 422 1255 420 1325 398 C1397 376 1452 371 1513 369"/>
        <path className="route-line route-branch-a" pathLength="1" d="M1044 453 C1092 421 1142 405 1195 389 C1231 378 1271 369 1321 345"/>
        <path className="route-line route-branch-b" pathLength="1" d="M1195 389 C1171 367 1147 350 1141 329 C1140 307 1114 300 1085 291"/>
        <path className="route-line route-branch-c" pathLength="1" d="M1325 398 C1315 371 1353 355 1415 338 C1456 326 1480 313 1497 294"/>
      </g>
      <circle className="route-origin" data-origin-dot cx="455" cy="708" r="7" fill="#EEAF63" stroke="#FFF3D9" strokeWidth="2"/>
      <g className="route-endpoints" fill="#F4F0E8"><circle cx="1085" cy="291" r="4"/><circle cx="1321" cy="345" r="4"/><circle cx="1513" cy="369" r="4"/><circle cx="1497" cy="294" r="4"/></g>
    </svg>
  </div>;
}
