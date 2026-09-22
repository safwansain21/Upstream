"use client";
import { useQuery } from "@tanstack/react-query";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Protocol = { id: string; version: number; name: string; status: string; data_origin: string; source: string; instructions: string | null; replicates: number | null };

export default function Protocols() {
  const { org } = useOrg();
  const q = useQuery({ queryKey: ["protocols", org], queryFn: () => api<Protocol[]>(`/orgs/${org}/protocols`) });
  return <main id="main-content" className="page-shell"><PageIntro title="Protocols"><p>Versioned measurement protocols with their provenance. Example bounds are never used as defaults for real deployments.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message}</InlineError> : !q.data ? <LoadingState/> : !q.data.length
      ? <EmptyState title="No protocols recorded"><p>An expert records a reviewed protocol before protocol readings can be assigned.</p></EmptyState>
      : <ul className="stack">{q.data.map(p => <li key={p.id} className="surface stack"><h2>{p.name} · version {p.version}</h2>
        <p><CaseStatus tone={p.status === "approved" ? "accepted" : "warning"}>{p.status}</CaseStatus> <OriginBadge origin={p.data_origin}/></p>
        <p className="muted">Source: {p.source}</p>{p.replicates ? <p>Replicates per visit: {p.replicates}</p> : null}{p.instructions ? <p>{p.instructions}</p> : null}</li>)}</ul>}</main>;
}
