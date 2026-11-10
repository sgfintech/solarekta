import "server-only";
import { db } from "@/lib/db";
import { serverLimits } from "@/lib/survey/config";
import { evidenceSummaries, listAcknowledgments, listEvents, listEvidence, listRevisions, surveyData, templateFor, visitState, type SurveyRow, type SurveyRole } from "@/lib/survey/data";
import { contradictionChecks, submissionChecks } from "@/lib/survey/model";
import { evidenceView } from "@/lib/survey/view";
import type { DetailProps } from "@/components/survey/survey-detail";

/** Builds the read-only detail view for a role. Customers get no device metadata, comments or history. */
export function buildDetail(survey: SurveyRow, role: SurveyRole): DetailProps {
  const template = templateFor(survey);
  const data = surveyData(survey);
  const limits = serverLimits();
  const evidenceRows = listEvidence(survey.id, { includeRemoved: role !== "customer" }).filter((e) => role !== "customer" || e.review_status !== "rejected");
  const active = evidenceRows.filter((e) => e.status === "active");
  const installer = db.prepare("SELECT business_name FROM installers WHERE id = ?").get(survey.installer_id) as { business_name: string } | undefined;
  const reviewer = survey.reviewed_by ? (db.prepare("SELECT name FROM users WHERE id = ?").get(survey.reviewed_by) as { name: string } | undefined) : undefined;
  const checkIn = survey.check_in_json ? (JSON.parse(survey.check_in_json) as DetailProps["survey"]["checkIn"]) : null;
  const sigById = new Map(evidenceRows.map((e) => [e.id, e]));
  return {
    role,
    survey: {
      id: survey.id,
      reference: survey.reference,
      type: survey.type,
      status: survey.status,
      revision: survey.revision,
      templateVersion: survey.template_version,
      installerName: installer?.business_name ?? "Installer",
      checkedInAt: survey.checked_in_at,
      checkedOutAt: survey.checked_out_at,
      locationStatus: survey.location_status,
      checkIn: role === "customer" ? null : checkIn,
      exceptionReason: survey.exception_reason,
      exceptionApprovedAt: survey.exception_approved_at,
      submittedAt: survey.submitted_at,
      reviewedAt: survey.reviewed_at,
      reviewerName: reviewer?.name ?? null,
      reviewNote: survey.review_note,
    },
    template,
    data,
    evidence: evidenceRows.filter((e) => role !== "customer" || e.status === "active").map((e) => evidenceView(e, role)),
    issues:
      role === "customer"
        ? []
        : submissionChecks({ template, data, evidence: evidenceSummaries(active), requirements: limits.requiredEvidence, visit: visitState(survey), requireCheckIn: limits.requireCheckIn }),
    contradictions: role === "customer" ? [] : contradictionChecks(survey.type, data),
    events: role === "customer" ? [] : listEvents(survey.id).map((e) => ({ id: e.id, type: e.type, message: e.message, actorName: e.actor_name, at: e.created_at })),
    revisions: role === "customer" ? [] : listRevisions(survey.id).map((r) => ({ revision: r.revision, status: r.status, reason: r.reason, changed: JSON.parse(r.changed_fields_json) as string[], by: r.creator_name, at: r.created_at })),
    acknowledgments: listAcknowledgments(survey.id).map((a) => ({
      clientName: a.client_name,
      at: a.acknowledged_at,
      consentVersion: a.consent_version,
      signatureUrl: a.signature_evidence_id && sigById.get(a.signature_evidence_id) ? `/api/surveys/evidence/${a.signature_evidence_id}` : null,
    })),
  };
}
