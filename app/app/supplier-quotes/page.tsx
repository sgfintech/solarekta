import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCustomerQuoteRequests } from "@/lib/advisor/quote-reviews";
import { closeSupplierQuoteRequestAction } from "@/app/actions/advisor";
import { PageHeader } from "@/components/page-header";
import { ArrowRight, Check } from "@/components/icons";
import { num, peso, shortDate } from "@/lib/format";

export const metadata = { title: "Supplier quotations" };

const STATUS = {
  sent: { label: "Waiting for supplier", tone: "badge-warn" },
  replied: { label: "Quotation received", tone: "badge-good" },
  declined: { label: "Declined", tone: "badge-bad" },
  closed: { label: "Closed", tone: "badge-neutral" },
} as const;

export default async function SupplierQuotesPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireUser(["customer"]);
  const query = await searchParams;
  const rows = listCustomerQuoteRequests(user.id);
  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Supplier quotations"
        description="Quotation requests you sent to verified suppliers. A quotation is not an order; nothing is charged."
        actions={<Link href="/advisor" className="btn btn-primary">Ask Solar AI <ArrowRight /></Link>}
      />
      {query.sent ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Request sent. We’ll notify you when the supplier replies.</p> : null}
      {rows.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
          <h2 className="text-xl text-forest-deep">No quotation requests yet</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">Check a price with Ask Solar AI, then use “Request supplier quotation” on a listing.</p>
          <Link href="/advisor" className="btn btn-primary mt-5">Ask Solar AI</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{r.product_label} <span className="font-normal text-muted">× {num(r.quantity)}</span></p>
                  <p className="text-sm text-ink-soft">
                    <Link href={`/suppliers/${r.supplier_slug}`} className="text-forest underline">{r.supplier_name}</Link> · deliver to {r.delivery_city} · sent {shortDate(r.created_at)}
                  </p>
                  <p className="mt-1 text-xs text-muted">{r.share_contact ? "You shared your contact details with this supplier." : "Your contact details were not shared."}</p>
                </div>
                <span className={`badge ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </div>
              {r.status === "replied" || r.status === "declined" ? (
                <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">
                  {r.reply_price_php != null ? <p>Quoted total: <strong>{peso(r.reply_price_php)}</strong>{r.reply_valid_until ? `, valid until ${shortDate(r.reply_valid_until)}` : ""}</p> : null}
                  {r.reply_note ? <p className="mt-1 text-ink-soft">“{r.reply_note}”</p> : null}
                </div>
              ) : null}
              {r.status === "sent" || r.status === "replied" ? (
                <form action={closeSupplierQuoteRequestAction} className="mt-3">
                  <input type="hidden" name="requestId" value={r.id} />
                  <button type="submit" className="link-action link-muted text-sm">Close request</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
