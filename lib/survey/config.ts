/**
 * Configurable survey settings: regulatory labels, evidence requirements, geofence and
 * upload limits. Labels are plain configuration (no thresholds hard-coded from paper
 * forms); limits read environment variables with documented defaults. Pure — safe for client use
 * except `serverLimits()`, which reads process.env at call time.
 */

export const EVIDENCE_CATEGORIES = [
  { id: "site_frontage", label: "Site frontage / arrival" },
  { id: "surveyor_attendance", label: "Surveyor attendance" },
  { id: "roof_overview", label: "Roof overview" },
  { id: "roof_condition", label: "Roof condition" },
  { id: "electrical", label: "Electrical system" },
  { id: "meter_bill", label: "Meter and bill" },
  { id: "shading", label: "Shading / obstructions" },
  { id: "access_safety", label: "Access / safety" },
  { id: "walkthrough_video", label: "Walkthrough video" },
  { id: "client_acknowledgment", label: "Client acknowledgment" },
  { id: "other", label: "Other supporting evidence" },
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number]["id"];
export const EVIDENCE_CATEGORY_LABEL = Object.fromEntries(EVIDENCE_CATEGORIES.map((c) => [c.id, c.label])) as Record<EvidenceCategory, string>;

/** Interests / connection arrangements. Edit labels here; no capacity thresholds are encoded. */
export const SYSTEM_INTERESTS = [
  { value: "net_metering", label: "Net metering" },
  { value: "zero_export", label: "Zero export" },
  { value: "hybrid", label: "Hybrid" },
  { value: "battery", label: "Battery" },
];

export const CONNECTION_ARRANGEMENTS = [
  { value: "net_metering", label: "Net metering (check current eligibility rules with the utility)" },
  { value: "der", label: "Distributed energy resource (DER) arrangement" },
  { value: "geop", label: "Green Energy Option Program (GEOP)" },
  { value: "zero_export", label: "Zero export / self-consumption" },
  { value: "undecided", label: "Not decided" },
];

export const VISIT_TYPES = [
  { value: "initial", label: "Initial ocular visit" },
  { value: "follow_up", label: "Follow-up visit" },
  { value: "pre_installation", label: "Pre-installation check" },
  { value: "remote_pre_check", label: "Remote pre-check (no site visit)" },
];

export const CLIENT_CONSENT_TEXT =
  "I confirm that the surveyor named above visited this property on the date shown and that I was given the chance to ask questions. " +
  "This acknowledgment is not a contract, quotation, structural approval or permission to install.";
export const CLIENT_CONSENT_VERSION = "ack-2026.11.1";

export interface EvidenceRequirement {
  category: EvidenceCategory;
  min: number;
  kind?: "photo" | "video" | "any";
}

/** Parses SURVEY_REQUIRED_EVIDENCE="site_frontage:1,roof_overview:1". */
export function parseEvidenceRequirements(value: string | undefined): EvidenceRequirement[] {
  const fallback: EvidenceRequirement[] = [
    { category: "site_frontage", min: 1, kind: "photo" },
    { category: "roof_overview", min: 1, kind: "photo" },
  ];
  if (value === undefined || value.trim() === "") return fallback;
  if (value.trim() === "none") return [];
  const valid = new Set<string>(EVIDENCE_CATEGORIES.map((c) => c.id));
  const out: EvidenceRequirement[] = [];
  for (const part of value.split(",")) {
    const [category, min] = part.split(":").map((s) => s.trim());
    const n = Number(min ?? 1);
    if (valid.has(category) && Number.isInteger(n) && n > 0) out.push({ category: category as EvidenceCategory, min: n, kind: "any" });
  }
  return out.length ? out : fallback;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Server-enforced limits (bytes, counts, seconds, metres). */
export function serverLimits() {
  return {
    photoBytes: num(process.env.SURVEY_MAX_PHOTO_MB, 25) * 1024 * 1024,
    documentBytes: num(process.env.SURVEY_MAX_DOCUMENT_MB, 25) * 1024 * 1024,
    videoBytes: num(process.env.SURVEY_MAX_VIDEO_MB, 500) * 1024 * 1024,
    videoSeconds: num(process.env.SURVEY_MAX_VIDEO_SECONDS, 600),
    maxEvidencePerSurvey: num(process.env.SURVEY_MAX_EVIDENCE, 200),
    geofenceMeters: num(process.env.SURVEY_GEOFENCE_METERS, 300),
    maxAccuracyMeters: num(process.env.SURVEY_MAX_GPS_ACCURACY_METERS, 100),
    requiredEvidence: parseEvidenceRequirements(process.env.SURVEY_REQUIRED_EVIDENCE),
    requireCheckIn: process.env.SURVEY_REQUIRE_CHECK_IN !== "off",
  };
}
export type SurveyLimits = ReturnType<typeof serverLimits>;
