"use server";

import { Readable } from "node:stream";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { field } from "@/lib/validation";
import { CLIENT_CONSENT_TEXT, CLIENT_CONSENT_VERSION, serverLimits } from "@/lib/survey/config";
import {
  addEvent,
  createSurvey,
  evidenceInRevision,
  evidenceSummaries,
  getEvidence,
  installerForUser,
  listEvidence,
  saveSurvey,
  snapshotRevision,
  surveyAccess,
  surveyData,
  templateFor,
  visitState,
  type SurveyRow,
} from "@/lib/survey/data";
import { assessLocation, canTransition, EDITABLE, emptySurveyData, reopenCreatesRevision, submissionChecks, type CheckIssue, type LocationStatus } from "@/lib/survey/model";
import { deleteEvidenceFiles, EvidenceUploadError, storeEvidence } from "@/lib/survey/storage";
import { generateSurveyAssist } from "@/lib/survey/ai";
import type { SessionUser } from "@/lib/types";

function notify(userId: string, title: string, body: string, href: string) {
  db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'survey', ?, ?, ?, ?)").run(newId(), userId, title, body, href, nowIso());
}
function notifyAdmins(title: string, body: string, href: string) {
  for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all() as { id: string }[]) notify(a.id, title, body, href);
}
function installerUserId(installerId: string): string | null {
  return (db.prepare("SELECT user_id FROM installers WHERE id = ?").get(installerId) as { user_id: string } | undefined)?.user_id ?? null;
}
const reload = (row: Pick<SurveyRow, "id">) => db.prepare("SELECT * FROM site_surveys WHERE id = ?").get(row.id) as SurveyRow;

async function surveyorAccess(surveyId: string): Promise<{ user: SessionUser; survey: SurveyRow } | null> {
  const user = await actionUser(["installer"]);
  if (!user) return null;
  const access = surveyAccess(user, surveyId);
  return access && access.role === "surveyor" ? { user, survey: access.survey } : null;
}
async function reviewerAccess(surveyId: string): Promise<{ user: SessionUser; survey: SurveyRow } | null> {
  const user = await actionUser(["admin"]);
  if (!user) return null;
  const access = surveyAccess(user, surveyId);
  return access ? { user, survey: access.survey } : null;
}

/* ----------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------- */

export async function createSurveyAction(formData: FormData): Promise<void> {
  const user = await actionUser(["installer"]);
  if (!user) redirect("/login");
  const installer = installerForUser(user.id);
  if (!installer) redirect("/installer/onboarding");
  if (installer.verification_status !== "verified") redirect("/installer/surveys?error=verify");
  const type = field(formData, "type") === "commercial" ? "commercial" : "residential";
  const data = emptySurveyData();
  data.details.surveyorName = user.name;
  data.details.scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(field(formData, "scheduledDate")) ? field(formData, "scheduledDate") : "";

  let customerUserId: string | null = null;
  let siteId: string | null = null;
  let quoteRequestId: string | null = null;
  const leadId = field(formData, "quoteRequestId");
  if (leadId) {
    // Only leads this installer was invited to; only contact details the customer chose to share.
    const lead = db
      .prepare(
        `SELECT qr.*, s.address, s.city, s.province, s.utility_provider, s.property_type, s.id AS site_ref FROM quote_requests qr
         JOIN quote_invites qi ON qi.quote_request_id = qr.id AND qi.installer_id = ?
         JOIN sites s ON s.id = qr.site_id WHERE qr.id = ?`,
      )
      .get(installer.id, leadId) as
      | { id: string; customer_user_id: string; site_ref: string; address: string | null; city: string; province: string | null; utility_provider: string | null; share_contact: number; contact_name: string | null; contact_phone: string | null; property_type: string }
      | undefined;
    if (lead) {
      quoteRequestId = lead.id;
      customerUserId = lead.customer_user_id;
      siteId = lead.site_ref;
      data.details.address = lead.address ?? "";
      data.details.city = lead.city;
      data.details.province = lead.province ?? "";
      data.details.utility = lead.utility_provider ?? "";
      if (lead.share_contact) {
        data.details.clientName = lead.contact_name ?? "";
        data.details.clientPhone = lead.contact_phone ?? "";
      }
    }
  }
  const survey = createSurvey({ type, installerId: installer.id, userId: user.id, data, customerUserId, siteId, quoteRequestId });
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "survey.created", entityType: "survey", entityId: survey.id, metadata: { type, linkedLead: Boolean(quoteRequestId) } });
  redirect(`/installer/surveys/${survey.id}`);
}

