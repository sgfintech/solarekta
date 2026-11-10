import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { ArrowRight, Check } from "@/components/icons";
import { peso, shortDate } from "@/lib/format";
import type { OrderRow } from "@/lib/types";

export const metadata = { title: "Supplier overview" };

export default async function SupplierHome() {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);

  if (!supplier) {
    return (
      <>
        <PageHeader eyebrow="Welcome" title="Set up your supplier account" description="Three steps before buyers and installers can see your products." />
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ["Company profile", "Who you are, what you supply and where you deliver."],
            ["Documents", "Business registration, permits and distributor certificates for review."],
            ["Products", "List panels, inverters and batteries. Each listing is reviewed before it goes live."],
          ].map(([title, body], index) => (
            <li key={title} className={`rounded-2xl border p-4 ${index === 0 ? "border-forest bg-white shadow-soft" : "border-line bg-paper/60"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${index === 0 ? "bg-sun text-forest-deep" : "bg-line text-ink-soft"}`}>{index + 1}</span>
              <p className="mt-3 font-semibold text-ink">{title}</p>
              <p className="mt-1 text-xs text-muted">{body}</p>
              {index === 0 ? <Link href="/supplier/profile" className="btn btn-primary btn-sm mt-3">Start <ArrowRight /></Link> : null}
            </li>
          ))}
        </ol>
      </>
    );
  }

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE supplier_id = @id AND status = 'approved') AS live,
         (SELECT COUNT(*) FROM products WHERE supplier_id = @id AND status = 'pending') AS pending,
         (SELECT COUNT(*) FROM products WHERE supplier_id = @id AND status = 'rejected') AS rejected,
         (SELECT COUNT(*) FROM orders WHERE supplier_id = @id AND status = 'requested') AS new_orders,
         (SELECT COUNT(*) FROM orders WHERE supplier_id = @id AND status IN ('confirmed','paid','shipped')) AS active_orders,
         (SELECT COUNT(*) FROM price_requests WHERE supplier_id = @id AND status = 'open') AS open_requests`,
    )
    .get({ id: supplier.id }) as Record<string, number>;
  const orders = db.prepare("SELECT * FROM orders WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 5").all(supplier.id) as OrderRow[];
  const verified = supplier.verification_status === "verified";

  return (
    <>
      <PageHeader
        eyebrow="Supplier overview"
        title={supplier.business_name}
        description="Buyers order directly from your listings. Installers ask you for trade pricing. You confirm every order before payment."
        actions={<Link href="/supplier/products/new" className="btn btn-primary">List a product <ArrowRight /></Link>}
      />
      {!verified ? (
        <div className="mb-6 rounded-2xl border border-[#f5d68a] bg-sun-soft px-4 py-3 text-sm text-[#6b4708]">
          Your company is <strong>{supplier.verification_status}</strong>. You can prepare listings now; they appear publicly once your company and each
          product are approved. <Link href="/supplier/profile" className="font-semibold underline">Check your profile and documents</Link>.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Live products", value: counts.live, sub: `${counts.pending} in review, ${counts.rejected} need changes`, href: "/supplier/products" },
          { label: "New order requests", value: counts.new_orders, sub: "waiting for your confirmation", href: "/supplier/orders" },
          { label: "Orders in progress", value: counts.active_orders, sub: "confirmed, paid or shipped", href: "/supplier/orders" },
          { label: "Installer price requests", value: counts.open_requests, sub: "waiting for your price", href: "/supplier/requests" },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href} className="card card-link px-5 py-4 no-underline">
            <p className="text-xs font-semibold text-muted">{stat.label}</p>
            <p className="mt-1.5 font-display text-[1.6rem] font-bold leading-none tracking-tight text-forest-deep">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.sub}</p>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl text-forest-deep">Latest orders</h2>
          <Link href="/supplier/orders" className="link-action text-sm">View all</Link>
        </div>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-6 text-sm text-ink-soft">
            No orders yet. Orders appear here when buyers request your approved products.
          </p>
        ) : (
          <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="table">
              <thead><tr><th>Received</th><th>Deliver to</th><th>Status</th><th className="text-right">Total</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{shortDate(order.created_at)}</td>
                    <td>{order.delivery_city}</td>
                    <td><span className={`badge badge-${ORDER_STATUS_TONE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span></td>
                    <td className="table-num text-right">{order.total_php != null ? peso(order.total_php) : order.subtotal_php != null ? `${peso(order.subtotal_php)} + delivery` : "To quote"}</td>
                    <td className="text-right"><Link href={`/supplier/orders/${order.id}`} className="link-action text-sm">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-6 flex items-start gap-2 text-xs text-muted">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> SOLARekta does not process payments. Buyers pay you directly after you confirm an order.
      </p>
    </>
  );
}
