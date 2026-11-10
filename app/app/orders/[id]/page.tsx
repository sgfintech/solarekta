import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrderForCustomer, orderEvents, orderItems } from "@/lib/marketplace-data";
import { INSTALLER_PLAN_LABEL, nextOrderActions, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/marketplace";
import { customerOrderAction } from "@/app/actions/marketplace";
import { PageHeader } from "@/components/page-header";
import { OrderItemsTable } from "@/components/marketplace/order-summary";
import { Timeline } from "@/components/marketplace/timeline";
import { DemoBadge } from "@/components/marketplace/product-card";
import { Alert, Check } from "@/components/icons";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Equipment order" };

const NEXT_STEP: Record<string, string> = {
  requested: "The supplier will check stock and reply with a total and delivery date. Don’t pay anything yet.",
  confirmed: "The supplier confirmed your order. Arrange payment with them directly using their instructions, and ask for an official receipt.",
  paid: "Payment recorded by the supplier. They will ship next.",
  shipped: "Your order is on the way. Confirm delivery here when it arrives.",
  delivered: "Delivered. Your installer can now schedule the installation.",
  cancelled: "This order was cancelled.",
  declined: "The supplier could not fulfil this order.",
};

export default async function CustomerOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; error?: string }> }) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const query = await searchParams;
  const order = getOrderForCustomer(id, user.id);
  if (!order) notFound();
  const supplier = db.prepare("SELECT business_name, slug, phone, is_demo FROM suppliers WHERE id = ?").get(order.supplier_id) as { business_name: string; slug: string; phone: string | null; is_demo: number };
  const installer = order.installer_id ? (db.prepare("SELECT business_name FROM installers WHERE id = ?").get(order.installer_id) as { business_name: string } | undefined) : undefined;
  const items = orderItems(order.id);
  const events = orderEvents(order.id);
  const actions = nextOrderActions(order.status, "customer");

  return (
    <>
      <PageHeader
        eyebrow={`Order · ${shortDate(order.created_at)}`}
        title={supplier.business_name}
        description={`Deliver to ${order.delivery_city}${order.delivery_province ? `, ${order.delivery_province}` : ""}.`}
        actions={<Link href="/app/orders" className="btn btn-ghost btn-sm">All orders</Link>}
      />
      {query.placed && order.status === "requested" ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Order request sent. We’ll notify you when the supplier replies.</p> : null}
      {query.error ? <p role="alert" className="alert-error mb-5">That change isn’t possible at this stage.</p> : null}
      {supplier.is_demo ? <p className="mb-5 flex items-center gap-2 text-sm text-muted"><DemoBadge /> This is a demonstration supplier; the order will not be fulfilled.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section className={`rounded-[1.5rem] p-5 sm:p-6 ${order.status === "confirmed" ? "border border-[#f5d68a] bg-sun-soft" : "border border-line bg-white"}`}>
            <span className={`badge badge-${ORDER_STATUS_TONE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
            <p className="mt-2 text-sm text-ink">{NEXT_STEP[order.status]}</p>
            {order.supplier_note ? <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink-soft"><strong className="text-ink">From the supplier:</strong> {order.supplier_note}</p> : null}
            {order.eta_date ? <p className="mt-2 text-sm text-ink-soft">Estimated delivery: <strong className="text-ink">{shortDate(order.eta_date)}</strong></p> : null}
            {actions.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map((to) => (
                  <form key={to} action={customerOrderAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value={to} />
                    <button type="submit" className={to === "delivered" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>{to === "delivered" ? "Confirm delivery" : "Cancel order"}</button>
                  </form>
                ))}
              </div>
            ) : null}
          </section>
          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Items</h2>
            <div className="mt-3"><OrderItemsTable order={order} items={items} /></div>
          </section>
          <p className="flex items-start gap-2 text-xs text-muted"><Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> SOLARekta does not process payments or guarantee products. Pay only after the supplier confirms, and keep your official receipt and warranty documents.</p>
        </div>
        <aside className="min-w-0 space-y-5">
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Supplier", supplier.business_name],
                ["Supplier phone", order.status !== "requested" && supplier.phone ? supplier.phone : "Shown after confirmation"],
                ["Installer", installer ? installer.business_name : INSTALLER_PLAN_LABEL[order.installer_plan]],
                ["Contact", `${order.contact_name}, ${order.contact_phone}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line/60 pb-2 last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium text-ink">{value}</dd></div>
              ))}
            </dl>
            <Link href={`/suppliers/${supplier.slug}`} className="link-action mt-3 text-sm">Supplier storefront</Link>
          </div>
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Timeline</h2>
            <div className="mt-4"><Timeline events={events} label={(s) => ORDER_STATUS_LABEL[s as keyof typeof ORDER_STATUS_LABEL] ?? s} /></div>
          </div>
        </aside>
      </div>
    </>
  );
}
