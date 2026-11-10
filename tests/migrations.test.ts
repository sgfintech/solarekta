import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "@/lib/migrations";

function columns(db: Database.Database, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("additive migrations", () => {
  it("upgrades a pre-2026.2 database without changing existing values, and is idempotent", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    const t = "2026-01-01T00:00:00.000Z";
    db.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('u1','a@b.ph','x','A','customer','active',?,?)").run(t, t);
    db.prepare(
      `INSERT INTO sites (id, user_id, name, city, roof_area_m2, monthly_budget_php, created_at, updated_at)
       VALUES ('s1','u1','Home','Quezon City',82,8000,?,?)`,
    ).run(t, t);

    runMigrations(db);
    runMigrations(db); // second run must be a no-op

    expect(columns(db, "sites")).toEqual(expect.arrayContaining(["install_budget_php", "roof_area_status", "export_preference"]));
    expect(columns(db, "installer_quotes")).toEqual(expect.arrayContaining(["panel_model", "inverter_model", "equipment_supplier", "inclusions"]));
    const site = db.prepare("SELECT * FROM sites WHERE id = 's1'").get() as Record<string, unknown>;
    // The ambiguous legacy value is preserved and NOT silently reinterpreted as an installation budget.
    expect(site.monthly_budget_php).toBe(8000);
    expect(site.install_budget_php).toBeNull();
    expect(site.roof_area_status).toBe("known");
    expect(site.roof_area_m2).toBe(82);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["guest_drafts", "ai_cache", "ai_usage", "schema_migrations"]));
    const applied = db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number };
    expect(applied.c).toBe(8);

    expect(() =>
      db.prepare("UPDATE sites SET roof_area_status = 'guess' WHERE id = 's1'").run(),
    ).toThrow();
  });
});
