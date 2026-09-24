"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { WORKFLOW, workflowTone } from "../lib/labels";
import { useOrg } from "../lib/session";
import { DocumentTitle } from "./document-title";
import { CaseStatus, OriginBadge } from "./ui";

type CaseIdentity = { title: string; locality: string | null; workflow: string; data_origin: string };

/** One tab bar for every case page; case identity stays in the URL. Tabs the viewer cannot use are omitted (the API still enforces). */
export function CaseTabs({ caseId, current }: { caseId: string; current: string }) {
  const { org, can } = useOrg();
  const review = can("expert") || can("coordinate") || can("evidence_view");
  const tabs: [string, string, boolean][] = [["", "Overview", true], ["map-setup", "Local map", can("coordinate") || can("network_verify") || can("expert")],
    ["observations", "Observations", true], ["tasks", "Tasks", true], ["evidence", "Evidence", review], ["decision", "Decision", review],
    ["history", "History", true], ["exports", "Packages", review]];
  return <nav className="tab-nav case-tabs" aria-label="Investigation sections">{tabs.filter(t => t[2]).map(([path, label]) =>
    <Link key={label} className={current === path ? "active" : undefined} aria-current={current === path ? "page" : undefined}
      href={`/app/${org}/investigations/${caseId}${path ? `/${path}` : ""}`}>{label}</Link>)}</nav>;
}

/**
 * The stable case header on every case page: back link, the case name and its origin, the unconfirmed-cause reminder,
 * the workflow state, then the tabs. On the overview the name is the page heading; elsewhere the page has its own.
 */
export function CaseHeader({ caseId, current, nameIsHeading = false }: { caseId: string; current: string; nameIsHeading?: boolean }) {
  const { org } = useOrg();
  const c = useQuery({ queryKey: ["case", org, caseId], queryFn: () => api<CaseIdentity>(`/orgs/${org}/cases/${caseId}`) });
  const name = c.data?.title ?? "Investigation";
  return <header className="case-header">
    {nameIsHeading ? <DocumentTitle title={name}/> : null}
    <Link className="back-link" href={`/app/${org}/investigations`}>All investigations</Link>
    <div className="case-identity">
      <div>{nameIsHeading ? <h1>{name}</h1> : <p className="case-name">{name}</p>}
        <p className="meta-row">{c.data?.locality ? <span>{c.data.locality}</span> : <span>Location to be confirmed</span>}{c.data ? <OriginBadge origin={c.data.data_origin}/> : null}<span className="badge status-warning"><span className="dot" aria-hidden="true"/>Cause unconfirmed</span></p></div>
      {c.data ? <div className="case-state"><CaseStatus tone={workflowTone(c.data.workflow)}>{WORKFLOW[c.data.workflow] ?? c.data.workflow}</CaseStatus></div> : null}
    </div>
    <CaseTabs caseId={caseId} current={current}/>
  </header>;
}
