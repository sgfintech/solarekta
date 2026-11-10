import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canTransitionOrder,
  canTransitionPriceRequest,
  nextOrderActions,
  orderSubtotal,
  specSummary,
} from "@/lib/marketplace";
import { runMigrations } from "@/lib/migrations";

describe("marketplace rules", () => {
  it("only allows the documented order transitions, by the right party", () => {
    expect(canTransitionOrder("requested", "confirmed", "supplier")).toBe(true);
    expect(canTransitionOrder("requested", "confirmed", "customer")).toBe(false);
    expect(canTransitionOrder("requested", "cancelled", "customer")).toBe(true);
    expect(canTransitionOrder("confirmed", "paid", "customer")).toBe(false);
    expect(canTransitionOrder("paid", "cancelled", "customer")).toBe(false);
    expect(canTransitionOrder("requested", "shipped", "supplier")).toBe(false);
    expect(canTransitionOrder("shipped", "delivered", "customer")).toBe(true);
    expect(canTransitionOrder("delivered", "cancelled", "supplier")).toBe(false);
    expect(nextOrderActions("requested", "supplier")).toEqual(["confirmed", "declined"]);
    expect(nextOrderActions("confirmed", "customer")).toEqual(["cancelled"]);
  });

  it("only lets suppliers price and installers accept", () => {
    expect(canTransitionPriceRequest("open", "quoted", "supplier")).toBe(true);
    expect(canTransitionPriceRequest("open", "quoted", "installer")).toBe(false);
    expect(canTransitionPriceRequest("quoted", "accepted", "installer")).toBe(true);
    expect(canTransitionPriceRequest("open", "accepted", "installer")).toBe(false);
    expect(canTransitionPriceRequest("accepted", "withdrawn", "installer")).toBe(false);
  });

  it("does not invent a subtotal when an item is priced on request", () => {
    expect(orderSubtotal([{ unitPricePhp: 6950, quantity: 2 }, { unitPricePhp: 7400, quantity: 1 }])).toBe(21300);
    expect(orderSubtotal([{ unitPricePhp: 6950, quantity: 2 }, { unitPricePhp: null, quantity: 1 }])).toBeNull();
  });

  it("summarises only the specs a supplier entered", () => {
    expect(specSummary("panel", { ratedPowerW: 550, efficiencyPct: 21.3 })).toEqual(["550 W", "21.3% efficiency"]);
    expect(specSummary("inverter", { ratedKw: 5, inverterType: "hybrid", phase: "single" })).toEqual(["5 kW", "Hybrid", "Single-phase"]);
    expect(specSummary("battery", {})).toEqual([]);
  });
});

describe("supplier role migration", () => {
  it("rebuilds users to allow suppliers while keeping rows, ids and cascading references", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    const oldSchema = fs
      .readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")
      .replace("CHECK (role IN ('customer','installer','supplier','admin'))", "CHECK (role IN ('customer','installer','admin'))");
    db.exec(oldSchema);
    const t = "2026-01-01T00:00:00.000Z";
    db.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('u1','a@b.ph','hash','A','customer','active',?,?)").run(t, t);
    db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1','u1',?,?)").run(t, t);
    expect(() =>
      db.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('x','x@b.ph','h','X','supplier','active',?,?)").run(t, t),
    ).toThrow();

    runMigrations(db);

    expect(db.prepare("SELECT password_hash FROM users WHERE id = 'u1'").get()).toEqual({ password_hash: "hash" });
    db.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('u2','s@b.ph','h','S','supplier','active',?,?)").run(t, t);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions").get()).toEqual({ c: 0 });
  });
});

describe("marketplace data isolation", () => {
  let tempDir: string;
  let database: import("better-sqlite3").Database;
  let data: typeof import("@/lib/marketplace-data");
  const t = "2026-11-01T00:00:00.000Z";

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solarekta-market-test-"));
    process.env.DATABASE_PATH = path.join(tempDir, "test.db");
    ({ db: database } = await import("@/lib/db"));
    data = await import("@/lib/marketplace-data");
    const user = database.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'h', 'T', ?, 'active', ?, ?)");
    user.run("cust-a", "a@m.ph", "customer", t, t);
    user.run("cust-b", "b@m.ph", "customer", t, t);
    user.run("sup-u1", "s1@m.ph", "supplier", t, t);
    user.run("sup-u2", "s2@m.ph", "supplier", t, t);
    const supplier = database.prepare(
      "INSERT INTO suppliers (id, user_id, business_name, slug, verification_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    supplier.run("sup1", "sup-u1", "Verified Co", "verified-co", "verified", t, t);
    supplier.run("sup2", "sup-u2", "Pending Co", "pending-co", "pending", t, t);
    const product = database.prepare(
      "INSERT INTO products (id, supplier_id, category, brand, model, title, status, price_php, created_at, updated_at) VALUES (?, ?, 'panel', 'B', ?, 'T', ?, 100, ?, ?)",
    );
    product.run("p-live", "sup1", "LIVE", "approved", t, t);
    product.run("p-pending", "sup1", "PEND", "pending", t, t);
    product.run("p-rejected", "sup1", "REJ", "rejected", t, t);
    product.run("p-unverified", "sup2", "UNV", "approved", t, t);
    database
      .prepare("INSERT INTO orders (id, customer_user_id, supplier_id, delivery_city, contact_name, contact_phone, installer_plan, created_at, updated_at) VALUES ('o1','cust-a','sup1','Pasig','A','0917','undecided',?,?)")
      .run(t, t);
  });

  afterAll(() => {
    database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("shows only approved products from verified suppliers publicly", () => {
    expect(data.listCatalogue().map((p) => p.id)).toEqual(["p-live"]);
    expect(data.getPublicProduct("p-live")?.supplier_name).toBe("Verified Co");
    for (const hidden of ["p-pending", "p-rejected", "p-unverified"]) expect(data.getPublicProduct(hidden)).toBeUndefined();
    expect(data.getVerifiedSupplierBySlug("pending-co")).toBeUndefined();
    expect(data.listVerifiedSuppliers().map((s) => s.id)).toEqual(["sup1"]);
  });

  it("scopes orders to the buyer and the supplier who received them", () => {
    expect(data.getOrderForCustomer("o1", "cust-a")?.id).toBe("o1");
    expect(data.getOrderForCustomer("o1", "cust-b")).toBeUndefined();
    expect(data.getOrderForSupplier("o1", "sup1")?.id).toBe("o1");
    expect(data.getOrderForSupplier("o1", "sup2")).toBeUndefined();
  });

  it("scopes supplier products to their owner", () => {
    expect(data.getSupplierProduct("p-live", "sup1")?.id).toBe("p-live");
    expect(data.getSupplierProduct("p-live", "sup2")).toBeUndefined();
  });

  it("ignores LIKE wildcards in catalogue search", () => {
    expect(data.listCatalogue({ q: "%" }).length).toBe(1);
    expect(data.listCatalogue({ q: "LIVE" }).map((p) => p.id)).toEqual(["p-live"]);
  });
});
