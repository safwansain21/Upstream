import type { ReactNode } from "react";

export type TimelineStep = { title: ReactNode; detail?: ReactNode; state: "done" | "current" | "pending" };

/**
 * A stage spine: the line lights up to the current stage and each dot arrives in turn (once). The state is always
 * written out for assistive technology; the drawing is decorative.
 */
export function Timeline({ steps, label, compact = false }: { steps: TimelineStep[]; label: string; compact?: boolean }) {
  const lit = Math.max(0, steps.reduce((last, s, i) => (s.state === "pending" ? last : i), -1));
  return <ol className={`timeline ${compact ? "compact" : ""}`} aria-label={label} style={{ ["--lit" as string]: steps.length > 1 ? lit / (steps.length - 1) : 1, ["--n" as string]: steps.length }}>
    {steps.map((s, i) => <li key={i} className={`timeline-step is-${s.state}`} style={{ ["--i" as string]: i }}>
      <span className="timeline-dot" aria-hidden="true"/>
      <span className="visually-hidden">{s.state === "done" ? "Done: " : s.state === "current" ? "Current: " : "Not yet: "}</span>
      <strong>{s.title}</strong>{s.detail ? <span className="timeline-detail">{s.detail}</span> : null}</li>)}
  </ol>;
}
