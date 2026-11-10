import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ResolveDataRequestForm } from "@/components/admin/data-request-form";
import { Alert } from "@/components/icons";
import { dateTime, shortDate, statusTone, titleCase } from "@/lib/format";

export const metadata = { title: "Data requests" };

interface DataRequestRow {
  id: string;
  kind: "export" | "deletion";
  status: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  email: string;
  name: string;
  role: string;
  user_status: string;
  site_count: number;
  bill_count: number;
}

export default async function AdminDataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  await requireUser(["admin"]);
  const query = await searchParams;

  const requests = db
    .prepare(
      `SELECT dr.*, u.email, u.name, u.role, u.status AS user_status,
         (SELECT COUNT(*) FROM sites s WHERE s.user_id = dr.user_id) AS site_count,
         (SELECT COUNT(*) FROM electricity_bills b WHERE b.user_id = dr.user_id) AS bill_count
       FROM data_requests dr JOIN users u ON u.id = dr.user_id
       ORDER BY CASE dr.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
         dr.created_at DESC`,
    )
    .all() as DataRequestRow[];

  return (
    <>
      <PageHeader
        eyebrow="Privacy operations"
        title="Data rights requests"
        description="Handle export and deletion requests. Deletion is destructive: review the request, check for open disputes, then resolve. Every action is audit-logged."
      />

      {query.done ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          Request marked completed and the customer record updated.
        </div>
      ) : null}

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#f5d68a] bg-sun-soft/60 p-4 text-xs leading-relaxed text-[#6b4708]">
        <Alert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The built-in export endpoint lets a signed-in user download their own JSON copy immediately. A pending export
          request here means the user also asked for human review. Deletion removes sites, bills, assessments, installer
          records, consents and sessions, anonymises the user row, and deletes private upload files. Do not delete while an
          open quote request or dispute still needs the record.
        </p>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title="No data requests"
          body="Customers and installers can request an export or deletion from Settings & privacy. Requests appear here for review."
          action={<Link href="/admin" className="btn btn-secondary">Back to operations</Link>}
        />
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table min-w-[860px]">
            <caption className="sr-only">Data export and deletion requests</caption>
            <thead>
              <tr><th>User</th><th>Type</th><th>Status</th><th>Requested</th><th>Resolved</th><th>Scope</th><th>Note</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <p className="font-medium text-ink">{request.name}</p>
                    <p className="text-xs text-muted">{request.email} · {request.role}</p>
                  </td>
                  <td><span className={`badge badge-${request.kind === "deletion" ? "bad" : "neutral"}`}>{titleCase(request.kind)}</span></td>
                  <td><span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span></td>
                  <td className="text-xs text-ink-soft">{shortDate(request.created_at)}</td>
                  <td className="text-xs text-ink-soft">{request.resolved_at ? dateTime(request.resolved_at) : "—"}</td>
                  <td className="text-xs text-muted">{request.site_count} sites · {request.bill_count} bills</td>
                  <td className="max-w-[16rem] text-xs text-ink-soft">{request.note || "—"}</td>
                  <td className="text-right">
                    {["pending", "processing"].includes(request.status) ? (
                      <ResolveDataRequestForm
                        requestId={request.id}
                        kind={request.kind}
                        label={request.kind === "deletion" ? "Complete deletion" : "Mark export completed"}
                      />
                    ) : (
                      <span className="text-xs text-muted">{request.user_status === "suspended" ? "Account anonymised" : "Closed"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