/* ----------------------------------------------------------------------------
 * Visit check-in / check-out
 * ------------------------------------------------------------------------- */

export interface VisitInput {
  surveyId: string;
  outcome: "ok" | "denied" | "unavailable" | "skipped";
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  deviceTime?: string | null;
  note?: string;
}
export type VisitResult = { ok: true; at: string; locationStatus: LocationStatus; distance: number | null } | { ok: false; error: string };

function cleanLocation(input: VisitInput) {
  const lat = typeof input.lat === "number" && Number.isFinite(input.lat) && Math.abs(input.lat) <= 90 ? input.lat : null;
  const lng = typeof input.lng === "number" && Number.isFinite(input.lng) && Math.abs(input.lng) <= 180 ? input.lng : null;
  const accuracy = typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy >= 0 ? Math.round(input.accuracy) : null;
  return lat != null && lng != null ? { lat, lng, accuracy } : null;
}

/** Records the server time of "Start site visit" and, if allowed, the device-reported location. */
export async function startVisitAction(input: VisitInput): Promise<VisitResult> {
  const ctx = await surveyorAccess(input.surveyId);
  if (!ctx) return { ok: false, error: "Survey not found." };
  if (!EDITABLE.includes(ctx.survey.status)) return { ok: false, error: "Reopen the survey to record a visit." };
  if (ctx.survey.checked_in_at) return { ok: false, error: "The visit was already started." };
  const limits = serverLimits();
  const device = input.outcome === "ok" ? cleanLocation(input) : null;
  const data = surveyData(ctx.survey);
  const assessed = assessLocation({ device, outcome: device ? "ok" : input.outcome === "ok" ? "unavailable" : input.outcome, site: { lat: data.details.siteLat, lng: data.details.siteLng }, geofenceMeters: limits.geofenceMeters, maxAccuracyMeters: limits.maxAccuracyMeters });
  const at = nowIso();
  const payload = { outcome: input.outcome, device, deviceTime: input.deviceTime ?? null, note: (input.note ?? "").slice(0, 500), distance: assessed.distance, geofenceMeters: limits.geofenceMeters };
  db.prepare("UPDATE site_surveys SET checked_in_at = ?, check_in_json = ?, location_status = ?, status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END, updated_at = ? WHERE id = ?").run(
    at,
    JSON.stringify(payload),
    assessed.status,
    at,
    ctx.survey.id,
  );
  addEvent(ctx.survey.id, ctx.user.id, "visit_started", "Site visit started.", { locationStatus: assessed.status, distance: assessed.distance, accuracy: device?.accuracy ?? null });
  return { ok: true, at, locationStatus: assessed.status, distance: assessed.distance };
}

export async function finishVisitAction(input: VisitInput): Promise<VisitResult> {
  const ctx = await surveyorAccess(input.surveyId);
  if (!ctx) return { ok: false, error: "Survey not found." };
  if (!ctx.survey.checked_in_at) return { ok: false, error: "Start the visit first." };
  if (ctx.survey.checked_out_at) return { ok: false, error: "The visit was already finished." };
  const device = input.outcome === "ok" ? cleanLocation(input) : null;
  const at = nowIso();
  db.prepare("UPDATE site_surveys SET checked_out_at = ?, check_out_json = ?, updated_at = ? WHERE id = ?").run(at, JSON.stringify({ outcome: input.outcome, device, deviceTime: input.deviceTime ?? null }), at, ctx.survey.id);
  addEvent(ctx.survey.id, ctx.user.id, "visit_finished", "Site visit finished.");
  return { ok: true, at, locationStatus: ctx.survey.location_status, distance: null };
}

/* ----------------------------------------------------------------------------
 * Submit, reopen, share
 * ------------------------------------------------------------------------- */

