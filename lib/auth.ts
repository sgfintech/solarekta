import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { nowIso, sha256 } from "@/lib/ids";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import type { Role, SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "solarekta_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export { hashPassword, verifyPassword };

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const id = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, userId, expiresAt.toISOString(), nowIso(), meta.ip ?? null, meta.userAgent ?? null);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
  }
  store.delete(SESSION_COOKIE);
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), nowIso()) as SessionUser | undefined;
  if (!row || row.status !== "active") return null;
  return row;
});

export function homeForRole(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "installer") return "/installer";
  if (role === "supplier") return "/supplier";
  return "/app";
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

/** For server actions: returns null instead of redirecting. */
export async function actionUser(roles?: Role[]): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return user;
}

export function safeNextPath(value: FormDataEntryValue | null, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
