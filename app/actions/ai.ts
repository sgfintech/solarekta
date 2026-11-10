"use server";

import { actionUser } from "@/lib/auth";
import { getAssessment } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { answerAssessmentQuestion, generateExplanation, generateQuoteSummary, SUGGESTED_QUESTIONS, type Locale, type QuoteSummary } from "@/lib/ai/features";

export type ExplanationState = { text?: string; source?: "ai" | "deterministic"; locale?: Locale; notice?: string; error?: string } | null;
export type AssistantState = { question?: string; answer?: string; source?: "ai" | "deterministic"; supported?: boolean; error?: string } | null;
export type QuoteSummaryState = { summary?: QuoteSummary; error?: string } | null;

export async function explainAssessmentAction(_prev: ExplanationState, formData: FormData): Promise<ExplanationState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in again." };
  const assessment = getAssessment(String(formData.get("assessmentId") ?? ""), user.id);
  if (!assessment) return { error: "Estimate not found." };
  const locale: Locale = formData.get("locale") === "fil" ? "fil" : "en";
  const force = formData.get("force") === "1";
  if (force && !rateLimit(`explain:${user.id}`, 6, 60 * 60 * 1000).ok) {
    return { error: "You have regenerated this several times. Please try again later." };
  }
  const outcome = await generateExplanation(assessment, user.id, locale, { force });
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "assessment.explained", entityType: "assessment", entityId: assessment.id, metadata: { source: outcome.source, locale } });
  return { ...outcome, locale };
}

export async function askAssistantAction(_prev: AssistantState, formData: FormData): Promise<AssistantState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in again." };
  const assessment = getAssessment(String(formData.get("assessmentId") ?? ""), user.id);
  if (!assessment) return { error: "Estimate not found." };
  if (!rateLimit(`assistant:${user.id}`, 30, 60 * 60 * 1000).ok) return { error: "You have asked a lot of questions in a short time. Please try again later." };
  const questionId = String(formData.get("questionId") ?? "") || undefined;
  const question = String(formData.get("question") ?? "");
  const answer = await answerAssessmentQuestion(assessment, user.id, { questionId, question });
  const asked = SUGGESTED_QUESTIONS.find((q) => q.id === questionId)?.text ?? question.slice(0, 300);
  return { ...answer, question: asked };
}

export async function summarizeQuotesAction(_prev: QuoteSummaryState, formData: FormData): Promise<QuoteSummaryState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in again." };
  const requestId = String(formData.get("requestId") ?? "");
  const force = formData.get("force") === "1";
  if (force && !rateLimit(`quotesum:${user.id}`, 6, 60 * 60 * 1000).ok) return { error: "Please try again later." };
  const summary = await generateQuoteSummary(requestId, user.id, { force });
  if (!summary) return { error: "Quote request not found." };
  return { summary };
}
