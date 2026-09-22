"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CaseStatus, InlineError, LoadingState, OriginBadge } from "./ui";

export type Receipt = { id: string; effect: string; co_dependencies: number; retained_before_m: string | null; retained_after_m: string | null; created_at: string;
  revision: number; eligible: boolean; status: string; case_title: string; case_id: string; reading_id: string | null; data_origin: string };
const km = (m: string | null) => m === null ? null : `${(Number(m) / 1000).toFixed(2)} km`;

/** Plain statement of what one contribution did in one approved assessment. Never credits a whole result to one person. */
export function effectText(r: Receipt) {
  const change = r.retained_before_m === null ? (r.eligible && r.retained_after_m ? `The assessment retains ${km(r.retained_after_m)} under current assumptions.` : "No localization result was established.")
    : Number(r.retained_before_m) === Number(r.retained_after_m) ? "No change to the retained area under current assumptions."
    : `The retained area changed from ${km(r.retained_before_m)} to ${km(r.retained_after_m)}.`;
  switch (r.effect) {
    case "recorded_for_triage": return `Your report is part of this investigation's record; it was not a measurement input. ${change}`;
    case "used_in_assessment": return `Your reading was used together with ${r.co_dependencies} other reading(s). ${change}`;
    case "excluded_after_review": return "Your reading is kept in the history but was excluded from this assessment after review.";
    default: return "Your reading is kept as history and was not used in this assessment.";
  }
}

export function ReceiptHistory({ path }: { path: string }) {
  const q = useQuery({ queryKey: ["receipts", path], queryFn: () => api<Receipt[]>(path) });
  if (q.error) return <InlineError>{q.error.message}</InlineError>;
  if (!q.data) return <LoadingState/>;
  if (!q.data.length) return <p><strong>What this changed:</strong> recorded for triage. No approved assessment has used this contribution yet.</p>;
  const [latest, ...older] = q.data;
  return <div className="stack">
    <p><CaseStatus tone={latest.status === "approved" ? "accepted" : "warning"}>Based on assessment {latest.revision}</CaseStatus> <OriginBadge origin={latest.data_origin}/>{latest.status !== "approved" ? <strong> This assessment was revised{latest.status === "under_review" ? " and is under review" : ""}.</strong> : null}</p>
    <p><strong>What this changed:</strong> {effectText(latest)}</p>
    {older.length ? <details><summary>Earlier receipts ({older.length})</summary><ul>{older.map(r => <li key={r.id}>Assessment {r.revision} · {r.status === "superseded" ? "This assessment was revised" : r.status} · {effectText(r)}</li>)}</ul></details> : null}
  </div>;
}
