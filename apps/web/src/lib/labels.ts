export const WORKFLOW: Record<string, string> = {
  reported: "New report", triage: "Triage", confirmation: "Confirmation needed", localization_active: "Collecting evidence",
  inspection_recommended: "Inspection recommended", escalated: "Escalated", closed_no_anomaly: "Closed · no anomaly found",
  closed_insufficient: "Closed · insufficient evidence", archived: "Archived",
};

/** Status tone for a workflow state (the label always carries the meaning; tone only groups it). */
export function workflowTone(workflow: string): "neutral" | "warning" | "accepted" | "info" | "active" {
  if (workflow === "reported") return "info";
  if (workflow === "triage" || workflow === "confirmation" || workflow === "escalated") return "warning";
  if (workflow === "localization_active" || workflow === "inspection_recommended") return "active";
  return "neutral";
}

/** What a person can report noticing (the report form's choices; also used to label reports). */
export const REPORT_CATEGORIES: [string, string][] = [["unusual_foam", "Unusual foam"], ["colour_change", "Change in colour"], ["odour", "Odour noticed (without deliberately smelling)"],
  ["dead_wildlife", "Dead wildlife"], ["visible_discharge", "Visible discharge"], ["habitat_access", "Habitat or access concern"], ["other", "Something else"]];
