"use client";
import { useState } from "react";
import { api } from "../lib/api";

type Rec = { tag: string; kind: "report" | "reading" | "assessment" | "next_visit"; id: string; text: string };
type Answer = { source: "ai" | "template"; model: string | null; sentences: { text: string; refs: string[] }[]; records: Rec[]; note: string | null };

/**
 * Case summary (PRD 9.2) inside "Investigation at a glance". Written on request, never on page load. Each sentence carries
 * its record tags; the records it rests on are listed beneath, so a reader can check every claim. The server rejects an AI
 * answer that cites an unknown record, states a number its records do not contain, or claims a cause, source or safety,
 * and then falls back to a fixed template; the panel says which one the reader is looking at.
 */
export function CaseSummary({ org, caseId }: { org: string; caseId: string }) {
  const [answer, setAnswer] = useState<Answer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<string>();
  async function write() {
    setBusy(true); setError("");
    try { setAnswer(await api<Answer>(`/orgs/${org}/cases/${caseId}/ai/summary`, { method: "POST", json: {} })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const cited = answer ? answer.records.filter(r => answer.sentences.some(s => s.refs.includes(r.tag))) : [];
  return <section className="glance-block case-summary" aria-labelledby="summary-h" aria-busy={busy}>
    <div className="summary-head"><h3 id="summary-h">Summary</h3>
      <button type="button" className="button button-quiet button-small" onClick={write} disabled={busy}>{busy ? "Writing…" : answer ? "Write again" : "Write a summary"}</button></div>
    {error ? <p className="muted small" role="alert">{error}</p> : null}
    {!answer && !busy ? <p className="muted small">A few plain sentences from this case&apos;s records, each pointing to the records it uses.</p> : null}
    {answer ? <>
      {answer.sentences.length ? <p className="summary-text" aria-live="polite">{answer.sentences.map((s, i) => <span key={i}>{s.text}{" "}
        {s.refs.map(t => <a key={t} href={`#src-${t}`} className={`summary-ref${focus === t ? " is-focus" : ""}`} onMouseEnter={() => setFocus(t)} onMouseLeave={() => setFocus(undefined)}
          onFocus={() => setFocus(t)} onBlur={() => setFocus(undefined)} aria-label={`Source ${t}`}>{t}</a>)}{" "}</span>)}</p>
        : <p className="muted small">There is nothing to summarise yet.</p>}
      {cited.length ? <ol className="summary-sources" aria-label="Sources">{cited.map(r => <li key={r.tag} id={`src-${r.tag}`} className={focus === r.tag ? "is-focus" : undefined}>
        <span className="summary-ref" aria-hidden="true">{r.tag}</span><span>{r.text}</span></li>)}</ol> : null}
      <p className="summary-provenance">{answer.source === "ai"
        ? <>Written by AI ({answer.model}) from the case records above. Each citation and number was checked against its record. Contributors&apos; own words and photos are not sent. It informs; people decide.</>
        : <>{answer.note}</>}</p>
    </> : null}
  </section>;
}
