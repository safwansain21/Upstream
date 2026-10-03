"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Route focus (I07): after a client-side navigation, the page starts at the top and focus moves to the new page's heading, so keyboard and screen-reader
 * users start at the top of the page they asked for (Next.js already announces the new title). The first load keeps the
 * browser's own focus. Loading placeholders (aria-busy) are skipped; if the person has already moved focus into the new
 * page, it is left alone.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // Every new page starts at the top (Next scrolls its first in-flow element into view, which on pages that open with a
    // scene layer is a section part-way down). A link to a #section still lands on that section.
    const top = () => { if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
    top(); const raf = requestAnimationFrame(() => requestAnimationFrame(top));
    const started = document.activeElement;
    const heading = () => document.querySelector<HTMLElement>("#main-content:not([aria-busy]) h1");
    const land = (h: HTMLElement) => {
      if (document.activeElement !== started && document.activeElement !== document.body && document.querySelector("#main-content")?.contains(document.activeElement)) return;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    };
    const now = heading();
    if (now) { land(now); return () => cancelAnimationFrame(raf); }
    const watch = new MutationObserver(() => { const h = heading(); if (h) { watch.disconnect(); clearTimeout(stop); land(h); } });
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const stop = setTimeout(() => watch.disconnect(), 5000);
    return () => { watch.disconnect(); clearTimeout(stop); cancelAnimationFrame(raf); };
  }, [pathname]);
  return null;
}
