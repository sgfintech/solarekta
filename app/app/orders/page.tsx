import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { ArrowRight } from "@/components/icons";
import { peso, shortDate } from "@/lib/format";
import type { OrderRow } from "@/lib/types";

export const metadata = { title: "Equipment orders" };

export default async function CustomerOrdersPage() {
  const user = await requireUser(["customer"]);
  const orders = db
    .prepare(
      `SELECT o.*, s.business_name AS supplier_name, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o JOIN suppliers s ON s.id = o.supplier_id WHERE o.customer_user_id = ? ORDER BY o.created_at DESC`,
    )
    .all(user.id) as (OrderRow & { supplier_name: string; item_count: number })[];
  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Equipment orders"
        description="Order requests you sent to verified suppliers. Suppliers confirm the total before you pay them directly."
        actions={<Link href="/equipment" className="btn btn-primary">Browse equipment <ArrowRight /></Link>}
      />
      {orders.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
          <h2 className="text-xl text-forest-deep">No equipment orders yet</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">Most people get installer quotes first; installers usually supply the equipment. You can also order directly from a verified supplier if your installer agrees.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/equipment" className="btn btn-primary">Browse equipment</Link>
            <Link href="/app/quotes" className="btn btn-secondary">My quote requests</Link>
          </div>
        </div>
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <thead><tr><th>Supplier</th><th>Requested</th><th>Items</th><th>Status</th><th className="text-right">Total</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium text-ink">{o.supplier_name}</td>
                  <td>{shortDate(o.created_at)}</td>
                  <td>{o.item_count}</td>
                  <td><span className={`badge badge-${ORDER_STATUS_TONE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                  <td className="table-num text-right">{o.total_php != null ? peso(o.total_php) : "Waiting for supplier"}</td>
                  <td className="text-right"><Link href={`/app/orders/${o.id}`} className="link-action text-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
