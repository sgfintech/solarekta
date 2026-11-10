import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ArrowRight, Shield } from "@/components/icons";
import { dateTime, peso, shortDate, statusTone, titleCase } from "@/lib/format";

export const metadata = { title: "Operations" };

export default async function AdminHomePage() {
  await requireUser(["admin"]);

  const count = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { count: number }).count;

  const stats = [
    { label: "Customers", value: count("SELECT COUNT(*) AS count FROM users WHERE role = 'customer' AND status = 'active'"), sub: "active accounts" },
    { label: "Verified installers", value: count("SELECT COUNT(*) AS count FROM installers WHERE verification_status = 'verified'"), sub: `${count("SELECT COUNT(*) AS count FROM installers WHERE verification_status = 'pending'")} pending review` },
    { label: "Assessments", value: count("SELECT COUNT(*) AS count FROM assessments WHERE status != 'archived'"), sub: "deterministic model runs" },
    { label: "Open quote requests", value: count("SELECT COUNT(*) AS count FROM quote_requests WHERE status IN ('open','matched')"), sub: `${count("SELECT COUNT(*) AS count FROM data_requests WHERE status IN ('pending','processing')")} data requests open` },
  ];

  const pendingInstallers = db
    .prepare(
      `SELECT i.*, u.email FROM installers i JOIN users u ON u.id = i.user_id
       WHERE i.verification_status IN ('pending','draft')
       ORDER BY i.updated_at ASC LIMIT 6`,
    )
    .all() as { id: string; business_name: string; email: string; service_areas_json: string; updated_at: string; verification_status: string }[];

  const recentRequests = db
    .prepare(
      `SELECT qr.*, s.name AS site_name, s.city, u.name AS customer_name,
         (SELECT COUNT(*) FROM installer_quotes q WHERE q.quote_request_id = qr.id AND q.status IN ('submitted','revised')) AS quote_count
       FROM quote_requests qr
       JOIN sites s ON s.id = qr.site_id
       JOIN users u ON u.id = qr.customer_user_id
       ORDER BY qr.created_at DESC LIMIT 8`,
    )
    .all() as {
    id: string;
    status: string;
    site_name: string;
    city: string;
    customer_name: string;
    quote_count: number;
    created_at: string;
  }[];

  const dataRequests = db
    .prepare(
      `SELECT dr.*, u.email, u.role FROM data_requests dr JOIN users u ON u.id = dr.user_id
       WHERE dr.status IN ('pending','processing') ORDER BY dr.created_at ASC LIMIT 5`,
    )
    .all() as { id: string; kind: string; status: string; created_at: string; email: string; role: string }[];

  const audit = db
    .prepare(
      `SELECT a.*, u.email AS actor_email FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC LIMIT 10`,
    )
    .all() as {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    ip: string | null;
    created_at: string;
    actor_email: string | null;
    actor_role: string | null;
  }[];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Operations overview"
        description="Review installer applications, moderate quotes, handle data rights requests and inspect the audit trail. Every privileged action is logged."
        actions={
          <Link href="/admin/audit" className="btn btn-secondary btn-sm">
            Audit log <ArrowRight />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-xs font-semibold text-muted">{stat.label}</p>
            <p className="mt-1.5 font-display font-bold tracking-tight text-[1.85rem] leading-none text-forest-deep">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg text-forest-deep">Installer review queue</h2>
                <p className="text-xs text-muted">Verification decisions require a human review of documents.</p>
              </div>
              <Link href="/admin/installers" className="link-action text-sm">Open queue</Link>
            </div>
            {pendingInstallers.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">No applications waiting for review.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {pendingInstallers.map((installer) => (
                  <li key={installer.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-medium text-ink">{installer.business_name}</p>
                      <p className="text-xs text-muted">{installer.email} · updated {shortDate(installer.updated_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-${statusTone(installer.verification_status)}`}>{installer.verification_status}</span>
                      <Link href={`/admin/installers#installer-${installer.id}`} className="btn btn-ghost btn-sm">Review</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Recent quote requests</h2>
              <Link href="/admin/quotes" className="link-action text-sm">Moderate quotes</Link>
            </div>
            {recentRequests.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">No quote requests yet.</p>
            ) : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="table">
                  <caption className="sr-only">Recent quote requests across the platform</caption>
                  <thead>
                    <tr><th>Site</th><th>Customer</th><th>Status</th><th>Quotes</th><th>Requested</th></tr>
                  </thead>
                  <tbody>
                    {recentRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <p className="font-medium text-ink">{request.site_name}</p>
                          <p className="text-xs text-muted">{request.city}</p>
                        </td>
                        <td className="text-sm text-ink-soft">{request.customer_name}</td>
                        <td><span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span></td>
                        <td className="table-num">{request.quote_count}</td>
                        <td className="text-xs text-muted">{shortDate(request.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Data requests</h2>
              <Link href="/admin/data-requests" className="link-action text-xs">Open</Link>
            </div>
            {dataRequests.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No open data requests.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {dataRequests.map((request) => (
                  <li key={request.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-ink">{titleCase(request.kind)} request</p>
                    <p className="text-xs text-muted">{request.email} · {request.role}</p>
                    <p className="mt-1 text-xs text-muted">{shortDate(request.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Latest audit events</h2>
              <Link href="/admin/audit" className="link-action px-2 text-xs">View all</Link>
            </div>
            <ul className="divide-y divide-line/70">
              {audit.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-ink">{event.action}</p>
                  <p className="text-xs text-muted">
                    {event.actor_email ?? "system"} · {event.entity_type}
                    {event.entity_id ? ` ${event.entity_id.slice(0, 8)}…` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{dateTime(event.created_at)}</p>
                </li>
              ))}
              {audit.length === 0 ? <li className="px-5 py-6 text-sm text-muted">No audit events yet.</li> : null}
            </ul>
          </section>

          <div className="rounded-2xl border border-line bg-[#ffffff] p-4 text-xs leading-relaxed text-ink-soft">
            <p className="flex gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
              Admin actions are recorded with actor, IP, entity and redacted metadata. Never inspect customer bills without a
              documented support or data-rights reason.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
