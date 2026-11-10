/**
 * Survey data shape, validation, progress, submission checks, contradiction checks,
 * status workflow and location maths. Pure — shared by server, client and tests.
 */
import { z } from "zod";
import type { EvidenceRequirement } from "@/lib/survey/config";
import { allItems, type ItemStatus, type SurveyType, type TemplateDef } from "@/lib/survey/templates";

/* ----------------------------------------------------------------------------
 * Data
 * ------------------------------------------------------------------------- */

const shortText = z.string().max(300);
const longText = z.string().max(4000);
const fieldValue = z.union([z.string().max(2000), z.number().finite(), z.array(z.string().max(120)).max(20), z.null()]);

export const itemAnswerSchema = z.object({
  status: z.enum(["not_assessed", "completed", "issue", "na"]).default("not_assessed"),
  note: longText.default(""),
  values: z.record(z.string().max(60), fieldValue).default({}),
});

export const roofPlaneSchema = z.object({
  id: z.string().min(1).max(40),
  label: shortText.default(""),
  usableAreaM2: z.number().finite().min(0).max(1_000_000).nullable().default(null),
  pitchDeg: z.number().finite().min(0).max(90).nullable().default(null),
  orientation: z.string().max(40).default(""),
  notes: longText.default(""),
  shadeMorning: shortText.default(""),
  shadeNoon: shortText.default(""),
  shadeAfternoon: shortText.default(""),
});

export const surveyDataSchema = z.object({
  details: z
    .object({
      clientName: shortText.default(""),
      clientPhone: z.string().max(40).default(""),
      address: z.string().max(400).default(""),
      city: shortText.default(""),
      province: shortText.default(""),
      utility: shortText.default(""),
      surveyorName: shortText.default(""),
      scheduledDate: z.string().max(10).default(""),
      actualVisitAt: z.string().max(25).default(""),
      visitType: z.string().max(40).default("initial"),
      purpose: z.string().max(600).default(""),
      interests: z.array(z.string().max(40)).max(10).default([]),
      siteLat: z.number().finite().min(-90).max(90).nullable().default(null),
      siteLng: z.number().finite().min(-180).max(180).nullable().default(null),
      siteLocationSource: z.enum(["", "device", "manual"]).default(""),
    })
    .prefault({}),
  items: z.record(z.string().max(60), itemAnswerSchema).default({}),
  roofPlanes: z.array(roofPlaneSchema).max(30).default([]),
  findings: z
    .object({
      notes: z.string().max(8000).default(""),
      recommendedKwp: z.number().finite().min(0).max(100000).nullable().default(null),
      nextSteps: z.string().max(2000).default(""),
    })
    .prefault({}),
});

export type SurveyData = z.infer<typeof surveyDataSchema>;
export type ItemAnswer = z.infer<typeof itemAnswerSchema>;
export type RoofPlane = z.infer<typeof roofPlaneSchema>;

export function emptySurveyData(): SurveyData {
  return surveyDataSchema.parse({});
}

/** Lenient parse for stored JSON: invalid parts fall back to defaults rather than throwing. */
export function parseSurveyData(raw: unknown): SurveyData {
  const parsed = surveyDataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return emptySurveyData();
}

export function answerFor(data: SurveyData, itemId: string): ItemAnswer {
  return data.items[itemId] ?? { status: "not_assessed", note: "", values: {} };
}

/* ----------------------------------------------------------------------------
 * Progress and submission checks
 * ------------------------------------------------------------------------- */

export interface SectionProgress {
  sectionId: string;
  answered: number;
  total: number;
}

/** Progress counts every checklist item in the survey's template version (N/A counts as answered). */
export function progress(template: TemplateDef, data: SurveyData): { answered: number; total: number; percent: number; sections: SectionProgress[] } {
  const sections = template.sections.map((s) => ({
    sectionId: s.id,
    total: s.items.length,
    answered: s.items.filter((i) => answerFor(data, i.id).status !== "not_assessed").length,
  }));
  const total = sections.reduce((n, s) => n + s.total, 0);
  const answered = sections.reduce((n, s) => n + s.answered, 0);
  return { answered, total, percent: total ? Math.round((answered / total) * 100) : 0, sections };
}

export interface EvidenceSummary {
  id: string;
  category: string;
  kind: "photo" | "video" | "document" | "signature";
  itemId: string | null;
  planeId: string | null;
  reviewStatus: "pending" | "accepted" | "rejected";
}

