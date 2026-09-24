import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { DocumentTitle } from "./document-title";

/** Page heading block: optional eyebrow, serif title, lead copy, an aside (margin line) and one action. */
export function PageIntro({ title, eyebrow, children, action, aside }: { title: string; eyebrow?: ReactNode; children?: ReactNode; action?: ReactNode; aside?: ReactNode }) {
  return <div className="page-intro"><DocumentTitle title={title}/>
    <div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{children ? <div className="intro-copy">{children}</div> : null}</div>
    {aside ? <div className="intro-aside">{aside}</div> : null}{action ? <div className="intro-action">{action}</div> : null}</div>;
}
export function MarginLine({ children }: { children: ReactNode }) { return <p className="margin-line" aria-hidden="true">{children}</p>; }

const ORIGIN: Record<string, string> = { synthetic: "Synthetic example", replayed: "Replayed data", imported: "Imported evidence", real: "Field observation" };
export function OriginBadge({ origin = "synthetic" }: { origin?: string }) { return <span className={`badge origin-${origin}`}>{ORIGIN[origin] ?? ORIGIN.real}</span>; }
export function RoleBadge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
/** A state label: always text plus a dot, never colour alone. */
export function CaseStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "accepted" | "error" | "info" | "active" }) {
  return <span className={`badge status-${tone}`}><span className="dot" aria-hidden="true"/>{children}</span>;
}

/** A quiet river line with its origin dot: the shared mark for empty and state pages. */
export function RiverGlyph({ size = 58 }: { size?: number }) {
  return <svg width={size} height={size * .55} viewBox="0 0 64 36" fill="none" aria-hidden="true"><path d="M4 30c12-2 16-10 26-12S48 14 60 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="4" cy="30" r="3.2" fill="var(--amber)"/><circle cx="60" cy="4" r="2.4" fill="var(--mist)"/></svg>;
}
/** Empty states tell each role what to do next; `steps` are short, concrete actions. */
export function EmptyState({ title, children, action, steps }: { title: string; children?: ReactNode; action?: ReactNode; steps?: ReactNode[] }) {
  return <section className="empty-state enter"><RiverGlyph/><h2>{title}</h2>{children || steps?.length ? <div>{children}{steps?.length ? <ul className="next-steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}</div> : null}{action}</section>;
}
export function InlineError({ children }: { children: ReactNode }) { return <div className="inline-error" role="alert"><strong>Unable to continue.</strong> {children}</div>; }
/** Loading: a line travelling from the origin dot. Static under reduced motion; the text is the status. */
export function LoadingState({ label = "Loading the latest records…" }: { label?: string }) {
  return <div className="loading-state" role="status"><div className="loading-line" aria-hidden="true"><svg viewBox="0 0 440 16" preserveAspectRatio="none"><path className="rail" d="M6 8 C120 2 200 14 300 8 S420 6 436 8"/><path pathLength={1} d="M6 8 C120 2 200 14 300 8 S420 6 436 8"/><circle cx="6" cy="8" r="4"/></svg></div><p>{label}</p></div>;
}
/** Whole-page loading or failure that keeps the page heading, a retry and the shared header: never a blank or dead-end page. */
export function PageState({ title, error, retry, children }: { title: string; error?: Error | null; retry?: () => void; children?: ReactNode }) {
  return <main id="main-content" className="page-shell"><PageIntro title={title}/>{children ?? (error ? <InlineError>{error.message}{retry ? <> <button type="button" className="button button-quiet" onClick={retry}>Retry</button></> : null}</InlineError> : <LoadingState/>)}</main>;
}
export function ReadinessChecklist({ items }: { items: { label: string; ready: boolean; reason?: string }[] }) {
  return <ul className="readiness-list">{items.map(item => <li key={item.label} className={item.ready ? "is-ready" : "is-missing"}><span className="check-mark" aria-hidden="true"/><div><strong>{item.label}</strong><p>{item.reason || (item.ready ? "Ready" : "Review needed")}</p></div></li>)}</ul>;
}
export function Footer() {
  return <footer className="site-footer"><Brand/><nav aria-label="Footer"><Link href="/how-it-works">How it works</Link><Link href="/example">Examples</Link><Link href="/privacy">Privacy</Link><Link href="/accessibility">Accessibility</Link><Link href="/terms">Terms</Link><Link href="/status">Service status</Link></nav><p className="footer-note">Observations start an investigation. They do not establish water safety.</p></footer>;
}
