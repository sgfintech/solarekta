/** Display helpers for recorded values. Pure. */
import type { FieldDef } from "@/lib/survey/templates";

type Value = string | number | string[] | null | undefined;

export function formatValue(field: FieldDef, value: Value): string | null {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (field.type === "yesno") return value === "yes" ? "Yes" : value === "no" ? "No" : "Don't know";
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value);
  if (field.type === "multiselect" && Array.isArray(value)) return value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(", ");
  if (field.type === "number") return `${Number(value).toLocaleString("en-PH", { maximumFractionDigits: 2 })}${field.unit ? ` ${field.unit}` : ""}`;
  return String(value);
}

export function orientationLabel(value: string, options: { value: string; label: string }[]): string {
  return options.find((o) => o.value === value)?.label ?? (value || "—");
}

export const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  status: "Status",
  visit_started: "Site visit started",
  visit_finished: "Site visit finished",
  evidence_added: "Evidence added",
  evidence_removed: "Evidence removed",
  evidence_deleted: "Evidence deleted",
  evidence_accepted: "Evidence accepted",
  evidence_rejected: "Evidence rejected",
  submitted: "Submitted",
  review_started: "Review started",
  approved: "Review approved",
  changes_requested: "Changes requested",
  reopened: "Reopened",
  shared: "Shared with client",
  unshared: "Client access removed",
  acknowledged: "Client acknowledgment",
  exception_override: "Exception accepted",
  comment: "Comment",
  ai_suggested: "AI suggestions",
  ai_accepted: "AI summary accepted",
};