export interface CheckIssue {
  severity: "blocker" | "warning";
  /** Where to fix it: "details", a section id, "evidence", "visit" or "findings". */
  where: string;
  itemId?: string;
  message: string;
}

export interface VisitState {
  checkedInAt: string | null;
  checkedOutAt: string | null;
  locationStatus: LocationStatus;
  /** A reviewer-approved exception for missing check-in or location. */
  exceptionApproved: boolean;
  exceptionReason: string | null;
}

/** Everything that blocks submission, plus warnings that become review flags. */
export function submissionChecks(input: {
  template: TemplateDef;
  data: SurveyData;
  evidence: EvidenceSummary[];
  requirements: EvidenceRequirement[];
  visit: VisitState;
  requireCheckIn: boolean;
}): CheckIssue[] {
  const { template, data, evidence, requirements, visit } = input;
  const issues: CheckIssue[] = [];
  const d = data.details;
  const blocker = (where: string, message: string, itemId?: string) => issues.push({ severity: "blocker", where, message, itemId });
  const warning = (where: string, message: string, itemId?: string) => issues.push({ severity: "warning", where, message, itemId });

  if (!d.clientName.trim()) blocker("details", "Add the client name.");
  if (!d.address.trim()) blocker("details", "Add the complete site address.");
  if (!d.utility.trim()) blocker("details", "Add the distribution utility (e.g. Meralco, VECO).");
  if (!d.surveyorName.trim()) blocker("details", "Add the surveyor's name.");
  if (d.siteLat == null || d.siteLng == null) blocker("details", "Save the site's GPS pin, or enter coordinates manually.");
  if (!d.clientPhone.trim()) warning("details", "No client contact number recorded.");

  const remote = d.visitType === "remote_pre_check";
  if (!remote) {
    if (!visit.checkedInAt && !d.actualVisitAt) blocker("visit", "Start the site visit, or record the actual visit date and time.");
    if (input.requireCheckIn && !visit.checkedInAt && !visit.exceptionApproved) {
      warning("visit", "No “Start site visit” record. The survey will be flagged for review.");
    }
    if (visit.checkedInAt && !visit.checkedOutAt) warning("visit", "The site visit was started but not finished.");
    if (visit.locationStatus === "inconsistent" && !visit.exceptionApproved) warning("visit", "Check-in location is far from the site pin. A reviewer will see this flag.");
    if ((visit.locationStatus === "denied" || visit.locationStatus === "low_accuracy" || visit.locationStatus === "unavailable") && !visit.exceptionApproved) {
      warning("visit", "Location could not be confirmed at check-in. A reviewer will see this flag.");
    }
  }

  for (const section of template.sections) {
    for (const item of section.items) {
      const answer = answerFor(data, item.id);
      if (item.required && answer.status === "not_assessed") blocker(section.id, `“${item.label}” has not been assessed.`, item.id);
      if (answer.status === "issue" && !answer.note.trim()) blocker(section.id, `Explain the issue found for “${item.label}”.`, item.id);
      if (answer.status === "na" && item.naNeedsReason !== false && !answer.note.trim()) blocker(section.id, `Say why “${item.label}” is not applicable.`, item.id);
      if (answer.status === "completed") {
        for (const field of item.fields ?? []) {
          const v = answer.values[field.key];
          if (field.recommended && (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0))) {
            warning(section.id, `“${item.label}” is marked completed but ${field.label.toLowerCase()} is empty.`, item.id);
          }
        }
      }
      if (item.photo && answer.status === "completed" && !evidence.some((e) => e.itemId === item.id && e.reviewStatus !== "rejected")) {
        warning(section.id, `“${item.label}” is ticked but no photo is attached to it.`, item.id);
      }
    }
    if (section.roofPlanes) {
      const planes = data.roofPlanes;
      if (planes.length === 0) blocker(section.id, "Add at least one roof plane with its usable area.");
      planes.forEach((p, i) => {
        const name = p.label || `Plane ${i + 1}`;
        if (p.usableAreaM2 == null) blocker(section.id, `${name}: add the usable area.`);
        if (p.pitchDeg == null) warning(section.id, `${name}: pitch not recorded.`);
        if (!p.orientation) warning(section.id, `${name}: orientation not recorded.`);
      });
    }
  }

  const usable = evidence.filter((e) => e.reviewStatus !== "rejected");
  for (const req of requirements) {
    const count = usable.filter((e) => e.category === req.category && (req.kind === undefined || req.kind === "any" || e.kind === req.kind)).length;
    if (count < req.min) blocker("evidence", `Add at least ${req.min} ${req.kind === "photo" ? "photo" : "item"}${req.min > 1 ? "s" : ""} in “${categoryLabel(req.category)}”.`);
  }

  if (!data.findings.notes.trim()) warning("findings", "Add notes and findings for the reviewer.");
  if (!data.findings.nextSteps.trim()) warning("findings", "Add the next steps.");
  return issues;
}

