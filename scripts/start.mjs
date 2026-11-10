#!/usr/bin/env node
/**
 * Production entrypoint (used by the Dockerfile).
 *
 * 1. Makes sure the database folder and UPLOAD_DIR exist (on the persistent volume).
 * 2. Creates the schema on a brand-new database. Migrations still run inside the app.
 * 3. Optionally creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD /
 *    ADMIN_NAME. It only ever creates a missing account: it never changes an existing
 *    user's password or role. Remove ADMIN_PASSWORD from the environment afterwards.
 * 4. Starts `next start` on PORT and forwards shutdown signals.
 */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(root, "var", "solarekta.db");
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(root, "var", "uploads");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (!hasUsers) {
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  console.log(`[start] Created a new database at ${dbPath}`);
}

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (email && password) {
  const existing = db.prepare("SELECT id, role FROM users WHERE email = ?").get(email);
  if (existing) {
    console.log(`[start] ADMIN_EMAIL already has an account (role: ${existing.role}); nothing changed. You can remove ADMIN_PASSWORD now.`);
  } else if (password.length < 12) {
    console.error("[start] ADMIN_PASSWORD must be at least 12 characters; admin account NOT created.");
  } else {
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, name, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'admin', 'active', ?, ?)`,
    ).run(randomUUID(), email, hash, (process.env.ADMIN_NAME || "Administrator").trim(), now, now);
    console.log(`[start] Created admin account ${email}. Remove ADMIN_PASSWORD from the environment now.`);
  }
}
db.close();

const port = process.env.PORT || "3000";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
