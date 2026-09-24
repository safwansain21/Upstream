/** Plain names for case events (case_events.event_type). Unknown types fall back to a readable form of the code. */
export const EVENT_LABELS: Record<string, string> = {
  "report.received": "Report received", "report.visibility_changed": "Report visibility changed",
  "readings.submitted": "Field readings submitted", "reading.suspect": "Reading flagged for review", "reading.uncalibrated": "Reading held: instrument not verified",
  "task.proposed": "Task proposed", "task.assigned": "Task assigned", "task.blocked": "Task blocked",
  "network.draft_created": "Local map draft started", "network.edge_edited": "Local map edited", "network.published": "Local map published",
  "analysis.requested": "Analysis requested", "assessment.computed": "Assessment computed", "assessment.under_review": "Assessment sent for review", "assessment.approved": "Assessment approved",
  "decision.recorded": "Decision recorded", "package.created": "Evidence package created", "package.delivered": "Package sent", "package.acknowledged": "Package acknowledged",
  "case.merged_from": "Duplicate merged in", "case.merged_into": "Merged into another investigation",
};
export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type.replaceAll(".", " · ").replaceAll("_", " ");
