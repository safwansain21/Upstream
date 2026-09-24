"use client";
import { useEffect, useState } from "react";
import { InfoIcon } from "./icons";
import { InlineError } from "./ui";

type Key = "api" | "database" | "storage" | "worker" | "ai" | "email";
type StatusData = Partial<Record<Key, string>>;
type Tone = "ok" | "limited" | "off";
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";

/** Plain meaning for each reported state: service readiness only, never water or scientific status. */
function describe(key: Key, value?: string): [Tone, string, string] {
  if (!value) return ["off", "Unverified.", "The last check did not return this service."];
  const ok = value === "available";
  switch (key) {
    case "api": return ok ? ["ok", "Available and responding.", "Pages and forms can reach Upstream."] : ["off", "Not responding.", "Drafts stay on this device until it returns."];
    case "database": return ok ? ["ok", "Available and accepting observations.", "Reports, tasks and reviews are being recorded."] : ["off", "Unavailable.", "Nothing new can be recorded; drafts stay on this device."];
    case "storage": return ok ? ["ok", "Available and writing new files.", "Photos and evidence packages can be stored."] : ["limited", "Not verified by this check.", "Photo uploads are confirmed when each one is sent."];
    case "worker": return ok ? ["ok", "Available.", "Analyses and exports are processed in the background."] : ["limited", "Delayed.", "Analyses and exports wait in the queue until processing resumes."];
    case "ai": return value === "configured" ? ["limited", "Configured, not verified.", "Optional wording suggestions may be offered; manual reporting always works."] : ["limited", "Currently unavailable. Manual work continues.", "Nothing depends on it."];
    case "email": return value === "local_mail_catcher" ? ["limited", "Local test inbox only.", "Messages are kept for testing and are not delivered externally."] : [ok ? "ok" : "limited", ok ? "Available." : value, ""];
  }
}
const SERVICES: [Key, string][] = [["api", "Application"], ["database", "Report intake"], ["storage", "Storage"], ["worker", "Background processing"], ["ai", "Optional AI features"], ["email", "Email"]];

export function ServiceStatus() {
  const [data, setData] = useState<StatusData>({});
  const [map, setMap] = useState<"checking" | "ok" | "fail" | "none">(MAP_STYLE ? "checking" : "none");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    setChecking(true); setError(""); setData({});
    async function check() {
      try {
        const response = await fetch("/api/v1/status", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Service status could not be retrieved.");
        const payload = await response.json();
        if (!payload.data || typeof payload.data !== "object") throw new Error("Service status was not in the expected format.");
        if (active) { setData(payload.data); setCheckedAt(new Date().toLocaleString()); }
      } catch { if (active) { setError("The status check did not complete. Service availability is unverified. You can retry when your connection is available."); setCheckedAt(""); } }
      finally { clearTimeout(timeout); if (active) setChecking(false); }
      if (MAP_STYLE && active) { setMap("checking"); fetch(MAP_STYLE, { cache: "no-store", signal: controller.signal }).then(r => active && setMap(r.ok ? "ok" : "fail"), () => active && setMap("fail")); }
    }
    void check();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  const mapRow: [Tone, string, string] = map === "none" ? ["off", "Not configured.", "Maps draw Upstream data on a plain background."] : map === "checking" ? ["off", "Checking…", ""]
    : map === "ok" ? ["ok", "Reachable from this browser.", "OpenFreeMap style, keyless. If it fails, maps say so and lists keep the same information."] : ["limited", "Not reachable from this browser.", "Maps fall back to a labelled plain background; lists keep the same information."];
  return <section className="status-board" aria-label="Service availability" aria-busy={checking}>{error ? <InlineError>{error}</InlineError> : null}
    <ul className="status-rows">{[...SERVICES.map(([key, label]) => [label, ...(checking ? ["off", "Checking…", ""] : describe(key, data[key]))] as [string, Tone, string, string]), ["Background map", ...mapRow] as [string, Tone, string, string]].map(([label, tone, summary, detail]) =>
      <li key={label}><details><summary><span className={`status-dot tone-${tone}`} aria-hidden="true"/><span className="status-name">{label}</span><span className="status-summary">{summary}</span></summary>{detail ? <p>{detail}</p> : null}</details></li>)}</ul>
    <div className="status-foot"><div><span className="subtle small">Last checked</span><p role="status">{checkedAt || "No completed check for this page."}</p></div>
      <button type="button" className="button button-outline" disabled={checking} onClick={() => setAttempt(value => value + 1)}>{checking ? "Checking services…" : "Refresh status"}</button>
      <p className="status-note"><InfoIcon/> The local test inbox does not deliver email externally. Checks show service readiness, not the scientific validity of an investigation.</p></div>
  </section>;
}
