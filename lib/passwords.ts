import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing helpers kept free of Next.js-only imports so they can be unit
 * tested and reused by seed scripts. The auth module re-exports these functions.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
}
