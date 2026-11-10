import "server-only";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { changedFields, parseSurveyData, surveyReference, type EvidenceSummary, type SurveyData, type SurveyStatus, type VisitState, type LocationStatus } from "@/lib/survey/model";
import { currentTemplate, getTemplate, type SurveyType } from "@/lib/survey/templates";
import { serverLimits } from "@/lib/survey/config";
import type { SessionUser } from "@/lib/types";

export interface SurveyRow {
  id: string;
  reference: string;
  type: SurveyType;
  template_version: string;
  installer_id: string;
  created_by: string;
  customer_user_id: string | null;
  site_id: string | null;
  quote_request_id: string | null;
  status: SurveyStatus;
  revision: number;
  version: number;
  data_json: string;
  client_name: string;
  site_label: string;
  surveyor_name: string;
  scheduled_date: string | null;
  checked_in_at: string | null;
  check_in_json: string | null;
  checked_out_at: string | null;
  check_out_json: string | null;
  location_status: LocationStatus;
  exception_reason: string | null;
  exception_approved_by: string | null;
  exception_approved_at: string | null;
  shared_with_customer: number;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  ai_json: string | null;
  is_demo: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRow {
  id: string;
  survey_id: string;
  uploader_user_id: string;
  client_key: string;
  kind: "photo" | "video" | "document" | "signature";
  category: string;
  caption: string;
  item_id: string | null;
  plane_id: string | null;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  original_name: string;
  thumb_storage_key: string | null;
  thumb_source: "server" | "device" | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  duration_source: "server" | "device" | null;
  capture_source: "in_app_camera" | "file_upload" | "unknown";
  captured_at: string | null;
  captured_at_source: "exif" | "device_file" | "device_clock" | null;
  device_lat: number | null;
  device_lng: number | null;
  device_accuracy_m: number | null;
  location_source: "device_gps" | "exif" | "none";
  uploaded_at: string;
  status: "active" | "removed";
  removed_at: string | null;
  removed_by: string | null;
  review_status: "pending" | "accepted" | "rejected";
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface EventRow {
  id: string;
  survey_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  type: string;
  message: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface RevisionRow {
  id: string;
  survey_id: string;
  revision: number;
  status: string;
  data_json: string;
  evidence_ids_json: string;
  changed_fields_json: string;
  reason: string | null;
  created_by: string | null;
  creator_name: string | null;
  created_at: string;
}

export interface AckRow {
  id: string;
  survey_id: string;
  client_name: string;
  consent_text: string;
  consent_version: string;
  signature_evidence_id: string | null;
  device_time: string | null;
  recorded_by: string;
  acknowledged_at: string;
}

/* ----------------------------------------------------------------------------
 * Access control
 * ------------------------------------------------------------------------- */

export type SurveyRole = "surveyor" | "reviewer" | "customer";

export function installerForUser(userId: string): { id: string; business_name: string; verification_status: string } | undefined {
  return db.prepare("SELECT id, business_name, verification_status FROM installers WHERE user_id = ?").get(userId) as
    | { id: string; business_name: string; verification_status: string }
    | undefined;
}

/**
 * The caller's relationship to a survey, or null when they have no access:
 * - surveyor: the installer company that owns the survey;
 * - reviewer: SOLARekta admin;
 * - customer: the linked customer, only after the installer shared it.
 */
export function surveyAccess(user: Pick<SessionUser, "id" | "role">, surveyId: string): { survey: SurveyRow; role: SurveyRole } | null {
  const survey = db.prepare("SELECT * FROM site_surveys WHERE id = ?").get(surveyId) as SurveyRow | undefined;
  if (!survey) return null;
  if (user.role === "admin") return { survey, role: "reviewer" };
  if (user.role === "installer") {
    const installer = installerForUser(user.id);
    return installer && installer.id === survey.installer_id ? { survey, role: "surveyor" } : null;
  }
  if (user.role === "customer" && survey.customer_user_id === user.id && survey.shared_with_customer === 1) return { survey, role: "customer" };
  return null;
}

/* ----------------------------------------------------------------------------
 * Creation and listing
 * ------------------------------------------------------------------------- */

export function nextReference(now = new Date()): string {
  const year = now.getUTCFullYear();
  const row = db
    .prepare("INSERT INTO survey_sequences (year, last) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last = last + 1 RETURNING last")
    .get(year) as { last: number };
  return surveyReference(year, row.last);
}

export function addEvent(surveyId: string, actorUserId: string | null, type: string, message?: string | null, payload?: Record<string, unknown>) {
  db.prepare("INSERT INTO survey_events (id, survey_id, actor_user_id, type, message, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(),
    surveyId,
    actorUserId,
    type,
    message ?? null,
    payload ? JSON.stringify(payload) : null,
    nowIso(),
  );
}

export function createSurvey(input: {
  type: SurveyType;
  installerId: string;
  userId: string;
  data: SurveyData;
  customerUserId?: string | null;
  siteId?: string | null;
  quoteRequestId?: string | null;
  isDemo?: boolean;
}): SurveyRow {
  const template = currentTemplate(input.type);
  const id = newId();
  const t = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO site_surveys (id, reference, type, template_version, installer_id, created_by, customer_user_id, site_id, quote_request_id, status, data_json,
         client_name, site_label, surveyor_name, scheduled_date, is_demo, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      nextReference(),
      input.type,
      template.version,
      input.installerId,
      input.userId,
      input.customerUserId ?? null,
      input.siteId ?? null,
      input.quoteRequestId ?? null,
      JSON.stringify(input.data),
      input.data.details.clientName,
      siteLabel(input.data),
      input.data.details.surveyorName,
      input.data.details.scheduledDate || null,
      input.isDemo ? 1 : 0,
      input.userId,
      t,
      t,
    );
    addEvent(id, input.userId, "created", `${template.title} created (template ${template.version}).`);
  })();
  return db.prepare("SELECT * FROM site_surveys WHERE id = ?").get(id) as SurveyRow;
}

function siteLabel(data: SurveyData) {
  return [data.details.address, data.details.city].filter(Boolean).join(", ").slice(0, 300);
}

export interface SurveyListFilters {
  q?: string;
  type?: string;
  status?: string;
  surveyor?: string;
  from?: string;
  to?: string;
  missingEvidence?: boolean;
  flagged?: boolean;
}

export interface SurveyListRow extends SurveyRow {
  installer_name: string;
  evidence_count: number;
  photo_count: number;
}

const LIKE = (s: string) => `%${s.replace(/[%_\\]/g, "")}%`;

/** Lists surveys in the caller's scope: one installer's surveys, everything (admin) or shared (customer). */
export function listSurveys(scope: { installerId?: string; customerUserId?: string; admin?: boolean; excludeDrafts?: boolean }, filters: SurveyListFilters = {}): SurveyListRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (scope.installerId) {
    where.push("s.installer_id = ?");
    args.push(scope.installerId);
  } else if (scope.customerUserId) {
    where.push("s.customer_user_id = ? AND s.shared_with_customer = 1");
    args.push(scope.customerUserId);
  } else if (!scope.admin) {
    return [];
  }
  if (scope.excludeDrafts) where.push("s.status NOT IN ('draft','in_progress')");
  if (filters.q) {
    where.push("(s.client_name LIKE ? OR s.site_label LIKE ? OR s.reference LIKE ?)");
    args.push(LIKE(filters.q), LIKE(filters.q), LIKE(filters.q));
  }
  if (filters.type === "residential" || filters.type === "commercial") {
    where.push("s.type = ?");
    args.push(filters.type);
  }
  if (filters.status) {
    where.push("s.status = ?");
    args.push(filters.status);
  }
  if (filters.surveyor) {
    where.push("s.surveyor_name LIKE ?");
    args.push(LIKE(filters.surveyor));
  }
  if (filters.from) {
    where.push("COALESCE(substr(s.checked_in_at,1,10), s.scheduled_date) >= ?");
    args.push(filters.from);
  }
  if (filters.to) {
    where.push("COALESCE(substr(s.checked_in_at,1,10), s.scheduled_date) <= ?");
    args.push(filters.to);
  }
  if (filters.flagged) where.push("(s.location_status NOT IN ('consistent','not_recorded') AND s.exception_approved_at IS NULL OR (s.checked_in_at IS NULL AND s.status NOT IN ('draft')))");
  const rows = db
    .prepare(
      `SELECT s.*, i.business_name AS installer_name,
         (SELECT COUNT(*) FROM survey_evidence e WHERE e.survey_id = s.id AND e.status = 'active') AS evidence_count,
         (SELECT COUNT(*) FROM survey_evidence e WHERE e.survey_id = s.id AND e.status = 'active' AND e.kind = 'photo' AND e.review_status != 'rejected') AS photo_count
       FROM site_surveys s JOIN installers i ON i.id = s.installer_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.updated_at DESC LIMIT 200`,
    )
    .all(...args) as SurveyListRow[];
  return filters.missingEvidence ? rows.filter((r) => missingRequiredEvidence(r.id).length > 0) : rows;
}

