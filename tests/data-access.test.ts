import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Integration coverage for the ownership-scoped data access layer. Every query
 * that serves customer or installer data must include the ownership predicate,
 * otherwise a valid session could read another party's records.
 */

let data: typeof import("@/lib/data");
let database: import("better-sqlite3").Database;
let tempDir: string;

const ids = {
  customerA: "00000000-0000-4000-8000-000000000001",
  customerB: "00000000-0000-4000-8000-000000000002",
  installerUserA: "00000000-0000-4000-8000-000000000003",
  installerUserB: "00000000-0000-4000-8000-000000000004",
  installerA: "00000000-0000-4000-8000-000000000005",
  installerB: "00000000-0000-4000-8000-000000000006",
  siteA: "00000000-0000-4000-8000-000000000007",
  siteB: "00000000-0000-4000-8000-000000000008",
  billA: "00000000-0000-4000-8000-000000000009",
  assessmentA: "00000000-0000-4000-8000-00000000000a",
  assessmentB: "00000000-0000-4000-8000-00000000000b",
  requestA: "00000000-0000-4000-8000-00000000000c",
  requestB: "00000000-0000-4000-8000-00000000000d",
  inviteA: "00000000-0000-4000-8000-00000000000e",
  inviteB: "00000000-0000-4000-8000-00000000000f",
  quoteA: "00000000-0000-4000-8000-000000000010",
};

function insertUser(id: string, email: string, role: string) {
  database
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'scrypt$x$y', 'Test User', ?, 'active', 't', 't')",
    )
    .run(id, email, role);
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solarekta-data-test-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.db");
  // Import after the env var is set so lib/db creates the test database.
  ({ db: database } = await import("@/lib/db"));
  data = await import("@/lib/data");

  insertUser(ids.customerA, "a@example.ph", "customer");
  insertUser(ids.customerB, "b@example.ph", "customer");
  insertUser(ids.installerUserA, "ia@example.ph", "installer");
  insertUser(ids.installerUserB, "ib@example.ph", "installer");

  database
    .prepare(
      "INSERT INTO installers (id, user_id, business_name, slug, verification_status, verified_at, created_at, updated_at) VALUES (?, ?, 'Verified Solar', 'verified-solar', 'verified', 't', 't', 't')",
    )
    .run(ids.installerA, ids.installerUserA);
  database
    .prepare(
      "INSERT INTO installers (id, user_id, business_name, slug, verification_status, created_at, updated_at) VALUES (?, ?, 'Pending Solar', 'pending-solar', 'pending', 't', 't')",
    )
    .run(ids.installerB, ids.installerUserB);

  database
    .prepare(
      "INSERT INTO sites (id, user_id, name, city, roof_area_m2, created_at, updated_at) VALUES (?, ?, 'Casa A', 'Quezon City', 82, 't', 't')",
    )
    .run(ids.siteA, ids.customerA);
  database
    .prepare(
      "INSERT INTO sites (id, user_id, name, city, roof_area_m2, created_at, updated_at) VALUES (?, ?, 'Casa B', 'Pasig', 90, 't', 't')",
    )
    .run(ids.siteB, ids.customerB);

  database
    .prepare(
      "INSERT INTO electricity_bills (id, site_id, user_id, provider, monthly_kwh, total_php, status, source, created_at, updated_at) VALUES (?, ?, ?, 'Meralco', 486, 5832, 'confirmed', 'manual', 't', 't')",
    )
    .run(ids.billA, ids.siteA, ids.customerA);

  for (const [id, site, user] of [
    [ids.assessmentA, ids.siteA, ids.customerA],
    [ids.assessmentB, ids.siteB, ids.customerB],
  ] as const) {
    database
      .prepare(
        "INSERT INTO assessments (id, site_id, user_id, model_version, inputs_json, result_json, created_at, updated_at) VALUES (?, ?, ?, 'solar-ph-2026.1', '{}', '{}', 't', 't')",
      )
      .run(id, site, user);
  }

  database
    .prepare(
      "INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, status, share_contact, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', 1, 't', 't')",
    )
    .run(ids.requestA, ids.customerA, ids.siteA, ids.assessmentA);
  database
    .prepare(
      "INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, status, share_contact, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', 0, 't', 't')",
    )
    .run(ids.requestB, ids.customerB, ids.siteB, ids.assessmentB);

  database
    .prepare(
      "INSERT INTO quote_invites (id, quote_request_id, installer_id, status, created_at) VALUES (?, ?, ?, 'quoted', 't')",
    )
    .run(ids.inviteA, ids.requestA, ids.installerA);
  database
    .prepare(
      "INSERT INTO quote_invites (id, quote_request_id, installer_id, status, created_at) VALUES (?, ?, ?, 'invited', 't')",
    )
    .run(ids.inviteB, ids.requestB, ids.installerB);

  database
    .prepare(
      "INSERT INTO installer_quotes (id, invite_id, quote_request_id, installer_id, status, capacity_kwp, price_php, warranty_years, workmanship_warranty_years, timeline_weeks, expected_annual_kwh, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', 3.2, 188000, 12, 5, 8, 4380, 't', 't')",
    )
    .run(ids.quoteA, ids.inviteA, ids.requestA, ids.installerA);

  const notification = database.prepare(
    "INSERT INTO notifications (id, user_id, kind, title, created_at, read_at) VALUES (?, ?, 'quote_received', ?, ?, ?)",
  );
  notification.run("n1", ids.customerA, "Unread", "2026-01-02T00:00:00.000Z", null);
  notification.run("n2", ids.customerA, "Read", "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z");
  notification.run("n3", ids.customerB, "Other customer", "2026-01-04T00:00:00.000Z", null);
});

