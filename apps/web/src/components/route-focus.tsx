"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Route focus (I07): after a client-side navigation, focus moves to the new page's heading, so keyboard and screen-reader
 * users start at the top of the page they asked for (Next.js already announces the new title). The first load keeps the
 * browser's own focus. Loading placeholders (aria-busy) are skipped; if the person has already moved focus into the new
 * page, it is left alone.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const started = document.activeElement;
    const heading = () => document.querySelector<HTMLElement>("#main-content:not([aria-busy]) h1");
    const land = (h: HTMLElement) => {
      if (document.activeElement !== started && document.activeElement !== document.body && document.querySelector("#main-content")?.contains(document.activeElement)) return;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    };
    const now = heading();
    if (now) { land(now); return; }
    const watch = new MutationObserver(() => { const h = heading(); if (h) { watch.disconnect(); clearTimeout(stop); land(h); } });
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const stop = setTimeout(() => watch.disconnect(), 5000);
    return () => { watch.disconnect(); clearTimeout(stop); };
  }, [pathname]);
  return null;
}
