"use client";
import { useEffect, useState, type ReactNode } from "react";
import { DocumentTitle } from "./document-title";

export type PolicySection = { id: string; title: string; body: ReactNode; lead?: string };

/**
 * Editorial policy layout: a section list on a luminous spine (the current section lights amber as you read),
 * an eyebrow, a serif title and readable sections. `numbered` sets titles beside their text (terms).
 */
export function PolicyDoc({ eyebrow, title, intro, sections, aside, numbered = false, children }:
  { eyebrow: string; title: string; intro: ReactNode; sections: PolicySection[]; aside?: ReactNode; numbered?: boolean; children?: ReactNode }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target.id, e.isIntersecting));
      const first = sections.find(s => seen.get(s.id));
      if (first) setCurrent(first.id);
    }, { rootMargin: "-20% 0px -55% 0px" });
    sections.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);
  return <main id="main-content" className={`policy ${numbered ? "numbered" : ""}`}><DocumentTitle title={title}/>
    <nav className="policy-toc" aria-label={`${eyebrow} sections`}><p className="eyebrow">{eyebrow}</p>
      <ol>{sections.map(s => <li key={s.id}><a href={`#${s.id}`} aria-current={current === s.id ? "true" : undefined}>{s.title}</a></li>)}</ol></nav>
    <div className="policy-body">
      <header className="policy-head enter"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><div className="policy-intro">{intro}</div></header>
      {children}
      {sections.map((s, i) => <section key={s.id} id={s.id} className="policy-section" aria-labelledby={`${s.id}-h`}>
        <h2 id={`${s.id}-h`}>{numbered ? <span className="policy-num">{String(i + 1).padStart(2, "0")}</span> : null}{s.title}</h2><div className="policy-text">{s.body}</div></section>)}
    </div>
    {aside ? <aside className="policy-aside">{aside}</aside> : null}
  </main>;
}