export type SubmitResult = { ok: true } | { ok: false; error: string; issues?: CheckIssue[] };

export async function submitSurveyAction(surveyId: string): Promise<SubmitResult> {
  const ctx = await surveyorAccess(surveyId);
  if (!ctx) return { ok: false, error: "Survey not found." };
  const { survey, user } = ctx;
  if (!canTransition(survey.status, "submitted", "surveyor")) return { ok: false, error: "This survey can't be submitted in its current state." };
  const limits = serverLimits();
  const data = surveyData(survey);

  // Recompute the location comparison now that the site pin may have been saved after check-in.
  let locationStatus = survey.location_status;
  if (survey.check_in_json) {
    const checkIn = JSON.parse(survey.check_in_json) as { outcome: VisitInput["outcome"]; device: { lat: number; lng: number; accuracy: number | null } | null };
    locationStatus = assessLocation({ device: checkIn.device, outcome: checkIn.device ? "ok" : checkIn.outcome, site: { lat: data.details.siteLat, lng: data.details.siteLng }, geofenceMeters: limits.geofenceMeters, maxAccuracyMeters: limits.maxAccuracyMeters }).status;
  }
  const issues = submissionChecks({
    template: templateFor(survey),
    data,
    evidence: evidenceSummaries(listEvidence(survey.id)),
    requirements: limits.requiredEvidence,
    visit: { ...visitState(survey), locationStatus },
    requireCheckIn: limits.requireCheckIn,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length) return { ok: false, error: `${blockers.length} ${blockers.length === 1 ? "item needs" : "items need"} attention before submitting.`, issues };

  const t = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE site_surveys SET status = 'submitted', location_status = ?, submitted_at = ?, reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = ?, updated_by = ? WHERE id = ?").run(locationStatus, t, t, user.id, survey.id);
    snapshotRevision(reload(survey), user.id, survey.revision > 1 ? "Resubmitted after changes" : "Submitted for review");
    addEvent(survey.id, user.id, "submitted", `Revision ${survey.revision} submitted for technical review.`, { warnings: issues.filter((i) => i.severity === "warning").length });
  })();
  notifyAdmins("Site survey submitted", `${survey.reference} (${survey.client_name || "client"}) is ready for review.`, `/admin/surveys/${survey.id}`);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "survey.submitted", entityType: "survey", entityId: survey.id, metadata: { revision: survey.revision } });
  return { ok: true };
}

/** Reopening after submission keeps the submitted snapshot and starts a new revision that must be resubmitted. */
export async function reopenSurveyAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await surveyorAccess(surveyId);
  if (!ctx) redirect("/installer/surveys");
  const { survey, user } = ctx;
  const reason = field(formData, "reason").slice(0, 500);
  if (!canTransition(survey.status, "in_progress", "surveyor") || survey.status === "in_progress") redirect(`/installer/surveys/${survey.id}`);
  if (reopenCreatesRevision(survey.status) && reason.length < 5) redirect(`/installer/surveys/${survey.id}?reopenError=1#reopen`);
  const newRevision = reopenCreatesRevision(survey.status) ? survey.revision + 1 : survey.revision;
  db.transaction(() => {
    db.prepare("UPDATE site_surveys SET status = 'in_progress', revision = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(newRevision, nowIso(), user.id, survey.id);
    addEvent(survey.id, user.id, "reopened", reopenCreatesRevision(survey.status) ? `Reopened as revision ${newRevision}: ${reason}` : "Reopened to address requested changes.", { from: survey.status, revision: newRevision });
  })();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "survey.reopened", entityType: "survey", entityId: survey.id, metadata: { from: survey.status, revision: newRevision } });
  redirect(`/installer/surveys/${survey.id}`);
}

export async function shareSurveyAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await surveyorAccess(surveyId);
  if (!ctx) redirect("/installer/surveys");
  const share = field(formData, "share") === "yes";
  if (!ctx.survey.customer_user_id) redirect(`/installer/surveys/${surveyId}`);
  db.prepare("UPDATE site_surveys SET shared_with_customer = ?, updated_at = ? WHERE id = ?").run(share ? 1 : 0, nowIso(), surveyId);
  addEvent(surveyId, ctx.user.id, share ? "shared" : "unshared", share ? "Summary shared with the client." : "Client access removed.");
  if (share && ctx.survey.customer_user_id) notify(ctx.survey.customer_user_id, "Site survey shared with you", `${installerForUser(ctx.user.id)?.business_name ?? "Your installer"} shared the survey report for your property.`, `/app/surveys/${surveyId}`);
  redirect(`/installer/surveys/${surveyId}/review`);
}

