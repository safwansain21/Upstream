"use client";
import { useEffect, useRef, useState } from "react";

/** The landing's note at the amber origin. It stands above the dot; where a short window brings the hero's buttons or
 *  process line into its way, it moves beside the dot, and if even that collides it is left out (the hero says the same). */
export function OriginNote({ note, left, top }: { note: string; left: string; top: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [place, setPlace] = useState<"above" | "beside" | "hidden">("above");
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const blockers = () => [...document.querySelectorAll(".hero-actions .button, .hero-process li, .hero-content h1, .hero-subtitle")].map(b => b.getBoundingClientRect());
    const hits = (r: DOMRect) => blockers().some(b => r.left < b.right + 8 && r.right > b.left - 8 && r.top < b.bottom + 8 && r.bottom > b.top - 8);
    const check = () => {
      for (const next of ["above", "beside"] as const) {
        el.className = `hero-origin-note route-label ${next}`;
        if (!hits(el.getBoundingClientRect())) { setPlace(next); return; }
      }
      setPlace("hidden");
    };
    const observer = new ResizeObserver(check); observer.observe(document.documentElement); check();
    return () => observer.disconnect();
  }, []);
  return <p ref={ref} className={`hero-origin-note route-label ${place}`} style={{ left, top }}>{note}</p>;
}
