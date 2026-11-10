import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";

describe("password hashing", () => {
  it("stores a versioned scrypt hash with a random salt", () => {
    const first = hashPassword("Solarekta2026!");
    const second = hashPassword("Solarekta2026!");
    expect(first).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(first).not.toBe(second);
  });

  it("verifies the correct password", () => {
    const stored = hashPassword("correct horse battery 9");
    expect(verifyPassword("correct horse battery 9", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("correct horse battery 9");
    expect(verifyPassword("correct horse battery 8", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("rejects malformed or tampered hashes without throwing", () => {
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "plaintext")).toBe(false);
    expect(verifyPassword("anything", "bcrypt$abc$def")).toBe(false);
    const stored = hashPassword("password1234");
    const [, salt, digest] = stored.split("$");
    const tampered = `scrypt$${salt}$${digest.slice(0, -2)}00`;
    expect(verifyPassword("password1234", tampered)).toBe(false);
  });
});
