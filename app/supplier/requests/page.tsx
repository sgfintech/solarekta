import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { PRICE_REQUEST_LABEL } from "@/lib/marketplace";
import { respondPriceRequestAction } from "@/app/actions/supplier";
import { replySupplierQuoteRequestAction } from "@/app/actions/advisor";
import { listSupplierQuoteRequests } from "@/lib/advisor/quote-reviews";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { Check } from "@/components/icons";
import { num, peso, shortDate, statusTone } from "@/lib/format";
import type { PriceRequestRow } from "@/lib/types";

export const metadata = { title: "Price and quotation requests" };

export default async function SupplierRequestsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  const query = await searchParams;
  const rows = supplier
    ? (db.prepare(
        `SELECT r.*, i.business_name AS installer_name, i.phone AS installer_phone, p.brand, p.model, p.title
         FROM price_requests r JOIN installers i ON i.id = r.installer_id LEFT JOIN products p ON p.id = r.product_id
         WHERE r.supplier_id = ? ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'quoted' THEN 1 ELSE 2 END, r.created_at DESC`,
      ).all(supplier.id) as (PriceRequestRow & { installer_name: string; installer_phone: string | null; brand: string | null; model: string | null; title: string | null })[])
    : [];
  const verified = supplier?.verification_status === "verified";
  const buyerRequests = supplier ? listSupplierQuoteRequests(supplier.id) : [];

  return (
    <>
      <PageHeader eyebrow="Trade pricing" title="Installer price requests" description="Verified installers ask for trade prices. Your reply is visible only to that installer, never to buyers." />
      {query.saved ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> {query.saved === "quoted" ? "Price sent to the installer." : query.saved === "buyer" ? "Reply sent to the buyer." : "Request declined."}</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No price requests yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{r.brand} {r.model} <span className="font-normal text-muted">× {num(r.quantity)}</span></p>
                  <p className="text-sm text-ink-soft">{r.installer_name}{r.installer_phone ? ` · ${r.installer_phone}` : ""} · {shortDate(r.created_at)}</p>
                  {r.message ? <p className="mt-2 text-sm text-ink-soft">“{r.message}”</p> : null}
                </div>
                <span className={`badge badge-${statusTone(r.status === "quoted" ? "submitted" : r.status)}`}>{PRICE_REQUEST_LABEL[r.status]}</span>
              </div>
              {r.unit_price_php != null ? (
                <p className="mt-3 text-sm text-ink">Your price: <strong>{peso(r.unit_price_php)}</strong> each, {peso(r.total_php ?? 0)} total{r.lead_time_days != null ? `, ${r.lead_time_days} days lead time` : ""}{r.valid_until ? `, valid until ${shortDate(r.valid_until)}` : ""}.</p>
              ) : null}
              {verified && (r.status === "open" || r.status === "quoted") ? (
                <details className="accordion mt-3 rounded-xl border border-line px-4">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold text-forest">{r.status === "open" ? "Respond" : "Revise price"}<span className="accordion-icon" aria-hidden="true">+</span></summary>
                  <div className="pb-4">
                    <ActionForm action={respondPriceRequestAction} submitLabel="Send price" submitName="decision" submitValue="quote" className="space-y-3">
                      <input type="hidden" name="requestId" value={r.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div><label htmlFor={`u-${r.id}`} className="label">Unit price (₱)</label><input id={`u-${r.id}`} name="unitPricePhp" type="number" min={0} step="0.01" className="input" defaultValue={r.unit_price_php ?? ""} required /></div>
                        <div><label htmlFor={`l-${r.id}`} className="label">Lead time (days)</label><input id={`l-${r.id}`} name="leadTimeDays" type="number" min={0} className="input" defaultValue={r.lead_time_days ?? ""} /></div>
                        <div><label htmlFor={`v-${r.id}`} className="label">Valid until</label><input id={`v-${r.id}`} name="validUntil" type="date" className="input" defaultValue={r.valid_until ?? ""} /></div>
                      </div>
                      <div><label htmlFor={`n-${r.id}`} className="label">Note</label><input id={`n-${r.id}`} name="supplierNote" className="input" defaultValue={r.supplier_note ?? ""} placeholder="Minimum order, pickup or delivery terms…" /></div>
                    </ActionForm>
                    {r.status === "open" ? (
                      <ActionForm action={respondPriceRequestAction} submitLabel="Decline request" submitName="decision" submitValue="decline" submitClassName="btn btn-ghost btn-sm" className="mt-2">
                        <input type="hidden" name="requestId" value={r.id} />
                      </ActionForm>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {!verified && supplier ? <p className="mt-4 text-xs text-muted">You can respond once your company is verified.</p> : null}

      <section id="buyer-requests" className="mt-10">
        <h2 className="text-xl font-semibold text-forest-deep">Buyer quotation requests</h2>
        <p className="mt-1 text-sm text-ink-soft">Homeowners and businesses asking for a quotation. Contact details appear only when the buyer chose to share them; otherwise reply here.</p>
        {buyerRequests.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No buyer requests yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {buyerRequests.map((r) => (
              <article key={r.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{r.product_label} <span className="font-normal text-muted">× {num(r.quantity)}</span></p>
                    <p className="text-sm text-ink-soft">Deliver to {r.delivery_city} · {shortDate(r.created_at)}</p>
                    <p className="text-sm text-ink-soft">{r.share_contact ? `${r.contact_name} · ${r.contact_phone} · ${r.contact_email}` : r.customer_name}</p>
                    {r.details ? <p className="mt-2 text-sm text-ink-soft">“{r.details}”</p> : null}
                  </div>
                  <span className={`badge badge-${r.status === "sent" ? "warn" : r.status === "replied" ? "good" : "neutral"}`}>{{ sent: "New", replied: "Replied", declined: "Declined", closed: "Closed by buyer" }[r.status]}</span>
                </div>
                {r.reply_price_php != null ? <p className="mt-3 text-sm">Your quotation: <strong>{peso(r.reply_price_php)}</strong>{r.reply_valid_until ? `, valid until ${shortDate(r.reply_valid_until)}` : ""}</p> : null}
                {verified && (r.status === "sent" || r.status === "replied") ? (
                  <details className="accordion mt-3 rounded-xl border border-line px-4">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold text-forest">{r.status === "sent" ? "Reply" : "Revise quotation"}<span className="accordion-icon" aria-hidden="true">+</span></summary>
                    <div className="pb-4">
                      <ActionForm action={replySupplierQuoteRequestAction} submitLabel="Send quotation" submitName="decision" submitValue="reply" className="space-y-3">
                        <input type="hidden" name="requestId" value={r.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label htmlFor={`rp-${r.id}`} className="label">Quoted total incl. delivery (₱)</label><input id={`rp-${r.id}`} name="replyPricePhp" type="number" min={0} step="0.01" className="input" defaultValue={r.reply_price_php ?? ""} /></div>
                          <div><label htmlFor={`rv-${r.id}`} className="label">Valid until</label><input id={`rv-${r.id}`} name="replyValidUntil" type="date" className="input" defaultValue={r.reply_valid_until ?? ""} /></div>
                        </div>
                        <div><label htmlFor={`rn-${r.id}`} className="label">Note (inclusions, lead time, payment terms)</label><input id={`rn-${r.id}`} name="replyNote" className="input" defaultValue={r.reply_note ?? ""} /></div>
                      </ActionForm>
                      {r.status === "sent" ? (
                        <ActionForm action={replySupplierQuoteRequestAction} submitLabel="Decline" submitName="decision" submitValue="decline" submitClassName="btn btn-ghost btn-sm" className="mt-3 space-y-2">
                          <input type="hidden" name="requestId" value={r.id} />
                          <div><label htmlFor={`dn-${r.id}`} className="label">Reason for declining</label><input id={`dn-${r.id}`} name="replyNote" className="input" placeholder="e.g. Out of stock until next month" /></div>
                        </ActionForm>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
