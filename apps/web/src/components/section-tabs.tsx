"use client";
import { useEffect, useState } from "react";

/** The id of the first listed section in the reading band (upper part of the screen), for "on this page" navigation. */
export function useCurrentSection(ids: string[]) {
  const [current, setCurrent] = useState(ids[0]);
  const key = ids.join(" ");
  useEffect(() => {
    const list = key.split(" "), seen = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target.id, e.isIntersecting));
      const first = list.find(id => seen.get(id));
      if (first) setCurrent(first);
    }, { rootMargin: "-20% 0px -55% 0px" });
    list.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [key]);
  return current;
}

/** A row of in-page links under a page's hero; the section being read is underlined in amber (dark-accessibility). */
export function SectionTabs({ sections }: { sections: [string, string][] }) {
  const current = useCurrentSection(sections.map(([id]) => id));
  return <nav className="section-tabs" aria-label="On this page"><span className="section-tabs-label" aria-hidden="true">On this page</span>
    <ol>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`} aria-current={current === id ? "true" : undefined}>{title}</a></li>)}</ol></nav>;
}
