"use client";
import { useEffect, useState } from "react";
import { CaseStatus, InlineError } from "./ui";

const services = [["api", "Application service"], ["database", "Investigation records"], ["storage", "Evidence storage"], ["worker", "Background processing"], ["ai", "Optional AI assistance"], ["email", "Email delivery"]] as const;
type StatusData = Partial<Record<(typeof services)[number][0], string>>;
const labels: Record<string, string> = { available: "Available", unavailable: "Unavailable", configured: "Configured · not verified", local_mail_catcher: "Local test inbox only" };
export function ServiceStatus() {
  const [data, setData] = useState<StatusData>({});
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
        if (active) { setData(payload.data); setCheckedAt(new Date().toLocaleTimeString()); }
      } catch { if (active) { setError("The status check did not complete. Service availability is unverified. You can retry when your connection is available."); setCheckedAt(""); } }
      finally { clearTimeout(timeout); if (active) setChecking(false); }
    }
    void check();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return <section aria-label="Service availability" aria-busy={checking}>{error ? <InlineError>{error}</InlineError> : null}<table className="status-list"><caption className="visually-hidden">Latest service availability check</caption><thead><tr><th scope="col">Service</th><th scope="col">Status</th></tr></thead><tbody>{services.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td><CaseStatus tone={data[key] === "available" ? "accepted" : data[key] === "unavailable" ? "warning" : "neutral"}>{checking ? "Checking…" : labels[data[key] || ""] || "Unverified"}</CaseStatus></td></tr>)}</tbody></table><div className="status-actions"><button type="button" className="button button-outline" disabled={checking} onClick={() => setAttempt(value => value + 1)}>{checking ? "Checking services…" : "Check again"}</button><p className="muted" role="status">{checkedAt ? `Last checked at ${checkedAt} on this device.` : "No completed check for this page."}</p></div></section>;
}
