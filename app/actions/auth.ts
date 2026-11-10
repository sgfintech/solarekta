"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroySession, safeNextPath, homeForRole } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { loginSchema, signupSchema, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { Role, UserRow } from "@/lib/types";
import { claimDraft, getDraftByToken, GUEST_DRAFT_COOKIE } from "@/lib/guest-drafts";

/**
 * After a customer signs up or logs in, move any guest estimate held in this browser
 * into their account. Ownership is proven only by the httpOnly draft token.
 * Returns where to send the user, or null when there is no draft.
 */
async function transferGuestEstimate(userId: string, role: Role): Promise<string | null> {
  if (role !== "customer") return null;
  const store = await cookies();
  const token = store.get(GUEST_DRAFT_COOKIE)?.value;
  if (!token) return null;
  const draft = getDraftByToken(token);
  if (!draft) {
    store.delete(GUEST_DRAFT_COOKIE);
    return null;
  }
  if (!draft.completed) return "/estimate"; // keep the draft; let them finish it signed in
  const claimed = claimDraft(token, userId);
  store.delete(GUEST_DRAFT_COOKIE);
  if (!claimed.ok) return null;
  logAudit({ actorUserId: userId, actorRole: role, action: "estimate.claimed", entityType: "assessment", entityId: claimed.assessmentId });
  return `/app/assessments/${claimed.assessmentId}?from=estimate`;
}

const PRIVACY_VERSION = "2026-01";

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    acceptTerms: formData.get("acceptTerms"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  const h = await headers();
  const ip = clientIp(h);
  const limit = rateLimit(`signup:${ip}`, 8, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Too many sign-up attempts. Please try again later." };

  const { name, email, password, role, acceptTerms } = parsed.data;
  if (acceptTerms !== "on") return { error: "Please accept the terms and privacy notice." };

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return { error: "An account with this email already exists. Try logging in instead." };
  }

  const userId = newId();
  const timestamp = nowIso();

  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, name, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, ?)`,
    ).run(userId, email, hashPassword(password), name, role, timestamp, timestamp);

    if (role === "customer") {
      db.prepare(
        `INSERT INTO customer_profiles (user_id, account_type, created_at, updated_at)
         VALUES (?, 'homeowner', ?, ?)`,
      ).run(userId, timestamp, timestamp);
    }

    const consent = db.prepare(
      `INSERT INTO consents (id, user_id, kind, version, granted_at, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    consent.run(newId(), userId, "terms", PRIVACY_VERSION, timestamp, ip);
    consent.run(newId(), userId, "privacy", PRIVACY_VERSION, timestamp, ip);
    if (role === "customer") {
      consent.run(newId(), userId, "bill_processing", PRIVACY_VERSION, timestamp, ip);
    }
  });

  try {
    create();
  } catch {
    return { error: "We could not create the account. Please try again." };
  }

  logAudit({
    actorUserId: userId,
    actorRole: role,
    action: "user.signup",
    entityType: "user",
    entityId: userId,
    ip,
  });

  await createSession(userId, { ip, userAgent: h.get("user-agent") ?? undefined });
  const afterEstimate = await transferGuestEstimate(userId, role);
  redirect(afterEstimate ?? (role === "installer" ? "/installer/onboarding" : role === "supplier" ? "/supplier/profile" : "/app"));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  const h = await headers();
  const ip = clientIp(h);
  const limit = rateLimit(`login:${ip}:${parsed.data.email}`, 10, 15 * 60 * 1000);
  if (!limit.ok) return { error: "Too many attempts. Wait a few minutes and try again." };

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(parsed.data.email) as UserRow | undefined;
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    // Constant response for unknown email and wrong password to avoid account enumeration.
    return { error: "Email or password is incorrect." };
  }
  if (user.status !== "active") {
    return { error: "This account is suspended. Contact support for help." };
  }

  await createSession(user.id, { ip, userAgent: h.get("user-agent") ?? undefined });
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "user.login",
    entityType: "user",
    entityId: user.id,
    ip,
  });

  const afterEstimate = await transferGuestEstimate(user.id, user.role as Role);
  const next = safeNextPath(formData.get("next"), homeForRole(user.role as Role));
  redirect(afterEstimate ?? next);
}

export async function logoutAction() {
  const h = await headers();
  const ip = clientIp(h);
  await destroySession();
  logAudit({ action: "user.logout", entityType: "session", ip });
  redirect("/");
}
