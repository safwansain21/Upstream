"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Term } from "../../../../../components/term";
import { CaseStatus, EmptyState, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../../../components/ui";
import { api } from "../../../../../lib/api";
import { useOrg } from "../../../../../lib/session";

type Protocol = { id: string; version: number; name: string; status: string; data_origin: string; source: string; instructions: string | null; replicates: number | null };

export default function Protocols() {
  const { org } = useOrg();
  const q = useQuery({ queryKey: ["protocols", org], queryFn: () => api<Protocol[]>(`/orgs/${org}/protocols`) });
  const [search, setSearch] = useState(""); const [chosen, setChosen] = useState("");
  const list = (q.data ?? []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const p = list.find(x => x.id === chosen) ?? list[0];
  const steps = p?.instructions ? p.instructions.split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/).map(s => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean) : [];
  return <main id="main-content" className="page-shell settings-page"><PageIntro title="Protocols" action={q.data?.length ? <div className="form-field"><label htmlFor="protocol-search" className="visually-hidden">Search protocols</label>
      <input id="protocol-search" type="search" placeholder="Search protocols" value={search} onChange={e => setSearch(e.target.value)}/></div> : null}>
      <p>Versioned measurement instructions with their provenance. Example bounds are never used as defaults for real deployments.</p></PageIntro>
    {q.error ? <InlineError>{q.error.message} <button type="button" className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading protocols…"/> : !q.data.length
      ? <EmptyState title="No protocols recorded" steps={["An expert records a reviewed protocol before protocol readings can be assigned.", "Each change creates a new version; readings keep the version they were taken under."]}/>
      : <div className="protocol-layout">
        <section aria-label="Protocol list"><p className="muted">{list.length} {list.length === 1 ? "protocol" : "protocols"}</p>
          <ul className="protocol-list">{list.map(x => <li key={x.id}><button type="button" className={x.id === p?.id ? "is-selected" : undefined} aria-pressed={x.id === p?.id} onClick={() => setChosen(x.id)}>
            <strong>{x.name}</strong><span>v{x.version} · <span className={`quality quality-${x.status === "approved" ? "accepted" : "suspect"}`}><span className="dot" aria-hidden="true"/>{x.status}</span></span>
            <span>{x.replicates ? `${x.replicates} replicates · ` : ""}Source: {x.source}</span></button></li>)}</ul>
          {!list.length ? <p className="muted">No protocols match.</p> : null}</section>
        {p ? <article className="surface protocol-detail" aria-labelledby="protocol-heading"><h2 id="protocol-heading">{p.name}</h2>
          <p className="protocol-meta"><span>Version {p.version}</span><CaseStatus tone={p.status === "approved" ? "accepted" : "warning"}>{p.status}</CaseStatus><OriginBadge origin={p.data_origin}/></p>
          <div className="protocol-columns"><div><h3>Instructions</h3>{steps.length > 1 ? <ol className="protocol-steps">{steps.map((s, n) => <li key={n}>{s}</li>)}</ol> : <p>{p.instructions || "No written instructions recorded for this version."}</p>}</div>
            <dl className="map-facts"><div><dt><Term k="replicate">Replicates</Term></dt><dd>{p.replicates ? `${p.replicates} per visit` : "Not specified"}</dd></div><div><dt>Source</dt><dd>{p.source}</dd></div>
              <div><dt>Data origin</dt><dd>{p.data_origin === "real" ? "Field protocol" : "Example protocol: its bounds are illustrative only"}</dd></div></dl></div></article> : null}
      </div>}</main>;
}
