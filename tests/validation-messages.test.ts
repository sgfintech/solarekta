import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emailSchema, loginSchema, zodFieldErrors, zodMessage } from "@/lib/validation";

describe("plain-language validation messages", () => {
  it("rewrites library defaults using the field name", () => {
    const schema = z.object({
      generationChargePhp: z.coerce.number().min(0),
      notes: z.string().max(5),
      timelineWeeks: z.coerce.number().int().min(1),
      kind: z.enum(["a", "b"]),
      installerIds: z.array(z.string()).min(1),
    });
    const r = schema.safeParse({ generationChargePhp: -1, notes: "too long text", timelineWeeks: "x", kind: "z", installerIds: [] });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errors = zodFieldErrors(r.error);
    expect(errors.generationChargePhp).toBe("Generation charge (₱) must be at least 0.");
    expect(errors.notes).toBe("Notes is too long. Keep it under 5 characters.");
    expect(errors.timelineWeeks).toBe("Enter a number for timeline.");
    expect(errors.kind).toBe("Choose one of the options for kind.");
    expect(errors.installerIds).toBe("Choose at least 1 for installer ids.");
    for (const message of Object.values(errors)) expect(message).not.toMatch(/Too small|Too big|Invalid input|expected/);
  });

  it("keeps messages written in a schema", () => {
    const r = loginSchema.safeParse({ email: "a@b.ph", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(zodMessage(r.error)).toBe("Enter your password.");
  });

  it("asks for an email address instead of quoting a length rule", () => {
    const empty = emailSchema.safeParse("");
    const short = emailSchema.safeParse("a@b");
    expect(!empty.success && zodMessage(empty.error)).toBe("Enter your email address.");
    expect(!short.success && zodMessage(short.error)).toBe("Enter a valid email address, like name@example.com.");
  });
});
