/**
 * Notebook ink: live text that appears word by word, left to right, with a small uneven rhythm (MOTION_SPEC
 * "Notebook / writing reveal"). The whole text is always in the DOM for assistive technology; only the visual reveal
 * is staggered. The rhythm is deterministic per note, so it never jitters between renders. Keyed by content by the
 * caller, so a new note writes once; reduced motion shows it complete.
 */
function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }

export function InkNote({ lines, className = "" }: { lines: string[]; className?: string }) {
  let seed = hash(lines.join("|")), t = .25;
  const next = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0; return (seed % 1000) / 1000; };
  return <p className={`ink-note ${className}`} data-ink-note>
    {lines.map((line, li) => <span key={li} className="ink-line">{line.split(/(\s+)/).map((w, wi) => {
      if (/^\s+$/.test(w)) return w;
      const delay = t; t += .09 + w.length * .035 + next() * .12;
      return <span key={wi} className="ink-word" style={{ animationDelay: `${delay.toFixed(2)}s`, animationDuration: `${(.18 + w.length * .04).toFixed(2)}s` }}>{w}</span>;
    })}</span>)}
  </p>;
}
