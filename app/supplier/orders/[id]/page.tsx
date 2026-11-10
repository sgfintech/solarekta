import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrderForSupplier, getSupplierByUserId, orderEvents, orderItems } from "@/lib/marketplace-data";
import { INSTALLER_PLAN_LABEL, nextOrderActions, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/marketplace";
import { supplierOrderAction } from "@/app/actions/supplier";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { OrderItemsTable } from "@/components/marketplace/order-summary";
import { Timeline } from "@/components/marketplace/timeline";
import { Check } from "@/components/icons";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Order" };

const ACTION_LABEL = {
  confirmed: "Confirm order",
  declined: "Decline order",
  paid: "Mark payment received",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered",
  cancelled: "Cancel order",
} as const;

export default async function SupplierOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) notFound();
  const { id } = await params;
  const query = await searchParams;
  const order = getOrderForSupplier(id, supplier.id);
  if (!order) notFound();
  const items = orderItems(order.id);
  const events = orderEvents(order.id);
  const installer = order.installer_id ? (db.prepare("SELECT business_name FROM installers WHERE id = ?").get(order.installer_id) as { business_name: string } | undefined) : undefined;
  const actions = nextOrderActions(order.status, "supplier");
  const unpriced = items.some((i) => i.line_total_php == null);

  return (
    <>
      <PageHeader
        eyebrow={`Order · ${shortDate(order.created_at)}`}
        title={`Order for ${order.contact_name}`}
        description={`Deliver to ${order.delivery_city}${order.delivery_province ? `, ${order.delivery_province}` : ""}.`}
        actions={<Link href="/supplier/orders" className="btn btn-ghost btn-sm">All orders</Link>}
      />
      {query.saved ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Order updated. The buyer has been notified.</p> : null}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section className="card card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl text-forest-deep">Items</h2>
              <span className={`badge badge-${ORDER_STATUS_TONE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
            </div>
            <div className="mt-3"><OrderItemsTable order={order} items={items} /></div>
            {order.note ? <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft"><strong className="text-ink">Buyer note:</strong> {order.note}</p> : null}
          </section>
          {actions.length ? (
            <section className="card card-pad">
              <h2 className="text-xl text-forest-deep">Next step</h2>
              <div className="mt-4 space-y-6">
                {actions.includes("confirmed") ? (
                  <ActionForm action={supplierOrderAction} submitLabel={ACTION_LABEL.confirmed} className="space-y-4 rounded-2xl border border-line p-4">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value="confirmed" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div><label htmlFor="deliveryFeePhp" className="label">Delivery fee (₱)</label><input id="deliveryFeePhp" name="deliveryFeePhp" type="number" min={0} step="0.01" className="input" defaultValue={0} /></div>
                      <div><label htmlFor="etaDate" className="label">Estimated delivery date</label><input id="etaDate" name="etaDate" type="date" className="input" required /></div>
                      {unpriced ? (
                        <div className="sm:col-span-2"><label htmlFor="totalPhp" className="label">Full order total incl. delivery (₱)</label><input id="totalPhp" name="totalPhp" type="number" min={0} step="0.01" className="input" required /><p className="help">Some items are “price on request”, so enter the complete total.</p></div>
                      ) : null}
                      <div className="sm:col-span-2"><label htmlFor="note" className="label">Payment instructions and notes for the buyer</label><textarea id="note" name="note" className="textarea" placeholder="Accepted payment methods, official receipt, delivery contact…" /></div>
                    </div>
                  </ActionForm>
                ) : null}
                {actions.filter((a) => a !== "confirmed").map((to) => (
                  <ActionForm key={to} action={supplierOrderAction} submitLabel={ACTION_LABEL[to as keyof typeof ACTION_LABEL]} submitClassName={to === "declined" || to === "cancelled" ? "btn btn-secondary" : "btn btn-primary"} className="space-y-3 rounded-2xl border border-line p-4">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value={to} />
                    <div><label htmlFor={`note-${to}`} className="label">Note to the buyer {to === "declined" || to === "cancelled" ? "" : "(optional)"}</label><input id={`note-${to}`} name="note" className="input" /></div>
                  </ActionForm>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="min-w-0 space-y-5">
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Buyer and delivery</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Contact", order.contact_name],
                ["Phone", order.contact_phone],
                ["Address", order.delivery_address || "Not given yet"],
                ["City", `${order.delivery_city}${order.delivery_province ? `, ${order.delivery_province}` : ""}`],
                ["Installer", installer ? installer.business_name : INSTALLER_PLAN_LABEL[order.installer_plan]],
                ["Estimated delivery", order.eta_date ? shortDate(order.eta_date) : "Not set"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line/60 pb-2 last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium text-ink">{value}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Buyer contact details are shared with you only for this order.</p>
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
