import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminWithdrawQuoteAction } from "@/app/actions/quotes";
import { PageHeader, EmptyState } from "@/components/page-header";
import { shortDate, statusTone, titleCase } from "@/lib/format";
import { peso } from "@/lib/format";

export const metadata = { title: "Quote moderation" };

interface AdminQuoteRow {
  id: string;
  status: string;
  capacity_kwp: number;
  price_php: number;
  warranty_years: number;
  workmanship_warranty_years: number;
  timeline_weeks: number;
  expected_annual_kwh: number;
  exclusions: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  business_name: string;
  verification_status: string;
  request_status: string;
  site_name: string;
  city: string;
  customer_name: string;
}

const FILTERS = [
  { key: "active", label: "Active quotes" },
  { key: "withdrawn", label: "Withdrawn" },
  { key: "all", label: "All" },
] as const;

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; withdrawn?: string }>;
}) {
  await requireUser(["admin"]);
  const query = await searchParams;
  const filter = FILTERS.some((item) => item.key === query.status) ? query.status : "active";
  const where =
    filter === "active"
      ? "WHERE q.status IN ('submitted','revised')"
      : filter === "withdrawn"
        ? "WHERE q.status = 'withdrawn'"
        : "";

  const quotes = db
    .prepare(
      `SELECT q.*, i.business_name, i.verification_status, qr.status AS request_status,
         s.name AS site_name, s.city, u.name AS customer_name
       FROM installer_quotes q
       JOIN installers i ON i.id = q.installer_id
       JOIN quote_requests qr ON qr.id = q.quote_request_id
       JOIN sites s ON s.id = qr.site_id
       JOIN users u ON u.id = qr.customer_user_id
       ${where}
       ORDER BY q.created_at DESC`,
    )
    .all() as AdminQuoteRow[];

  return (
    <>
      <PageHeader
        eyebrow="Marketplace integrity"
        title="Quote moderation"
        description="Inspect installer quotes and withdraw misleading or invalid submissions. Withdrawing does not edit the installer's data; it records a moderation event and notifies the request timeline."
      />

      {query.withdrawn ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          Quote withdrawn and moderation event recorded.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/quotes?status=${item.key}`}
            className={`btn btn-sm ${filter === item.key ? "btn-primary" : "btn-secondary"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          title="No quotes in this view"
          body="Quotes appear when verified installers respond to customer requests. Active quotes are shown by default."
          action={<Link href="/admin" className="btn btn-secondary">Back to operations</Link>}
        />
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => {
            const lineItems = db
              .prepare("SELECT description, amount_php FROM quote_line_items WHERE quote_id = ?")
              .all(quote.id) as { description: string; amount_php: number }[];
            return (
              <article key={quote.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg text-forest-deep">{quote.business_name}</h2>
                      <span className={`badge badge-${statusTone(quote.status)}`}>{quote.status}</span>
                      {quote.verification_status !== "verified" ? <span className="badge badge-bad">installer {quote.verification_status}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {quote.site_name} · {quote.city} · customer {quote.customer_name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p className="font-display font-bold tracking-tight text-xl text-forest-deep">{peso(quote.price_php)}</p>
                    <p>{quote.capacity_kwp} kWp · {Math.round(quote.expected_annual_kwh).toLocaleString("en-PH")} kWh/yr</p>
                    <p>Submitted {shortDate(quote.created_at)}</p>
                  </div>
                </div>
                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Itemised lines</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {lineItems.map((item) => (
                        <li key={item.description} className="flex justify-between gap-3 border-b border-line/60 pb-1 last:border-0">
                          <span className="text-ink-soft">{item.description}</span>
                          <span className="shrink-0 font-medium text-ink">{peso(item.amount_php)}</span>
                        </li>
                      ))}
                      {lineItems.length === 0 ? <li className="text-xs text-muted">No line items recorded.</li> : null}
                    </ul>
                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="flex justify-between gap-3"><dt className="text-muted">Equipment warranty</dt><dd className="font-medium text-ink">{quote.warranty_years} yrs</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted">Workmanship</dt><dd className="font-medium text-ink">{quote.workmanship_warranty_years} yrs</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted">Timeline</dt><dd className="font-medium text-ink">{quote.timeline_weeks} weeks</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted">Request status</dt><dd className="font-medium text-ink">{titleCase(quote.request_status)}</dd></div>
                    </dl>
                    {quote.exclusions ? <p className="mt-3 text-xs text-ink-soft"><strong className="text-ink">Exclusions:</strong> {quote.exclusions}</p> : null}
                    {quote.notes ? <p className="mt-1 text-xs text-ink-soft"><strong className="text-ink">Notes:</strong> {quote.notes}</p> : null}
                  </div>

                  {quote.status !== "withdrawn" ? (
                    <details className="rounded-xl border border-line bg-paper-deep/40 p-4">
                      <summary className="link-action link-danger text-sm">Withdraw this quote</summary>
                      <form action={adminWithdrawQuoteAction} className="mt-3 space-y-2">
                        <input type="hidden" name="quoteId" value={quote.id} />
                        <label htmlFor={`note-${quote.id}`} className="label">Reason (recorded in audit log)</label>
                        <textarea
                          id={`note-${quote.id}`}
                          name="note"
                          className="textarea"
                          style={{ minHeight: "4rem" }}
                          maxLength={500}
                          placeholder="e.g. price total does not match the itemised lines; misleading savings claim; duplicate submission."
                        />
                        <button type="submit" className="btn btn-secondary btn-sm">Confirm withdrawal</button>
                      </form>
                      <p className="mt-2 text-xs text-muted">
                        The installer and customer timeline record the withdrawal. This is not a customer rejection.
                      </p>
                    </details>
                  ) : (
                    <div className="rounded-xl border border-line bg-paper-deep/40 p-4 text-xs text-ink-soft">
                      Withdrawn. Existing quotes are retained for audit and dispute handling.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
