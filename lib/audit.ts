import "server-only";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";

export interface AuditInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export function logAudit(input: AuditInput) {
  db.prepare(
    `INSERT INTO audit_events (id, actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.actorUserId ?? null,
    input.actorRole ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.metadata ? JSON.stringify(redact(input.metadata)) : null,
    input.ip ?? null,
    nowIso(),
  );
}

export function notify(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
}) {
  db.prepare(
    "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(newId(), input.userId, input.kind, input.title, input.body ?? null, input.href ?? null, nowIso());
}

const SENSITIVE = /password|token|secret|authorization|cookie/i;
function redact(metadata: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    out[key] = SENSITIVE.test(key) ? "[redacted]" : value;
  }
  return out;
}
