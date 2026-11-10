import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database: Database.Database;

const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

function insertUser(id: string, email = `${id}@example.ph`, role = "customer") {
  const timestamp = "2026-01-01T00:00:00.000Z";
  database
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'scrypt$x$y', 'Test User', ?, 'active', ?, ?)",
    )
    .run(id, email, role, timestamp, timestamp);
}

beforeEach(() => {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(schema);
});

afterEach(() => {
  database.close();
});

describe("database schema", () => {
  it("creates the complete MVP table set", () => {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const expected of [
      "users",
      "sessions",
      "sites",
      "electricity_bills",
      "bill_extractions",
      "assessments",
      "assessment_scenarios",
      "consents",
      "installers",
      "installer_documents",
      "verification_events",
      "quote_requests",
      "quote_invites",
      "installer_quotes",
      "quote_line_items",
      "lead_status_events",
      "notifications",
      "audit_events",
      "data_requests",
      "files",
      "customer_profiles",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("enforces the role and status checks", () => {
    expect(() => insertUser("u1", "u1@example.ph", "superadmin")).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('u2','u2@example.ph','x','A','customer','banned','t','t')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects duplicate emails", () => {
    insertUser("u1", "same@example.ph");
    expect(() => insertUser("u2", "same@example.ph")).toThrow(/UNIQUE constraint failed/);
  });

  it("enforces foreign keys", () => {
    expect(() =>
      database
        .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1','missing','t','t')")
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("cascades site deletion when a user is deleted", () => {
    insertUser("u1");
    database
      .prepare(
        "INSERT INTO sites (id, user_id, name, city, roof_area_m2, created_at, updated_at) VALUES ('site1','u1','Casa','Quezon City',82,'t','t')",
      )
      .run();
    database.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(database.prepare("SELECT COUNT(*) AS count FROM sites").get()).toEqual({ count: 0 });
  });

  it("allows only one invite per request/installer pair", () => {
    insertUser("customer");
    insertUser("installer-user", "installer@example.ph", "installer");
    database
      .prepare(
        "INSERT INTO installers (id, user_id, business_name, slug, verification_status, created_at, updated_at) VALUES ('inst1','installer-user','Solar Co','solar-co','verified','t','t')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO sites (id, user_id, name, city, roof_area_m2, created_at, updated_at) VALUES ('site1','customer','Casa','Quezon City',82,'t','t')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO assessments (id, site_id, user_id, model_version, inputs_json, result_json, created_at, updated_at) VALUES ('a1','site1','customer','v','{}','{}','t','t')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, created_at, updated_at) VALUES ('qr1','customer','site1','a1','t','t')",
      )
      .run();
    const insertInvite = database.prepare(
      "INSERT INTO quote_invites (id, quote_request_id, installer_id, created_at) VALUES (?, 'qr1', 'inst1', 't')",
    );
    insertInvite.run("inv1");
    expect(() => insertInvite.run("inv2")).toThrow(/UNIQUE constraint failed/);
  });

  it("restricts scenario names and lifecycle states", () => {
    insertUser("u1");
    database
      .prepare(
        "INSERT INTO sites (id, user_id, name, city, roof_area_m2, created_at, updated_at) VALUES ('s1','u1','Casa','Quezon City',82,'t','t')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO assessments (id, site_id, user_id, model_version, inputs_json, result_json, created_at, updated_at) VALUES ('a1','s1','u1','v','{}','{}','t','t')",
      )
      .run();
    expect(() =>
      database
        .prepare(
          "INSERT INTO assessment_scenarios (id, assessment_id, name, capacity_kwp, annual_production_kwh, annual_savings_php, capex_php, net_25y_php, self_consumption_ratio, summary_json) VALUES ('sc1','a1','medium',1,1,1,1,1,1,'{}')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      database
        .prepare(
          "INSERT INTO electricity_bills (id, site_id, user_id, provider, monthly_kwh, total_php, status, created_at, updated_at) VALUES ('b1','s1','u1','Meralco',100,1000,'paid','t','t')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("keeps audit metadata as JSON text without sensitive columns", () => {
    database
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, ip, created_at) VALUES ('e1',NULL,'admin','installer.approve','installer','i1','{\"to\":\"verified\"}','127.0.0.1','t')",
      )
      .run();
    const row = database.prepare("SELECT metadata_json FROM audit_events WHERE id = 'e1'").get() as { metadata_json: string };
    expect(JSON.parse(row.metadata_json)).toEqual({ to: "verified" });
  });
});
