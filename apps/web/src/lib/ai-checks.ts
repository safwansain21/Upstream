/** Plain-language wording for the AI cross-check of report text against the photos sent (Track 3).
 * The checks come from the API; they are prompts for a person, never a judgment, and never block a report. */
export type AiCheck = { kind: "not_in_photos" | "not_in_text" | "photo_quality"; code?: string; photo?: number };
export type ReportAi = { checks: AiCheck[]; photos: number; model: string | null; accepted: string[] | null } | null;

const FEATURE: Record<string, string> = { foam_visible: "foam", colour_change_visible: "a colour change", debris_visible: "debris",
  visible_discharge_feature: "a pipe or outflow", wildlife_visible: "wildlife", image_quality_issue: "photo quality", location_detail_needed: "location detail" };
export const feature = (code: string) => FEATURE[code] ?? code.replaceAll("_", " ");

/** Second person, for the contributor while writing. */
export function prompt(c: AiCheck) {
  if (c.kind === "not_in_photos") return `Your text mentions ${feature(c.code!)}, but the photos you sent don’t clearly show it. A closer photo would help the reviewer, or keep your words as they are.`;
  if (c.kind === "not_in_text") return `Photo ${c.photo} seems to show ${feature(c.code!)}, which your text doesn’t mention. Add it only if you saw it.`;
  return `Photo ${c.photo} may be too dark, blurred or distant to show the water. Replace it if you can.`;
}

/** Neutral, for anyone reading the submitted report, including the reviewer. */
export function note(c: AiCheck) {
  if (c.kind === "not_in_photos") return `The text mentions ${feature(c.code!)}; the photos sent do not clearly show it.`;
  if (c.kind === "not_in_text") return `Photo ${c.photo} appears to show ${feature(c.code!)}, not mentioned in the text.`;
  return `Photo ${c.photo} may be too unclear to show the water.`;
}

/** One short line for a report row. */
export function summary(ai: NonNullable<ReportAi>) {
  const parts = [ai.photos ? ai.checks.length ? `AI cross-check: ${ai.checks.length} ${ai.checks.length === 1 ? "difference" : "differences"} to look at` : "AI cross-check: text and photos agree" : ""];
  if (ai.accepted?.length) parts.push(`wording partly AI-suggested (${ai.accepted.map(feature).join(", ")})`);
  return parts.filter(Boolean).join(" · ");
}
