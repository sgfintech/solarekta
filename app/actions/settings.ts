"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { requestContext } from "@/lib/request";
import { dataRequestSchema, field, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { UserRow } from "@/lib/types";

const PRIVACY_VERSION = "2026-01";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  if (!user) return { error: "Please log in." };
  const parsed = profileSchema.safeParse({ name: field(formData, "name"), phone: field(formData, "phone") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  db.prepare("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?").run(
    parsed.data.name,
    parsed.data.phone || null,
    nowIso(),
    user.id,
  );
  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "user.profile_updated", entityType: "user", entityId: user.id, ip: ctx.ip });
  redirect("/app/settings?saved=profile");
}

export async function setMarketingConsentAction(formData: FormData) {
  const user = await actionUser();
  if (!user) redirect("/login");
  const optIn = formData.get("optIn") === "on";
  const timestamp = nowIso();

  if (optIn) {
    const active = db
      .prepare("SELECT id FROM consents WHERE user_id = ? AND kind = 'marketing' AND revoked_at IS NULL")
      .get(user.id);
    if (!active) {
      db.prepare("INSERT INTO consents (id, user_id, kind, version, granted_at) VALUES (?, ?, 'marketing', ?, ?)").run(
        newId(),
        user.id,
        PRIVACY_VERSION,
        timestamp,
      );
    }
  } else {
    db.prepare("UPDATE consents SET revoked_at = ? WHERE user_id = ? AND kind = 'marketing' AND revoked_at IS NULL").run(
      timestamp,
      user.id,
    );
  }

  const ctx = await requestContext();
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: optIn ? "consent.marketing_granted" : "consent.marketing_revoked",
    entityType: "user",
    entityId: user.id,
    ip: ctx.ip,
  });
  redirect("/app/settings?saved=consent");
}

export async function createDataRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  if (!user) return { error: "Please log in." };
  const parsed = dataRequestSchema.safeParse({ kind: field(formData, "kind"), note: field(formData, "note") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  const open = db
    .prepare("SELECT id FROM data_requests WHERE user_id = ? AND kind = ? AND status IN ('pending','processing')")
    .get(user.id, parsed.data.kind);
  if (open) return { error: "You already have an open request of this type." };

  db.prepare(
    "INSERT INTO data_requests (id, user_id, kind, status, note, created_at) VALUES (?, ?, ?, 'pending', ?, ?)",
  ).run(newId(), user.id, parsed.data.kind, parsed.data.note || null, nowIso());

  const ctx = await requestContext();
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: `data_request.${parsed.data.kind}_requested`,
    entityType: "user",
    entityId: user.id,
    ip: ctx.ip,
  });
  redirect("/app/settings?saved=request");
}

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(200)
      .regex(/[a-zA-Z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  if (!user) return { error: "Please log in." };
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    newPassword: field(formData, "newPassword"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow | undefined;
  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    return { error: "Your current password is incorrect." };
  }

  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    hashPassword(parsed.data.newPassword),
    nowIso(),
    user.id,
  );
  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "user.password_changed", entityType: "user", entityId: user.id, ip: ctx.ip });
  redirect("/app/settings?saved=password");
}

export async function markNotificationsReadAction() {
  const user = await actionUser();
  if (!user) redirect("/login");
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(nowIso(), user.id);
  redirect("/app/notifications?read=1");
}