const CATEGORY_LABELS: Record<string, string> = {
  site_frontage: "Site frontage / arrival",
  roof_overview: "Roof overview",
  roof_condition: "Roof condition",
  electrical: "Electrical system",
  meter_bill: "Meter and bill",
  shading: "Shading / obstructions",
  access_safety: "Access / safety",
  walkthrough_video: "Walkthrough video",
  surveyor_attendance: "Surveyor attendance",
  client_acknowledgment: "Client acknowledgment",
  other: "Other supporting evidence",
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

/**
 * Deterministic missing-data and contradiction checks shown to surveyors and reviewers.
 * They point at answers that disagree; they never fill in or change values.
 */
export function contradictionChecks(type: SurveyType, data: SurveyData): string[] {
  const out: string[] = [];
  const v = (item: string, key: string) => answerFor(data, item).values[key];
  const status = (item: string) => answerFor(data, item).status;
  const interests = new Set(data.details.interests);

  if (interests.has("net_metering") && status("elec_bills") === "na") out.push("Net metering is an interest, but electricity bills are marked not applicable.");
  if ((interests.has("battery") || interests.has("hybrid")) && status("elec_daytime_loads") === "not_assessed") out.push("Battery or hybrid interest recorded, but daytime loads were not assessed.");
  const material = String(v("roof_material", "material") ?? "");
  const fixing = String(v("roof_fixing", "method") ?? "");
  if (type === "residential" && material === "gi_sheet" && fixing === "ballast") out.push("Ballast mounting is proposed on a GI sheet roof. Confirm with the engineer.");
  if (type === "commercial" && material === "metal_deck" && fixing === "ballast") out.push("Ballast mounting is proposed on a metal deck. Confirm with the engineer.");
  const observed = (v("roof_condition", "observed") ?? v("roof_membrane", "observed")) as string[] | undefined;
  if (Array.isArray(observed) && observed.includes("none_observed") && observed.length > 1) out.push("Roof condition lists “None observed” together with defects.");
  const conditionItem = type === "residential" ? "roof_condition" : "roof_membrane";
  if (Array.isArray(observed) && observed.some((o) => o !== "none_observed") && status(conditionItem) === "completed") {
    out.push("Roof defects are listed but the roof condition item is not marked “Issue found”.");
  }
  const totalArea = data.roofPlanes.reduce((n, p) => n + (p.usableAreaM2 ?? 0), 0);
  const kwp = data.findings.recommendedKwp;
  if (kwp && totalArea > 0 && kwp * 4 > totalArea * 1.5) out.push(`The preliminary ${kwp} kWp needs much more area than the ${totalArea} m² of usable roof recorded. Check the planes or the capacity.`);
  if (kwp && totalArea === 0) out.push("A preliminary capacity is recorded but no usable roof area has been measured.");
  if (type === "commercial") {
    if (v("elec_transformer", "available") != null && v("elec_transformer", "verified") !== "yes") out.push("Available transformer capacity is recorded but not marked as verified.");
    const structural = String(v("st_review_required", "required") ?? "");
    const corrosion = (v("st_corrosion", "observed") as string[] | undefined) ?? [];
    if (structural === "no" && corrosion.some((c) => c !== "none_observed")) out.push("Corrosion, sagging or deflection was observed, but structural review is marked not required.");
    if (v("st_loading", "assumption") && !v("st_loading", "source")) out.push("A loading assumption is recorded without its source.");
  }
  const phase = String(v("elec_service", "phase") ?? "");
  if (phase === "three_phase" && type === "residential" && !v("elec_main_breaker", "rating")) out.push("Three-phase service recorded, but no main breaker rating.");
  return out;
}

/* ----------------------------------------------------------------------------
 * Workflow
 * ------------------------------------------------------------------------- */

export type SurveyStatus = "draft" | "in_progress" | "submitted" | "under_review" | "approved" | "changes_requested";

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Review approved",
  changes_requested: "Changes requested",
};

