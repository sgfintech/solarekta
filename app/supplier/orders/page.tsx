import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { peso, shortDate } from "@/lib/format";
import type { OrderRow } from "@/lib/types";

export const metadata = { title: "Buyer orders" };

export default async function SupplierOrdersPage() {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  const orders = supplier
    ? (db.prepare(
        `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count FROM orders o WHERE o.supplier_id = ?
         ORDER BY CASE o.status WHEN 'requested' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'paid' THEN 2 WHEN 'shipped' THEN 3 ELSE 4 END, o.created_at DESC`,
      ).all(supplier.id) as (OrderRow & { item_count: number })[])
    : [];
  return (
    <>
      <PageHeader eyebrow="Orders" title="Buyer orders" description="Confirm the total and delivery date, then the buyer arranges payment with you directly." />
      {orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No orders yet. They appear here when buyers request your approved products.</p>
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <thead><tr><th>Received</th><th>Items</th><th>Deliver to</th><th>Installer plan</th><th>Status</th><th className="text-right">Total</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{shortDate(o.created_at)}</td>
                  <td>{o.item_count}</td>
                  <td>{o.delivery_city}</td>
                  <td className="text-sm">{o.installer_plan === "platform_installer" ? "SOLARekta installer" : o.installer_plan === "own_installer" ? "Own installer" : "Undecided"}</td>
                  <td><span className={`badge badge-${ORDER_STATUS_TONE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                  <td className="table-num text-right">{o.total_php != null ? peso(o.total_php) : o.subtotal_php != null ? `${peso(o.subtotal_php)} + delivery` : "To quote"}</td>
                  <td className="text-right"><Link href={`/supplier/orders/${o.id}`} className="link-action text-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