afterAll(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("customer ownership isolation", () => {
  it("returns a site only to its owner", () => {
    expect(data.getSite(ids.siteA, ids.customerA)?.name).toBe("Casa A");
    expect(data.getSite(ids.siteA, ids.customerB)).toBeUndefined();
  });

  it("returns a bill only to its owner", () => {
    expect(data.getBill(ids.billA, ids.customerA)?.monthly_kwh).toBe(486);
    expect(data.getBill(ids.billA, ids.customerB)).toBeUndefined();
  });

  it("returns an assessment only to its owner", () => {
    expect(data.getAssessment(ids.assessmentA, ids.customerA)?.id).toBe(ids.assessmentA);
    expect(data.getAssessment(ids.assessmentA, ids.customerB)).toBeUndefined();
  });

  it("scopes quote requests to the requesting customer", () => {
    expect(data.getQuoteRequestForCustomer(ids.requestA, ids.customerA)?.id).toBe(ids.requestA);
    expect(data.getQuoteRequestForCustomer(ids.requestA, ids.customerB)).toBeUndefined();
  });
});

describe("installer access isolation", () => {
  it("returns a lead only to an invited installer", () => {
    expect(data.getQuoteRequestForInstaller(ids.requestA, ids.installerA)?.id).toBe(ids.requestA);
    expect(data.getQuoteRequestForInstaller(ids.requestA, ids.installerB)).toBeUndefined();
  });

  it("lists only verified installers publicly", () => {
    const installers = data.listVerifiedInstallers();
    expect(installers.map((installer) => installer.id)).toEqual([ids.installerA]);
  });

  it("resolves the installer profile from the session user", () => {
    expect(data.getInstallerByUserId(ids.installerUserA)?.id).toBe(ids.installerA);
    expect(data.getInstallerByUserId(ids.customerA)).toBeUndefined();
  });

  it("requires both consent and verification before exposing contact details", () => {
    expect(
      data.customerCanSeeContact(
        data.getQuoteRequestForCustomer(ids.requestA, ids.customerA)!,
        data.getInstaller(ids.installerA)!,
      ),
    ).toBe(true);
    expect(
      data.customerCanSeeContact(
        data.getQuoteRequestForCustomer(ids.requestB, ids.customerB)!,
        data.getInstaller(ids.installerB)!,
      ),
    ).toBe(false);
  });

  it("returns only the quote attached to an invite", () => {
    expect(data.getQuoteForInvite(ids.inviteA)?.id).toBe(ids.quoteA);
    expect(data.getQuoteForInvite(ids.inviteB)).toBeUndefined();
  });
});

describe("notifications", () => {
  it("counts only the current user's unread notifications", () => {
    expect(data.unreadNotificationCount(ids.customerA)).toBe(1);
    expect(data.unreadNotificationCount(ids.customerB)).toBe(1);
  });

  it("lists the current user's notifications newest first", () => {
    const notifications = data.listNotifications(ids.customerA);
    expect(notifications.map((notification) => notification.id)).toEqual(["n1", "n2"]);
  });
});