/* ----------------------------------------------------------------------------
 * Evidence management (surveyor)
 * ------------------------------------------------------------------------- */

export async function updateEvidenceAction(input: { evidenceId: string; caption: string; category: string; itemId: string | null; planeId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const evidence = getEvidence(input.evidenceId);
  if (!evidence) return { ok: false, error: "Not found." };
  const ctx = await surveyorAccess(evidence.survey_id);
  if (!ctx) return { ok: false, error: "Not found." };
  if (!EDITABLE.includes(ctx.survey.status)) return { ok: false, error: "Reopen the survey to edit evidence." };
  db.prepare("UPDATE survey_evidence SET caption = ?, category = ?, item_id = ?, plane_id = ? WHERE id = ?").run(
    String(input.caption ?? "").slice(0, 300),
    String(input.category ?? evidence.category).slice(0, 40),
    input.itemId ? String(input.itemId).slice(0, 60) : null,
    input.planeId ? String(input.planeId).slice(0, 40) : null,
    evidence.id,
  );
  return { ok: true };
}

/**
 * Deletes evidence that was never part of a submitted revision; evidence that was submitted is
 * kept for the history and only hidden from the current revision.
 */
export async function removeEvidenceAction(evidenceId: string): Promise<{ ok: boolean; kept?: boolean; error?: string }> {
  const evidence = getEvidence(evidenceId);
  if (!evidence) return { ok: false, error: "Not found." };
  const ctx = await surveyorAccess(evidence.survey_id);
  if (!ctx) return { ok: false, error: "Not found." };
  if (!EDITABLE.includes(ctx.survey.status)) return { ok: false, error: "Reopen the survey to remove evidence." };
  if (evidenceInRevision(evidence.survey_id, evidence.id) || db.prepare("SELECT 1 FROM survey_acknowledgments WHERE signature_evidence_id = ?").get(evidence.id)) {
    db.prepare("UPDATE survey_evidence SET status = 'removed', removed_at = ?, removed_by = ? WHERE id = ?").run(nowIso(), ctx.user.id, evidence.id);
    addEvent(evidence.survey_id, ctx.user.id, "evidence_removed", "Evidence removed from the current revision (kept in history).", { evidenceId: evidence.id });
    return { ok: true, kept: true };
  }
  db.prepare("DELETE FROM survey_evidence WHERE id = ?").run(evidence.id);
  await deleteEvidenceFiles(evidence);
  addEvent(evidence.survey_id, ctx.user.id, "evidence_deleted", "Evidence deleted before submission.", { evidenceId: evidence.id });
  return { ok: true, kept: false };
}

/* ----------------------------------------------------------------------------
 * Client acknowledgment (drawn signature; not a cryptographic signature)
 * ------------------------------------------------------------------------- */

export async function acknowledgeAction(input: { surveyId: string; clientName: string; signaturePng: string; deviceTime?: string; consent: boolean }): Promise<{ ok: boolean; error?: string }> {
  const ctx = await surveyorAccess(input.surveyId);
  if (!ctx) return { ok: false, error: "Survey not found." };
  if (!EDITABLE.includes(ctx.survey.status)) return { ok: false, error: "Reopen the survey to record an acknowledgment." };
  const name = String(input.clientName ?? "").trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the client's name." };
  if (!input.consent) return { ok: false, error: "The client must read and agree to the acknowledgment text." };
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.signaturePng ?? ""));
  if (!match) return { ok: false, error: "Ask the client to sign in the box." };
  const png = Buffer.from(match[1], "base64");
  if (png.length < 200 || png.length > 600_000) return { ok: false, error: "The signature could not be read. Clear it and sign again." };
  try {
    const { evidence } = await storeEvidence({
      surveyId: ctx.survey.id,
      userId: ctx.user.id,
      body: Readable.from(png),
      declaredBytes: png.length,
      meta: { clientKey: `sig_${newId().replace(/-/g, "")}`, category: "client_acknowledgment", caption: `Acknowledgment drawn by ${name}`, itemId: null, planeId: null, originalName: "acknowledgment.png", captureSource: "unknown", capturedAt: null, capturedAtSource: null, lat: null, lng: null, accuracy: null, durationSec: null, forceKind: "signature" },
    });
    db.prepare(
      "INSERT INTO survey_acknowledgments (id, survey_id, client_name, consent_text, consent_version, signature_evidence_id, device_time, recorded_by, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(newId(), ctx.survey.id, name, CLIENT_CONSENT_TEXT, CLIENT_CONSENT_VERSION, evidence.id, input.deviceTime ? String(input.deviceTime).slice(0, 40) : null, ctx.user.id, nowIso());
    addEvent(ctx.survey.id, ctx.user.id, "acknowledged", `Client acknowledgment drawn by ${name}.`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof EvidenceUploadError ? error.message : "The acknowledgment could not be saved." };
  }
}