/* ----------------------------------------------------------------------------
 * Detail data
 * ------------------------------------------------------------------------- */

export function surveyData(row: SurveyRow): SurveyData {
  try {
    return parseSurveyData(JSON.parse(row.data_json));
  } catch {
    return parseSurveyData({});
  }
}

export function templateFor(row: SurveyRow) {
  return getTemplate(row.type, row.template_version);
}

export function listEvidence(surveyId: string, options: { includeRemoved?: boolean } = {}): EvidenceRow[] {
  return db
    .prepare(`SELECT * FROM survey_evidence WHERE survey_id = ? ${options.includeRemoved ? "" : "AND status = 'active'"} ORDER BY uploaded_at ASC`)
    .all(surveyId) as EvidenceRow[];
}

export function getEvidence(id: string): EvidenceRow | undefined {
  return db.prepare("SELECT * FROM survey_evidence WHERE id = ?").get(id) as EvidenceRow | undefined;
}

export function evidenceSummaries(rows: EvidenceRow[]): EvidenceSummary[] {
  return rows.map((e) => ({ id: e.id, category: e.category, kind: e.kind, itemId: e.item_id, planeId: e.plane_id, reviewStatus: e.review_status }));
}

export function listEvents(surveyId: string): EventRow[] {
  return db
    .prepare("SELECT e.*, u.name AS actor_name FROM survey_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.survey_id = ? ORDER BY e.created_at ASC, e.rowid ASC")
    .all(surveyId) as EventRow[];
}

