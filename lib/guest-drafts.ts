import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { newId, nowIso, sha256 } from "@/lib/ids";
import { createAssessmentRecord } from "@/lib/assessments";
import { isCompleteEstimate, type GuestEstimateData } from "@/lib/validation";
import type { AssessmentInputs } from "@/lib/solar/engine";
import type { SiteRow } from "@/lib/types";

/**
 * Guest estimate drafts live on the server. The browser holds only a random,
 * httpOnly token; the database stores its SHA-256 hash. Possession of the token is
 * the only proof of ownership — a draft id supplied by a client is never trusted.
 * Drafts hold minimal, non-identifying inputs and expire after DRAFT_TTL_MS.
 */
export const GUEST_DRAFT_COOKIE = "solarekta_estimate";
export const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface GuestDraft {
  id: string;
  data: GuestEstimateData;
  step: number;
  completed: boolean;
  expiresAt: string;
}

interface DraftRow {
  id: string;
  token_hash: string;
  data_json: string;
  step: number;
  completed: number;
  expires_at: string;
  claimed_by_user_id: string | null;
  claimed_assessment_id: string | null;
}

function toDraft(row: DraftRow): GuestDraft {
  let data: GuestEstimateData = {};
  try {
    data = JSON.parse(row.data_json) as GuestEstimateData;
  } catch {
    data = {};
  }
  return { id: row.id, data, step: row.step, completed: row.completed === 1, expiresAt: row.expires_at };
}

function purgeExpired() {
  db.prepare("DELETE FROM guest_drafts WHERE expires_at < ? AND claimed_by_user_id IS NULL").run(nowIso());
}

/** Returns an active (unexpired, unclaimed) draft for this token, or null. */
export function getDraftByToken(token: string | undefined | null): GuestDraft | null {
  if (!token || token.length < 20) return null;
  const row = db
    .prepare("SELECT * FROM guest_drafts WHERE token_hash = ? AND expires_at > ? AND claimed_by_user_id IS NULL")
    .get(sha256(token), nowIso()) as DraftRow | undefined;
  return row ? toDraft(row) : null;
}

/**
 * Merges validated step data into the draft for `token`, creating a new draft (and
 * token) when none is active. Returns the token that should be stored in the cookie.
 */
export function saveDraft(token: string | undefined | null, patch: Partial<GuestEstimateData>, step: number): { token: string; draft: GuestDraft } {
  purgeExpired();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
  const existing = getDraftByToken(token);

  if (existing && token) {
    const data = { ...existing.data, ...patch };
    if (data.roofAreaStatus === "unknown") delete data.roofAreaM2;
    const completed = isCompleteEstimate(data) ? 1 : 0;
    const nextStep = Math.max(existing.step, step);
    db.prepare("UPDATE guest_drafts SET data_json = ?, step = ?, completed = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(data),
      nextStep,
      completed,
      expiresAt,
      timestamp,
      existing.id,
    );
    return { token, draft: { id: existing.id, data, step: nextStep, completed: completed === 1, expiresAt } };
  }

  const newToken = randomBytes(32).toString("base64url");
  const id = newId();
  const data = { ...patch };
  const completed = isCompleteEstimate(data) ? 1 : 0;
  db.prepare(
    `INSERT INTO guest_drafts (id, token_hash, data_json, step, completed, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sha256(newToken), JSON.stringify(data), step, completed, expiresAt, timestamp, timestamp);
  return { token: newToken, draft: { id, data, step, completed: completed === 1, expiresAt } };
}

/** Ends a draft early (Start over). */
export function discardDraft(token: string | undefined | null) {
  if (!token) return;
  db.prepare("DELETE FROM guest_drafts WHERE token_hash = ? AND claimed_by_user_id IS NULL").run(sha256(token));
}

/** Engine inputs for a complete draft. */
export function draftToInputs(data: GuestEstimateData): AssessmentInputs {
  return {
    city: data.city as string,
    monthlyKwh: data.monthlyKwh as number,
    monthlyBillPhp: data.monthlyBillPhp as number,
    roofAreaM2: data.roofAreaStatus === "known" ? (data.roofAreaM2 as number) : null,
    roofType: data.roofType ?? "unknown",
    daytimeUsage: data.daytimeUsage ?? "medium",
    systemType: data.systemType ?? "not_sure",
    installBudgetPhp: null,
  };
}

export type ClaimResult =
  | { ok: true; siteId: string; assessmentId: string }
  | { ok: false; reason: "not_found" | "incomplete" | "already_claimed" };

/**
 * Transfers a completed guest draft to `userId`: creates a site, a manually entered
 * bill and an assessment owned by that user, then marks the draft claimed. The
 * conditional UPDATE guarantees a draft can be claimed exactly once, even under races.
 */
export function claimDraft(token: string | undefined | null, userId: string): ClaimResult {
  if (!token) return { ok: false, reason: "not_found" };
  const row = db
    .prepare("SELECT * FROM guest_drafts WHERE token_hash = ? AND expires_at > ?")
    .get(sha256(token), nowIso()) as DraftRow | undefined;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.claimed_by_user_id) return { ok: false, reason: "already_claimed" };
  const draft = toDraft(row);
  if (!isCompleteEstimate(draft.data)) return { ok: false, reason: "incomplete" };

  const d = draft.data;
  const timestamp = nowIso();
  const lock = db
    .prepare("UPDATE guest_drafts SET claimed_by_user_id = ?, claimed_at = ?, updated_at = ? WHERE id = ? AND claimed_by_user_id IS NULL")
    .run(userId, timestamp, timestamp, row.id);
  if (lock.changes !== 1) return { ok: false, reason: "already_claimed" };

  const siteId = newId();
  const unknownRoof = d.roofAreaStatus !== "known";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO sites (id, user_id, name, city, province, property_type, ownership, roof_type, roof_area_m2,
         roof_area_status, daytime_usage, export_preference, utility_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'owner', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      siteId,
      userId,
      d.propertyType === "commercial" ? "My business" : "My home",
      d.city,
      d.province || null,
      d.propertyType ?? "residential",
      d.roofType ?? "unknown",
      unknownRoof ? 0 : d.roofAreaM2,
      unknownRoof ? "unknown" : "known",
      d.daytimeUsage ?? "medium",
      d.systemType ?? "not_sure",
      d.utilityProvider || null,
      timestamp,
      timestamp,
    );
    db.prepare(
      `INSERT INTO electricity_bills (id, site_id, user_id, provider, monthly_kwh, total_php, effective_rate_php,
         status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'manual', ?, ?)`,
    ).run(
      newId(),
      siteId,
      userId,
      d.utilityProvider || "Not specified",
      d.monthlyKwh,
      d.monthlyBillPhp,
      Math.round(((d.monthlyBillPhp as number) / (d.monthlyKwh as number)) * 100) / 100,
      timestamp,
      timestamp,
    );
  })();

  const site = db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(siteId, userId) as SiteRow;
  const { id: assessmentId } = createAssessmentRecord(userId, site.id, draftToInputs(d));
  db.prepare("UPDATE guest_drafts SET claimed_assessment_id = ?, data_json = '{}' WHERE id = ?").run(assessmentId, row.id);
  return { ok: true, siteId, assessmentId };
}
