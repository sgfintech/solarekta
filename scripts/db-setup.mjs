#!/usr/bin/env node
/**
 * Creates (or resets) the local SQLite database from db/schema.sql.
 *
 * Usage:
 *   node scripts/db-setup.mjs          # create the database if it does not exist
 *   node scripts/db-setup.mjs --reset  # delete the database and recreate it
 *
 * Env:
 *   DATABASE_PATH  optional absolute/relative path (default: var/solarekta.db)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const schemaPath = path.join(root, "db", "schema.sql");
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(root, "var", "solarekta.db");

const reset = process.argv.includes("--reset");

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema not found at ${schemaPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (reset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target);
  }
  console.log(`Removed existing database at ${dbPath}`);
}

const database = new Database(dbPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

const schema = fs.readFileSync(schemaPath, "utf8");
database.exec(schema);

const tables = database
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);

const foreignKeys = database.pragma("foreign_keys", { simple: true });

database.close();

console.log(`Database ready: ${dbPath}`);
console.log(`Tables (${tables.length}): ${tables.join(", ")}`);
console.log(`Foreign keys: ${foreignKeys ? "on" : "off"}`);
if (!reset) {
  console.log("Tip: run `npm run db:seed` to load synthetic demo data.");
}
