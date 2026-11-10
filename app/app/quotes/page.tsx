import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ArrowRight } from "@/components/icons";
import { shortDate, statusTone } from "@/lib/format";

export const metadata = { title: "Quote requests" };

export default async function QuotesPage() {
  const user = await requireUser(["customer"]);
  const requests = db
    .prepare(
      `SELECT r.*, s.name AS site_name,
        (SELECT COUNT(*) FROM installer_quotes q WHERE q.quote_request_id = r.id AND q.status IN ('submitted','revised')) AS quote_count
       FROM quote_requests r JOIN sites s ON s.id = r.site_id
       WHERE r.customer_user_id = ? ORDER BY r.created_at DESC`,
    )
    .all(user.id) as {
    id: string;
    status: string;
    site_name: string;
    quote_count: number;
    created_at: string;
    share_contact: number;
  }[];

  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Quote requests"
        description="Track who you invited, what came back, and compare bids on the same fields."
        actions={
          <>
            <Link href="/advisor/quote" className="btn btn-secondary btn-sm">Review a quotation</Link>
            <Link href="/advisor" className="btn btn-ghost btn-sm">Ask Solar AI</Link>
          </>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          title="No quote requests yet"
          body="Run an assessment, then choose verified installers to receive structured quotes. You control whether your contact details are shared."
          action={<Link href="/app" className="btn btn-primary">Go to my sites</Link>}
        />
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <caption className="sr-only">Your quote requests</caption>
            <thead>
              <tr><th>Site</th><th>Requested</th><th>Status</th><th className="text-right">Quotes</th><th>Contact</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="font-medium text-ink">{request.site_name}</td>
                  <td className="text-sm text-ink-soft">{shortDate(request.created_at)}</td>
                  <td><span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span></td>
                  <td className="table-num text-right">{request.quote_count}</td>
                  <td className="text-xs text-muted">{request.share_contact ? "Shared" : "Hidden"}</td>
                  <td className="text-right">
                    <Link href={`/app/quotes/${request.id}`} className="link-action text-xs">
                      Compare <ArrowRight className="h-3 w-3" />
                    </Link>
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