export const STATUS_TONE: Record<SurveyStatus, string> = {
  draft: "badge-neutral",
  in_progress: "badge-warn",
  submitted: "badge-info",
  under_review: "badge-info",
  approved: "badge-good",
  changes_requested: "badge-bad",
};

/** States in which the surveyor may edit answers and evidence. */
export const EDITABLE: SurveyStatus[] = ["draft", "in_progress", "changes_requested"];

type Actor = "surveyor" | "reviewer";
const TRANSITIONS: Record<SurveyStatus, Partial<Record<SurveyStatus, Actor[]>>> = {
  draft: { in_progress: ["surveyor"], submitted: ["surveyor"] },
  in_progress: { submitted: ["surveyor"] },
  submitted: { under_review: ["reviewer"], in_progress: ["surveyor"] },
  under_review: { approved: ["reviewer"], changes_requested: ["reviewer"], in_progress: ["surveyor"] },
  approved: { in_progress: ["surveyor"] },
  changes_requested: { in_progress: ["surveyor"], submitted: ["surveyor"] },
};

export function canTransition(from: SurveyStatus, to: SurveyStatus, actor: Actor): boolean {
  return Boolean(TRANSITIONS[from]?.[to]?.includes(actor));
}

/** Reopening a submitted, under-review or approved survey creates a new revision and requires resubmission. */
export function reopenCreatesRevision(from: SurveyStatus): boolean {
  return from === "submitted" || from === "under_review" || from === "approved";
}

/* ----------------------------------------------------------------------------
 * Location
 * ------------------------------------------------------------------------- */

export type LocationStatus = "consistent" | "inconsistent" | "low_accuracy" | "denied" | "unavailable" | "no_site_pin" | "not_recorded";

export const LOCATION_LABEL: Record<LocationStatus, string> = {
  consistent: "Within the configured distance of the site pin",
  inconsistent: "Farther from the site pin than the configured distance",
  low_accuracy: "Device location too imprecise to compare",
  denied: "Location permission declined",
  unavailable: "Device location unavailable",
  no_site_pin: "No site pin to compare against",
  not_recorded: "Not recorded",
};

/** Great-circle distance in metres. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Compares a device-reported check-in location with the site pin. A "consistent" result
 * supports the visit record; it does not prove attendance.
 */
export function assessLocation(input: {
  device: { lat: number; lng: number; accuracy: number | null } | null;
  outcome: "ok" | "denied" | "unavailable" | "skipped";
  site: { lat: number | null; lng: number | null };
  geofenceMeters: number;
  maxAccuracyMeters: number;
}): { status: LocationStatus; distance: number | null } {
  if (input.outcome === "denied") return { status: "denied", distance: null };
  if (input.outcome !== "ok" || !input.device) return { status: "unavailable", distance: null };
  if (input.site.lat == null || input.site.lng == null) return { status: "no_site_pin", distance: null };
  const distance = distanceMeters(input.device, { lat: input.site.lat, lng: input.site.lng });
  if (input.device.accuracy != null && input.device.accuracy > input.maxAccuracyMeters) return { status: "low_accuracy", distance };
  return { status: distance <= input.geofenceMeters ? "consistent" : "inconsistent", distance };
}

/** Survey reference like SRV-2026-04821 from a sequence number. */
export function surveyReference(year: number, sequence: number): string {
  return `SRV-${year}-${String(sequence).padStart(5, "0")}`;
}

/** Fields that changed between two snapshots, for revision history. */
export function changedFields(before: SurveyData, after: SurveyData): string[] {
  const out: string[] = [];
  for (const key of Object.keys(after.details) as (keyof SurveyData["details"])[]) {
    if (JSON.stringify(before.details[key]) !== JSON.stringify(after.details[key])) out.push(`details.${key}`);
  }
  const ids = new Set([...Object.keys(before.items), ...Object.keys(after.items)]);
  for (const id of ids) if (JSON.stringify(before.items[id] ?? null) !== JSON.stringify(after.items[id] ?? null)) out.push(`items.${id}`);
  if (JSON.stringify(before.roofPlanes) !== JSON.stringify(after.roofPlanes)) out.push("roofPlanes");
  if (JSON.stringify(before.findings) !== JSON.stringify(after.findings)) out.push("findings");
  return out;
}

export function itemLabels(template: TemplateDef): Record<string, string> {
  return Object.fromEntries(allItems(template).map((i) => [i.id, i.label]));
}

export type { ItemStatus };
