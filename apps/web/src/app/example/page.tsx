"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { EmptyState, Footer, InlineError, LoadingState, OriginBadge, PageIntro } from "../../components/ui";
import { api } from "../../lib/api";

type Example = { slug: string; title: string; summary: string };

export default function ExamplesPage() {
  const q = useQuery({ queryKey: ["examples"], queryFn: () => api<Example[]>("/examples") });
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="Follow the evidence."><p>Walk through synthetic investigations computed by the real engine. Start with Mill Brook.</p></PageIntro>
    <div className="page-banner"><OriginBadge/><p>These read-only walkthroughs use synthetic records. The places, measurements and scenarios are examples, not findings about a real stream.</p></div>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading examples…"/>
      : !q.data.length ? <EmptyState title="No example workspace is installed"><p>An administrator can load the synthetic example workspace with the documented seed command.</p></EmptyState>
      : <div className="example-list">{q.data.map((e, index) => <Link className="example-row" href={`/example/${e.slug}`} key={e.slug}><span className="row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div><h2>{e.title}</h2><p>{e.summary}</p></div><Arrow className="row-arrow"/></Link>)}</div>}
  </main><Footer/></>;
}
