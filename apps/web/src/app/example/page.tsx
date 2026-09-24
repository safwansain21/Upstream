"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { PLATE, ScenePicture } from "../../components/scene/scene-picture";
import { EmptyState, Footer, InlineError, LoadingState, MarginLine, PageIntro } from "../../components/ui";
import { api } from "../../lib/api";

type Example = { slug: string; title: string; summary: string };
/** Illustrative traces only (never the example's network): a branching reading, an uncertain place, several observations. */
const TRACES = [
  "M60 190 C130 172 190 150 250 128 S350 80 420 34|M300 110 C330 96 360 92 400 94|M250 128 C270 104 300 92 330 60",
  "M70 150 C120 146 150 140 180 132|M180 132 C200 110 220 98 250 80|M180 132 C210 130 240 136 270 150",
  "M60 120 C120 118 170 124 220 132|M220 132 C250 124 280 118 320 116",
];

export default function ExamplesPage() {
  const q = useQuery({ queryKey: ["examples"], queryFn: () => api<Example[]>("/examples") });
  return <><AppHeader/><main id="main-content" className="page-shell examples-page">
    <PageIntro title="Follow the evidence." aside={<MarginLine>Different observations. A broader view.</MarginLine>}><p>Walk through synthetic investigations computed by the real engine. Start with Mill Brook.</p></PageIntro>
    <div className="examples-head"><div><h2>Synthetic examples</h2><p className="muted">Places and measurements here are invented for demonstration. Read-only: nothing here changes real records.</p></div></div>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading examples…"/>
      : !q.data.length ? <EmptyState title="No example workspace is installed" steps={["An administrator can load the synthetic example workspace with the documented seed command (pnpm seed:example).", "You can still report a real observation at any time."]}
          action={<Link className="button button-outline" href="/report/new">Report an observation</Link>}/>
      : <ol className="example-list">{q.data.map((e, index) => <li key={e.slug} className={index === 0 ? "featured" : undefined}>
        <Link className="example-row" href={`/example/${e.slug}`}>
          <span className="example-art" aria-hidden="true"><ScenePicture asset={PLATE} sizes={index === 0 ? "(max-width: 900px) 100vw, 55vw" : "(max-width: 900px) 100vw, 36vw"} className={`crop-${index % 3}`}/>
            <svg viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice">{TRACES[index % 3].split("|").map((d, i) => <path key={i} d={d} pathLength={1} className={i ? "branch" : "main"}/>)}<circle cx={index === 1 ? 70 : 60} cy={index === 0 ? 190 : index === 1 ? 150 : 120} r="6"/></svg>
            <span className="example-art-note">Illustrative</span></span>
          <span className="example-copy"><span className="row-index">{String(index + 1).padStart(2, "0")}</span><h3>{e.title}</h3><span className="example-summary">{e.summary}</span>
            <span className={`button ${index === 0 ? "button-primary" : "button-outline"} button-small`}>Explore investigation <Arrow/></span></span>
        </Link></li>)}</ol>}
  </main><Footer/></>;
}
