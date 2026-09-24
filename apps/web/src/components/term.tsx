"use client";
import { useId, useState, type ReactNode } from "react";
import { GLOSSARY, type TermKey } from "../lib/glossary";

/**
 * The one explanation treatment for technical terms: a dotted rule under the word; activating it opens a short italic
 * gloss inline, in the reading line itself (no tooltip, no icon). Screen readers get the gloss via aria-describedby
 * once open, and the button announces its expanded state.
 */
export function Term({ k, children }: { k: TermKey; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className="term">
    <button type="button" className="term-word" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{children}</button>
    <span id={id} className="term-gloss" hidden={!open}>{GLOSSARY[k]}</span>
  </span>;
}
