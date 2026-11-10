import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { dateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: string | null;
  ip: string | null;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  await requireUser(["admin"]);
  const query = await searchParams;
  const actionFilter = (query.action ?? "").trim().slice(0, 80);
  const requestedPage = Number(query.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const where = actionFilter ? "WHERE a.action LIKE ?" : "";
  const params = actionFilter ? [`%${actionFilter}%`] : [];

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM audit_events a ${where}`).get(...params) as { count: number }
  ).count;

  const events = db
    .prepare(
      `SELECT a.*, u.email AS actor_email FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, offset) as AuditRow[];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Append-only record of authentication, verification, quote, data-rights and file-access events. Metadata keys matching password/token/secret are redacted before storage."
        actions={<Link href="/admin" className="btn btn-ghost btn-sm">Back to operations</Link>}
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[15rem] flex-1">
          <label htmlFor="action" className="label">Filter by action prefix</label>
          <input
            id="action"
            name="action"
            className="input"
            defaultValue={actionFilter}
            placeholder="e.g. installer. or quote."
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">Apply filter</button>
        {actionFilter ? (
          <Link href="/admin/audit" className="btn btn-ghost btn-sm">Clear</Link>
        ) : null}
        <p className="ml-auto text-xs text-muted">{total.toLocaleString("en-PH")} events</p>
      </form>

      {events.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-muted">No audit events match this filter.</div>
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table min-w-[860px]">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th>Metadata</th></tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap text-xs text-ink-soft">{dateTime(event.created_at)}</td>
                  <td className="text-xs">
                    <p className="font-medium text-ink">{event.actor_email ?? "system"}</p>
                    <p className="text-muted">{event.actor_role ? titleCase(event.actor_role) : "—"}</p>
                  </td>
                  <td className="font-mono text-xs text-ink">{event.action}</td>
                  <td className="text-xs text-ink-soft">
                    {event.entity_type}
                    {event.entity_id ? <span className="block font-mono text-xs text-muted">{event.entity_id}</span> : null}
                  </td>
                  <td className="font-mono text-xs text-muted">{event.ip ?? "—"}</td>
                  <td className="max-w-[18rem] text-xs">
                    {event.metadata_json ? (
                      <details>
                        <summary className="link-action">View</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-paper-deep/60 p-2 text-xs text-ink-soft">
                          {prettyJson(event.metadata_json)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <p className="text-xs text-muted">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/audit?page=${page - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/audit?page=${page + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
              className="btn btn-secondary btn-sm"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        Audit records are retained for security and dispute handling. They are not editable from this interface. Database
        owners can still alter rows directly — production deployments should ship these events to append-only storage.
      </p>
    </>
  );
}

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
