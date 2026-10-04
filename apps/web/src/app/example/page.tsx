"use client";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { ALLOTMENT_DITCH, PLATE, REVISED_BROOK, ScenePicture, TIDAL_CHANNEL, type SceneAsset } from "../../components/scene/scene-picture";
import { EmptyState, Footer, InlineError, LoadingState, MarginLine, PageIntro } from "../../components/ui";
import { api } from "../../lib/api";

type Example = { slug: string; title: string; summary: string };
/** Each card is its own place, with no network drawn on it (a case's map changes as people add locations; the card
 *  should not pretend to know it). `focus` is the crop of the photo; `drift` the direction its slow camera drift takes. */
type Art = { asset: SceneAsset; focus: [string, string]; drift: [string, string] };
const ARTS: Record<string, Art> = {
  "useful-evidence": { asset: PLATE, focus: ["58%", "64%"], drift: ["-1.6%", "-.8%"] },
  "revised-evidence": { asset: REVISED_BROOK, focus: ["62%", "62%"], drift: ["1.4%", "-1%"] },
  "unmapped": { asset: ALLOTMENT_DITCH, focus: ["55%", "70%"], drift: ["-1.2%", ".9%"] },
  "tidal": { asset: TIDAL_CHANNEL, focus: ["50%", "62%"], drift: ["1.6%", ".6%"] },
};

/** Cards reveal the first time they come on screen; their drift runs only while they are visible. */
function useLive() {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const observer = new IntersectionObserver(entries => entries.forEach(e => { const el = e.target as HTMLElement; el.dataset.live = String(e.isIntersecting); if (e.isIntersecting) el.dataset.seen = ""; }), { threshold: .2 });
    list.querySelectorAll(".example-art").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });
  return ref;
}

export default function ExamplesPage() {
  const q = useQuery({ queryKey: ["examples"], queryFn: () => api<Example[]>("/examples") });
  const roles = useQuery({ queryKey: ["example-roles"], queryFn: () => api<{ role: string; label: string }[]>("/example/roles"), retry: false });
  const list = useLive();
  return <><AppHeader/><main id="main-content" className="page-shell examples-page">
    <PageIntro title="Follow the evidence." aside={<MarginLine>Different observations. A broader view.</MarginLine>}><p>Walk through synthetic investigations computed by the real engine. Start with Mill Brook.</p></PageIntro>
    <div className="examples-head"><div><h2>Synthetic examples</h2><p className="muted">Places and measurements here are invented for demonstration. Read-only: nothing here changes real records.</p>
      {roles.data?.length ? <p className="muted">To try the workflow itself, <Link className="text-link" href="/sign-in">sign in as one of the example’s people <Arrow/></Link></p> : null}</div></div>
    {q.error ? <InlineError>{q.error.message} <button className="button button-quiet" onClick={() => q.refetch()}>Retry</button></InlineError> : !q.data ? <LoadingState label="Loading examples…"/>
      : !q.data.length ? <EmptyState title="No example workspace is installed" steps={["An administrator can load the synthetic example workspace with the documented seed command (pnpm seed:example).", "You can still report a real observation at any time."]}
          action={<Link className="button button-outline" href="/report/new">Report an observation</Link>}/>
      : <ol ref={list} className="example-list">{q.data.map((e, index) => <li key={e.slug} className={index === 0 ? "featured" : undefined}>
        <Link className="example-row" href={`/example/${e.slug}`}>
          {(({ asset, focus, drift }) =>
            <span className="example-art" data-scene={asset.name} aria-hidden="true"
              style={{ "--fx": focus[0], "--fy": focus[1], "--dx": drift[0], "--dy": drift[1], "--order": index } as CSSProperties}>
              <span className="example-art-box"><ScenePicture asset={asset} sizes={index === 0 ? "(max-width: 900px) 100vw, 55vw" : "(max-width: 900px) 100vw, 36vw"}/></span>
              <span className="example-sheen"/><span className="example-art-note">Illustrative</span></span>)(ARTS[e.slug] ?? ARTS["useful-evidence"])}
          <span className="example-copy"><span className="row-index">{String(index + 1).padStart(2, "0")}</span><h3>{e.title}</h3><span className="example-summary">{e.summary}</span>
            <span className={`button ${index === 0 ? "button-primary" : "button-outline"} button-small`}>Explore investigation <Arrow/></span></span>
        </Link></li>)}</ol>}
  </main><Footer/></>;
}
