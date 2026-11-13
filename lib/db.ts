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
  let database: Database.Database;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    // Wait for locks from other processes on the same file (instead of failing with
    // SQLITE_BUSY). Set before anything else, including the journal-mode switch.
    database = new Database(dbPath, { timeout: 10_000 });
  } catch (error) {
    // Serverless hosts (e.g. Vercel) have a read-only app folder and no persistent disk.
    // Say so plainly instead of surfacing a bare EROFS / SQLITE_CANTOPEN.
    throw new Error(
      `SOLARekta could not open its SQLite database at ${dbPath}. It needs a writable, persistent disk ` +
        "(it cannot run on serverless hosts such as Vercel). Deploy with the Dockerfile on Railway with a " +
        "volume at /data, or set DATABASE_PATH to a writable location — see docs/DEPLOYMENT.md.",
      { cause: error },
    );
  }
  database.pragma("busy_timeout = 10000");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

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

/** Opens the database on first use (not at import), and reuses it afterwards. */
export function getDb(): Database.Database {
  if (!globalForDb.__solarektaDb) globalForDb.__solarektaDb = createDb();
  return globalForDb.__solarektaDb;
}

/**
 * The shared connection. It is opened lazily so that importing a module never touches the
 * database: `next build` loads every route in parallel workers while collecting page data,
 * and opening (and migrating) the file there caused SQLITE_BUSY build failures.
 */
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, property) {
    const real = getDb();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getDb(), property, value);
  },
});
