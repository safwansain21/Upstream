"use client";
import { useEffect, useState } from "react";

/** Registers the app-shell worker in production. An update waits for all tabs to close; drafts are never discarded (H10). */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then(reg => {
      const check = () => setWaiting(!!reg.waiting);
      check(); reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", check));
    }).catch(() => undefined);
  }, []);
  return waiting ? <div className="page-banner" role="status">An update to Upstream is ready. It applies after you close all Upstream tabs; drafts on this device are kept.</div> : null;
}
