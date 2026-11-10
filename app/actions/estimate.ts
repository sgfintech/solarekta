"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { claimDraft, discardDraft, DRAFT_TTL_MS, GUEST_DRAFT_COOKIE, saveDraft } from "@/lib/guest-drafts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ESTIMATE_STEPS, validateEstimateStep, type EstimateStep, type GuestEstimateData } from "@/lib/validation";

export type EstimateState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  savedStep?: number;
  values?: GuestEstimateData;
  nonce?: number;
} | null;

const STEP_FIELDS: Record<EstimateStep, string[]> = {
  1: ["monthlyKwh", "monthlyBillPhp", "utilityProvider"],
  2: ["city", "province", "propertyType", "daytimeUsage"],
  3: ["roofAreaStatus", "roofAreaM2", "roofType"],
  4: ["systemType"],
};

async function setDraftCookie(token: string) {
  const store = await cookies();
  store.set(GUEST_DRAFT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DRAFT_TTL_MS / 1000),
  });
}

/** Validates and saves one wizard step on the server. The final step shows the result. */
export async function saveEstimateStepAction(_prev: EstimateState, formData: FormData): Promise<EstimateState> {
  const stepNumber = Number(formData.get("step"));
  if (!ESTIMATE_STEPS.includes(stepNumber as EstimateStep)) return { error: "Something went wrong. Please reload the page." };
  const step = stepNumber as EstimateStep;

  const h = await headers();
  const limit = rateLimit(`estimate:${clientIp(h)}`, 120, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Too many changes in a short time. Please wait a few minutes and try again." };

  const raw: Record<string, unknown> = {};
  for (const key of STEP_FIELDS[step]) {
    const value = formData.get(key);
    raw[key] = typeof value === "string" ? value : undefined;
  }
  const checked = validateEstimateStep(step, raw);
  if (!checked.ok) return { fieldErrors: checked.fieldErrors, nonce: Date.now() };

  const store = await cookies();
  const { token, draft } = saveDraft(store.get(GUEST_DRAFT_COOKIE)?.value, checked.data, Math.min(step + 1, 5));
  await setDraftCookie(token);

  if (step === 4) {
    if (!draft.completed) {
      return { error: "Some earlier answers are missing. Go back and check each step.", savedStep: step, values: draft.data };
    }
    const user = await getSessionUser();
    if (user?.role === "customer") {
      const claimed = claimDraft(token, user.id);
      if (claimed.ok) {
        store.delete(GUEST_DRAFT_COOKIE);
        logAudit({ actorUserId: user.id, actorRole: user.role, action: "estimate.saved_from_wizard", entityType: "assessment", entityId: claimed.assessmentId });
        redirect(`/app/assessments/${claimed.assessmentId}?from=estimate`);
      }
    }
    redirect("/estimate/result");
  }
  return { savedStep: step, values: draft.data, nonce: Date.now() };
}

export async function startOverEstimateAction() {
  const store = await cookies();
  discardDraft(store.get(GUEST_DRAFT_COOKIE)?.value);
  store.delete(GUEST_DRAFT_COOKIE);
  redirect("/estimate");
}

/** For a signed-in customer viewing a guest result: move it into the account. */
export async function saveEstimateToAccountAction() {
  const user = await getSessionUser();
  if (!user) redirect("/signup?from=estimate");
  if (user.role !== "customer") redirect("/estimate/result?error=role");
  const store = await cookies();
  const claimed = claimDraft(store.get(GUEST_DRAFT_COOKIE)?.value, user.id);
  if (!claimed.ok) redirect(claimed.reason === "incomplete" ? "/estimate" : "/app");
  store.delete(GUEST_DRAFT_COOKIE);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "estimate.claimed", entityType: "assessment", entityId: claimed.assessmentId });
  redirect(`/app/assessments/${claimed.assessmentId}?from=estimate`);
}