/* ----------------------------------------------------------------------------
 * Comments (surveyor or reviewer)
 * ------------------------------------------------------------------------- */

export async function commentAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const message = field(formData, "message").slice(0, 2000);
  const user = await actionUser(["installer", "admin"]);
  if (!user) redirect("/login");
  const access = surveyAccess(user, surveyId);
  const back = user.role === "admin" ? `/admin/surveys/${surveyId}` : `/installer/surveys/${surveyId}/review`;
  if (!access || access.role === "customer") redirect("/");
  if (message.length >= 2) {
    addEvent(surveyId, user.id, "comment", message, { role: access.role });
    if (access.role === "reviewer") {
      const uid = installerUserId(access.survey.installer_id);
      if (uid) notify(uid, "Reviewer comment on a survey", `${access.survey.reference}: ${message.slice(0, 120)}`, `/installer/surveys/${surveyId}/review`);
    }
  }
  redirect(`${back}#timeline`);
}

/* ----------------------------------------------------------------------------
 * Review (admin)
 * ------------------------------------------------------------------------- */

export async function startReviewAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await reviewerAccess(surveyId);
  if (!ctx) redirect("/admin/surveys");
  if (canTransition(ctx.survey.status, "under_review", "reviewer")) {
    db.prepare("UPDATE site_surveys SET status = 'under_review', reviewed_by = ?, updated_at = ? WHERE id = ?").run(ctx.user.id, nowIso(), surveyId);
    addEvent(surveyId, ctx.user.id, "review_started", "Technical review started.");
  }
  redirect(`/admin/surveys/${surveyId}`);
}

/** "Approved" means the record passed internal review — not structural, utility or installation approval. */
export async function decideSurveyAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await reviewerAccess(surveyId);
  if (!ctx) redirect("/admin/surveys");
  const decision = field(formData, "decision") === "approved" ? "approved" : "changes_requested";
  const note = field(formData, "note").slice(0, 2000);
  if (!canTransition(ctx.survey.status, decision, "reviewer")) redirect(`/admin/surveys/${surveyId}?error=state`);
  if (decision === "changes_requested" && note.length < 5) redirect(`/admin/surveys/${surveyId}?error=note#decision`);
  const t = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE site_surveys SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").run(decision, ctx.user.id, t, note || null, t, surveyId);
    snapshotRevision(reload(ctx.survey), ctx.user.id, decision === "approved" ? `Review approved${note ? `: ${note}` : ""}` : `Changes requested: ${note}`);
    addEvent(surveyId, ctx.user.id, decision, decision === "approved" ? `Survey record approved in internal review.${note ? ` ${note}` : ""}` : `Changes requested: ${note}`);
  })();
  const uid = installerUserId(ctx.survey.installer_id);
  if (uid) notify(uid, decision === "approved" ? "Survey review approved" : "Changes requested on a survey", `${ctx.survey.reference}${note ? `: ${note.slice(0, 120)}` : ""}`, `/installer/surveys/${surveyId}/review`);
  logAudit({ actorUserId: ctx.user.id, actorRole: ctx.user.role, action: `survey.${decision}`, entityType: "survey", entityId: surveyId, metadata: { revision: ctx.survey.revision } });
  redirect(`/admin/surveys/${surveyId}?decided=1`);
}

