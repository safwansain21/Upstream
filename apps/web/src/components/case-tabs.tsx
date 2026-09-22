"use client";
import Link from "next/link";
import { useOrg } from "../lib/session";

/** One tab bar for every case page; case identity stays in the URL. Tabs the viewer cannot use are omitted (the API still enforces). */
export function CaseTabs({ caseId, current }: { caseId: string; current: string }) {
  const { org, can } = useOrg();
  const review = can("expert") || can("coordinate") || can("evidence_view");
  const tabs: [string, string, boolean][] = [["", "Overview", true], ["observations", "Observations", true], ["tasks", "Tasks", true],
    ["map-setup", "Map setup", can("coordinate") || can("network_verify") || can("expert")], ["evidence", "Evidence", review],
    ["history", "History", true], ["decision", "Decision", review], ["exports", "Exports", review]];
  return <nav className="tab-nav" aria-label="Investigation sections">{tabs.filter(t => t[2]).map(([path, label]) =>
    <Link key={label} className={current === path ? "active" : undefined} aria-current={current === path ? "page" : undefined}
      href={`/app/${org}/investigations/${caseId}${path ? `/${path}` : ""}`}>{label}</Link>)}</nav>;
}
