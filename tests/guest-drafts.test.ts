import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Guest estimate drafts: ownership is proven only by the random token, a draft can be
 * claimed once, and claiming creates records owned by the claiming user.
 */
let drafts: typeof import("@/lib/guest-drafts");
let database: import("better-sqlite3").Database;
let tempDir: string;

const userA = "00000000-0000-4000-8000-0000000000a1";
const userB = "00000000-0000-4000-8000-0000000000b1";

const complete = {
  monthlyKwh: 486,
  monthlyBillPhp: 5832,
  utilityProvider: "Meralco",
  city: "Quezon City",
  province: "Metro Manila",
  propertyType: "residential" as const,
  daytimeUsage: "medium" as const,
  roofAreaStatus: "unknown" as const,
  roofType: "concrete" as const,
  systemType: "not_sure" as const,
};

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solarekta-guest-test-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.db");
  ({ db: database } = await import("@/lib/db"));
  drafts = await import("@/lib/guest-drafts");
  for (const [id, email] of [[userA, "a@guest.ph"], [userB, "b@guest.ph"]]) {
    database
      .prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'x', 'T', 'customer', 'active', 't', 't')")
      .run(id, email);
  }
});

afterAll(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("guest drafts", () => {
  it("creates a draft with a random token and stores only its hash", () => {
    const { token, draft } = drafts.saveDraft(null, { monthlyKwh: 300, monthlyBillPhp: 3600 }, 2);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const row = database.prepare("SELECT * FROM guest_drafts WHERE id = ?").get(draft.id) as { token_hash: string; data_json: string };
    expect(row.token_hash).not.toBe(token);
    expect(row.data_json).not.toMatch(/@|address|name/i);
    expect(drafts.getDraftByToken(token)?.data.monthlyKwh).toBe(300);
    expect(draft.completed).toBe(false);
  });

  it("preserves earlier answers when later steps are saved (Back/Continue)", () => {
    const first = drafts.saveDraft(null, { monthlyKwh: 486, monthlyBillPhp: 5832 }, 2);
    drafts.saveDraft(first.token, { city: "Pasig", propertyType: "commercial", daytimeUsage: "high" }, 3);
    const again = drafts.saveDraft(first.token, { monthlyKwh: 500 }, 2);
    expect(again.draft.data).toMatchObject({ monthlyKwh: 500, monthlyBillPhp: 5832, city: "Pasig" });
    expect(again.draft.step).toBe(3);
  });

  it("does not treat a draft id or a wrong token as proof of ownership", () => {
    const { draft } = drafts.saveDraft(null, complete, 5);
    expect(drafts.claimDraft(draft.id, userA)).toEqual({ ok: false, reason: "not_found" });
    expect(drafts.claimDraft("x".repeat(43), userA)).toEqual({ ok: false, reason: "not_found" });
    expect(drafts.claimDraft(undefined, userA)).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses to claim an incomplete draft", () => {
    const { token } = drafts.saveDraft(null, { monthlyKwh: 486, monthlyBillPhp: 5832 }, 2);
    expect(drafts.claimDraft(token, userA)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("transfers a complete draft to the claiming user exactly once", () => {
    const { token } = drafts.saveDraft(null, complete, 5);
    const claimed = drafts.claimDraft(token, userA);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;

    const site = database.prepare("SELECT * FROM sites WHERE id = ?").get(claimed.siteId) as Record<string, unknown>;
    expect(site.user_id).toBe(userA);
    expect(site.roof_area_status).toBe("unknown");
    expect(site.export_preference).toBe("not_sure");
    const bill = database.prepare("SELECT * FROM electricity_bills WHERE site_id = ?").get(claimed.siteId) as Record<string, unknown>;
    expect(bill.user_id).toBe(userA);
    expect(bill.source).toBe("manual");
    const assessment = database.prepare("SELECT * FROM assessments WHERE id = ?").get(claimed.assessmentId) as { user_id: string; result_json: string; model_version: string };
    expect(assessment.user_id).toBe(userA);
    expect(assessment.model_version).toBe("solar-ph-2026.2");
    expect(JSON.parse(assessment.result_json).sizing.status).toBe("roof_unchecked");

    // Second claim, by anyone, fails; the active-draft lookup no longer returns it.
    expect(drafts.claimDraft(token, userB)).toEqual({ ok: false, reason: "already_claimed" });
    expect(drafts.claimDraft(token, userA)).toEqual({ ok: false, reason: "already_claimed" });
    expect(drafts.getDraftByToken(token)).toBeNull();
    const userBSites = database.prepare("SELECT COUNT(*) AS c FROM sites WHERE user_id = ?").get(userB) as { c: number };
    expect(userBSites.c).toBe(0);
    // Inputs are removed from the draft once transferred.
    const row = database.prepare("SELECT data_json FROM guest_drafts WHERE claimed_assessment_id = ?").get(claimed.assessmentId) as { data_json: string };
    expect(row.data_json).toBe("{}");
  });

  it("ignores expired drafts", () => {
    const { token, draft } = drafts.saveDraft(null, complete, 5);
    database.prepare("UPDATE guest_drafts SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(draft.id);
    expect(drafts.getDraftByToken(token)).toBeNull();
    expect(drafts.claimDraft(token, userA)).toEqual({ ok: false, reason: "not_found" });
  });

  it("discards a draft on start over", () => {
    const { token } = drafts.saveDraft(null, { monthlyKwh: 486 }, 1);
    drafts.discardDraft(token);
    expect(drafts.getDraftByToken(token)).toBeNull();
  });
});
