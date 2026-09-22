import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";

export function PageIntro({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="page-intro"><div><h1>{title}</h1>{children ? <div className="intro-copy">{children}</div> : null}</div>{action}</div>;
}
export function OriginBadge({ origin = "synthetic" }: { origin?: string }) {
  return <span className={`badge origin-${origin}`}>{origin === "synthetic" ? "Example data" : origin === "imported" ? "Imported evidence" : "Field observation"}</span>;
}
export function RoleBadge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
export function CaseStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "accepted" | "error" }) { return <span className={`badge status-${tone}`}><span aria-hidden="true">{tone === "accepted" ? "✓" : tone === "warning" ? "!" : "•"}</span>{children}</span>; }
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <section className="empty-state"><svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true"><path d="M8 46c13-3 8-16 21-16S41 16 49 8M8 14c2 9 10 15 21 16" stroke="var(--river)" strokeWidth="3" strokeLinecap="round"/><circle cx="29" cy="30" r="6" fill="var(--canvas)" stroke="var(--river)" strokeWidth="2"/></svg><h2>{title}</h2>{children ? <div>{children}</div> : null}{action}</section>;
}
export function InlineError({ children }: { children: ReactNode }) { return <div className="inline-error" role="alert"><strong>Unable to continue.</strong> {children}</div>; }
export function LoadingState({ label = "Loading the latest records…" }: { label?: string }) { return <div className="loading-state" role="status"><span className="loading-indicator" aria-hidden="true"/><p>{label}</p></div>; }
export function ReadinessChecklist({ items }: { items: { label: string; ready: boolean; reason?: string }[] }) {
  return <ul className="readiness-list">{items.map(item => <li key={item.label}><span className={item.ready ? "check-ready" : "check-missing"} aria-hidden="true">{item.ready ? "✓" : "○"}</span><div><strong>{item.label}</strong><p>{item.reason || (item.ready ? "Ready" : "Review needed")}</p></div></li>)}</ul>;
}
export function Footer() {
  return <footer className="site-footer"><div><Brand/><p>For people who care about what flows next.</p></div><nav aria-label="Footer"><Link href="/privacy">Privacy</Link><Link href="/accessibility">Accessibility</Link><Link href="/terms">Terms</Link><Link href="/status">Service status</Link></nav><p className="footer-note">Observations start an investigation. They do not establish water safety.</p></footer>;
}
export function PolicyPage({ title, children }: { title: string; children: ReactNode }) { return <main id="main-content" className="page-shell policy-page"><PageIntro title={title}/><article className="prose">{children}</article></main>; }
