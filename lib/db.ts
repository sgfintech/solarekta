import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "@/lib/migrations";

const globalForDb = globalThis as unknown as { __solarektaDb?: Database.Database };

function resolveDbPath() {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "var", "solarekta.db");
}

function createDb() {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  const hasSchema = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (!hasSchema) {
    const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    database.exec(schema);
  }
  // Additive, idempotent migrations keep existing databases (including real user data) current.
  runMigrations(database);
  return database;
}

export const db = globalForDb.__solarektaDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__solarektaDb = db;
}
