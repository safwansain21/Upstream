"use client";
import { useEffect, useState } from "react";

/** Registers the app-shell worker in production. An update waits for all tabs to close; drafts are never discarded (H10). */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let timer = 0;
    navigator.serviceWorker.register("/sw.js").then(reg => {
      const check = () => setWaiting(!!reg.waiting);
      const watch = (w: ServiceWorker | null) => w?.addEventListener("statechange", check);
      // the browser may already be installing the new version before this runs: watch it, and look again for a minute
      watch(reg.installing); reg.addEventListener("updatefound", () => watch(reg.installing)); check();
      reg.update().catch(() => undefined); // browsers may skip their own check on a reload: ask once per load
      let tries = 0; timer = window.setInterval(() => { check(); if (++tries >= 30 || reg.waiting) window.clearInterval(timer); }, 2000);
    }).catch(() => undefined);
    return () => window.clearInterval(timer);
  }, []);
  return waiting ? <div className="page-banner" role="status">An update to Upstream is ready. It applies after you close all Upstream tabs; drafts on this device are kept.</div> : null;
}