export async function reviewEvidenceAction(formData: FormData): Promise<void> {
  const evidence = getEvidence(field(formData, "evidenceId"));
  if (!evidence) redirect("/admin/surveys");
  const ctx = await reviewerAccess(evidence.survey_id);
  if (!ctx) redirect("/admin/surveys");
  const decision = field(formData, "decision") === "rejected" ? "rejected" : "accepted";
  const note = field(formData, "note").slice(0, 500);
  if (decision === "rejected" && note.length < 3) redirect(`/admin/surveys/${evidence.survey_id}?error=evidence-note#evidence`);
  db.prepare("UPDATE survey_evidence SET review_status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(decision, note || null, ctx.user.id, nowIso(), evidence.id);
  addEvent(evidence.survey_id, ctx.user.id, decision === "rejected" ? "evidence_rejected" : "evidence_accepted", decision === "rejected" ? `Evidence rejected: ${note}` : "Evidence accepted by reviewer.", { evidenceId: evidence.id });
  redirect(`/admin/surveys/${evidence.survey_id}#ev-${evidence.id}`);
}

export async function approveExceptionAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await reviewerAccess(surveyId);
  if (!ctx) redirect("/admin/surveys");
  const reason = field(formData, "reason").slice(0, 1000);
  if (reason.length < 5) redirect(`/admin/surveys/${surveyId}?error=exception#visit`);
  db.prepare("UPDATE site_surveys SET exception_reason = ?, exception_approved_by = ?, exception_approved_at = ?, updated_at = ? WHERE id = ?").run(reason, ctx.user.id, nowIso(), nowIso(), surveyId);
  addEvent(surveyId, ctx.user.id, "exception_override", `Visit/location exception accepted by reviewer: ${reason}`);
  redirect(`/admin/surveys/${surveyId}#visit`);
}

/* ----------------------------------------------------------------------------
 * AI suggestions (explicit action; text answers only)
 * ------------------------------------------------------------------------- */

export async function surveyAssistAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const user = await actionUser(["installer", "admin"]);
  if (!user) redirect("/login");
  const access = surveyAccess(user, surveyId);
  if (!access || access.role === "customer") redirect("/");
  const back = access.role === "reviewer" ? `/admin/surveys/${surveyId}` : `/installer/surveys/${surveyId}/review`;
  if (!rateLimit(`survey-ai:${user.id}`, 10, 60 * 60_000).ok) redirect(`${back}?ai=limit#ai`);
  const result = await generateSurveyAssist(access.survey, user.id);
  db.prepare("UPDATE site_surveys SET ai_json = ? WHERE id = ?").run(JSON.stringify(result), surveyId);
  addEvent(surveyId, user.id, "ai_suggested", result.ok ? "AI suggestions generated (not accepted)." : "AI suggestions unavailable.");
  redirect(`${back}#ai`);
}

/** Copies the AI draft summary into the findings notes after the surveyor accepts it. */
export async function acceptAiSummaryAction(formData: FormData): Promise<void> {
  const surveyId = field(formData, "surveyId");
  const ctx = await surveyorAccess(surveyId);
  if (!ctx) redirect("/installer/surveys");
  const ai = ctx.survey.ai_json ? (JSON.parse(ctx.survey.ai_json) as { ok: boolean; summary?: string }) : null;
  if (!ai?.ok || !ai.summary || !EDITABLE.includes(ctx.survey.status)) redirect(`/installer/surveys/${surveyId}/review#ai`);
  const data = surveyData(ctx.survey);
  data.findings.notes = [data.findings.notes.trim(), `${ai.summary} (AI-drafted summary, accepted by ${ctx.user.name})`].filter(Boolean).join("\n\n");
  const result = saveSurvey(surveyId, ctx.user.id, ctx.survey.version, data);
  if (result.ok) addEvent(surveyId, ctx.user.id, "ai_accepted", "AI-drafted findings summary accepted into the notes.");
  redirect(`/installer/surveys/${surveyId}?section=findings`);
}
