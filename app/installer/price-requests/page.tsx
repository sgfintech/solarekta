import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { PRICE_REQUEST_LABEL } from "@/lib/marketplace";
import { installerPriceRequestAction } from "@/app/actions/marketplace";
import { PageHeader } from "@/components/page-header";
import { Check } from "@/components/icons";
import { num, peso, shortDate, statusTone } from "@/lib/format";
import type { PriceRequestRow } from "@/lib/types";

export const metadata = { title: "Price requests" };

export default async function InstallerPriceRequestsPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);
  const query = await searchParams;
  const rows = installer
    ? (db.prepare(
        `SELECT r.*, s.business_name AS supplier_name, s.phone AS supplier_phone, p.brand, p.model FROM price_requests r
         JOIN suppliers s ON s.id = r.supplier_id LEFT JOIN products p ON p.id = r.product_id
         WHERE r.installer_id = ? ORDER BY r.updated_at DESC`,
      ).all(installer.id) as (PriceRequestRow & { supplier_name: string; supplier_phone: string | null; brand: string | null; model: string | null })[])
    : [];
  return (
    <>
      <PageHeader eyebrow="Sourcing" title="Price requests" description="Private trade prices from suppliers. Accept one to signal you want to order; then arrange the purchase with the supplier." actions={<Link href="/installer/equipment" className="btn btn-primary btn-sm">Browse catalogue</Link>} />
      {query.sent ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Request sent. You’ll be notified when the supplier replies.</p> : null}
      {query.error ? <p role="alert" className="alert-error mb-5">That change isn’t possible any more.</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No price requests yet. Open a product in the catalogue to ask a supplier for trade pricing.</p>
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <thead><tr><th>Product</th><th>Supplier</th><th className="text-right">Qty</th><th>Status</th><th className="text-right">Price</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><p className="font-medium text-ink">{r.brand} {r.model}</p><p className="text-xs text-muted">{shortDate(r.created_at)}</p></td>
                  <td className="text-sm">{r.supplier_name}{r.status === "accepted" && r.supplier_phone ? <span className="block text-xs text-muted">{r.supplier_phone}</span> : null}</td>
                  <td className="table-num text-right">{num(r.quantity)}</td>
                  <td><span className={`badge badge-${statusTone(r.status === "quoted" ? "submitted" : r.status)}`}>{PRICE_REQUEST_LABEL[r.status]}</span></td>
                  <td className="table-num text-right">
                    {r.unit_price_php != null ? <><span className="font-semibold text-ink">{peso(r.unit_price_php)}</span> each<span className="block text-xs text-muted">{peso(r.total_php ?? 0)} total{r.lead_time_days != null ? ` · ${r.lead_time_days}d` : ""}{r.valid_until ? ` · until ${shortDate(r.valid_until)}` : ""}</span></> : "—"}
                    {r.supplier_note ? <span className="block text-xs text-ink-soft">“{r.supplier_note}”</span> : null}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {r.status === "quoted" ? (
                      <form action={installerPriceRequestAction} className="inline"><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="to" value="accepted" /><button className="link-action mr-3 text-sm">Accept</button></form>
                    ) : null}
                    {r.status === "open" || r.status === "quoted" ? (
                      <form action={installerPriceRequestAction} className="inline"><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="to" value="withdrawn" /><button className="link-action link-muted text-sm">Withdraw</button></form>
                    ) : null}
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