export function listRevisions(surveyId: string): RevisionRow[] {
  return db
    .prepare("SELECT r.*, u.name AS creator_name FROM survey_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.survey_id = ? ORDER BY r.created_at ASC, r.rowid ASC")
    .all(surveyId) as RevisionRow[];
}

export function listAcknowledgments(surveyId: string): AckRow[] {
  return db.prepare("SELECT * FROM survey_acknowledgments WHERE survey_id = ? ORDER BY acknowledged_at ASC").all(surveyId) as AckRow[];
}

export function visitState(row: SurveyRow): VisitState {
  return {
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    locationStatus: row.location_status,
    exceptionApproved: Boolean(row.exception_approved_at),
    exceptionReason: row.exception_reason,
  };
}

export function missingRequiredEvidence(surveyId: string): string[] {
  const evidence = listEvidence(surveyId).filter((e) => e.review_status !== "rejected");
  return serverLimits()
    .requiredEvidence.filter((r) => evidence.filter((e) => e.category === r.category && (r.kind === undefined || r.kind === "any" || e.kind === r.kind)).length < r.min)
    .map((r) => r.category);
}

/* ----------------------------------------------------------------------------
 * Saving with optimistic concurrency
 * ------------------------------------------------------------------------- */

export type SaveResult =
  | { ok: true; version: number; updatedAt: string; status: SurveyStatus }
  | { ok: false; reason: "conflict"; current: { version: number; data: SurveyData; updatedAt: string; updatedByName: string | null } }
  | { ok: false; reason: "locked"; status: SurveyStatus };

/**
 * Saves answers when `baseVersion` matches the stored version, otherwise reports a conflict
 * with the stored copy so the client can resolve it. Only editable states accept saves.
 */
export function saveSurvey(surveyId: string, userId: string, baseVersion: number, data: SurveyData): SaveResult {
  return db.transaction((): SaveResult => {
    const row = db.prepare("SELECT * FROM site_surveys WHERE id = ?").get(surveyId) as SurveyRow;
    if (!["draft", "in_progress", "changes_requested"].includes(row.status)) return { ok: false, reason: "locked", status: row.status };
    if (row.version !== baseVersion) {
      const by = row.updated_by ? (db.prepare("SELECT name FROM users WHERE id = ?").get(row.updated_by) as { name: string } | undefined) : undefined;
      return { ok: false, reason: "conflict", current: { version: row.version, data: surveyData(row), updatedAt: row.updated_at, updatedByName: by?.name ?? null } };
    }
    const anyAnswered = Object.values(data.items).some((a) => a.status !== "not_assessed");
    const status: SurveyStatus = row.status === "draft" && anyAnswered ? "in_progress" : row.status;
    const t = nowIso();
    db.prepare(
      `UPDATE site_surveys SET data_json = ?, version = version + 1, status = ?, client_name = ?, site_label = ?, surveyor_name = ?, scheduled_date = ?,
         updated_by = ?, updated_at = ? WHERE id = ? AND version = ?`,
    ).run(JSON.stringify(data), status, data.details.clientName, siteLabel(data), data.details.surveyorName, data.details.scheduledDate || null, userId, t, surveyId, baseVersion);
    if (status !== row.status) addEvent(surveyId, userId, "status", "Survey started (in progress).");
    return { ok: true, version: baseVersion + 1, updatedAt: t, status };
  })();
}

/** Stores an immutable snapshot of the current answers and evidence list. */
export function snapshotRevision(row: SurveyRow, userId: string, reason: string | null): void {
  const previous = db.prepare("SELECT data_json FROM survey_revisions WHERE survey_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(row.id) as { data_json: string } | undefined;
  const current = surveyData(row);
  const changed = previous ? changedFields(parseSurveyData(JSON.parse(previous.data_json)), current) : [];
  const evidenceIds = listEvidence(row.id).map((e) => e.id);
  db.prepare(
    `INSERT OR REPLACE INTO survey_revisions (id, survey_id, revision, status, data_json, evidence_ids_json, changed_fields_json, reason, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), row.id, row.revision, row.status, row.data_json, JSON.stringify(evidenceIds), JSON.stringify(changed), reason, userId, nowIso());
}

/** True when an evidence item belongs to any submitted snapshot (it must then be kept). */
export function evidenceInRevision(surveyId: string, evidenceId: string): boolean {
  const rows = db.prepare("SELECT evidence_ids_json FROM survey_revisions WHERE survey_id = ?").all(surveyId) as { evidence_ids_json: string }[];
  return rows.some((r) => (JSON.parse(r.evidence_ids_json) as string[]).includes(evidenceId));
}
