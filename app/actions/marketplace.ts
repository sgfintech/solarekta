"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getInstallerByUserId } from "@/lib/data";
import { getOrderForCustomer, getPriceRequestForInstaller, getPublicProduct } from "@/lib/marketplace-data";
import { canTransitionOrder, canTransitionPriceRequest, ORDER_STATUS_LABEL, orderSubtotal } from "@/lib/marketplace";
import { field, orderSchema, priceRequestSchema, zodFieldErrors, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { ProductRow, SupplierRow } from "@/lib/types";

function notify(userId: string, kind: string, title: string, body: string, href: string) {
  db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(),
    userId,
    kind,
    title,
    body,
    href,
    nowIso(),
  );
}

/** Buyer places an order request with one verified supplier. No payment is taken. */
export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Log in with a homeowner or business account to order." };
  if (!rateLimit(`order:${user.id}`, 10, 60 * 60 * 1000).ok) return { error: "Too many orders in a short time. Please try again later." };

  const productIds = formData.getAll("productId").map(String);
  const items = productIds
    .map((productId) => ({ productId, quantity: Number(formData.get(`qty_${productId}`) || 0) }))
    .filter((item) => item.quantity > 0);

  const parsed = orderSchema.safeParse({
    supplierId: field(formData, "supplierId"),
    items,
    deliveryCity: field(formData, "deliveryCity"),
    deliveryProvince: field(formData, "deliveryProvince"),
    deliveryAddress: field(formData, "deliveryAddress"),
    contactName: field(formData, "contactName"),
    contactPhone: field(formData, "contactPhone"),
    installerPlan: field(formData, "installerPlan"),
    installerId: field(formData, "installerId"),
    note: field(formData, "note"),
    acknowledge: formData.get("acknowledge") === "on" ? "on" : undefined,
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND verification_status = 'verified'").get(d.supplierId) as SupplierRow | undefined;
  if (!supplier) return { error: "This supplier is not available." };

  // Every item must be a currently approved product of this same supplier.
  const products: ProductRow[] = [];
  for (const item of d.items) {
    const product = getPublicProduct(item.productId);
    if (!product || product.supplier_id !== supplier.id) return { error: "One of the items is no longer available. Refresh and try again." };
    if (product.stock_status === "out_of_stock") return { error: `${product.brand} ${product.model} is out of stock.` };
    products.push(product);
  }

  let installerId: string | null = null;
  if (d.installerPlan === "platform_installer") {
    const installer = db.prepare("SELECT id FROM installers WHERE id = ? AND verification_status = 'verified'").get(d.installerId) as { id: string } | undefined;
    if (!installer) return { error: "Choose a verified installer.", fieldErrors: { installerId: "Choose a verified installer." } };
    installerId = installer.id;
  }

  const lines = d.items.map((item, index) => {
    const product = products[index];
    return {
      product,
      quantity: item.quantity,
      unit: product.price_php,
      total: product.price_php == null ? null : Math.round(product.price_php * item.quantity * 100) / 100,
    };
  });
  const subtotal = orderSubtotal(lines.map((l) => ({ unitPricePhp: l.unit, quantity: l.quantity })));
  const id = newId();
  const timestamp = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, customer_user_id, supplier_id, status, delivery_city, delivery_province, delivery_address, contact_name,
         contact_phone, installer_plan, installer_id, note, subtotal_php, created_at, updated_at)
       VALUES (?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, user.id, supplier.id, d.deliveryCity, d.deliveryProvince || null, d.deliveryAddress || null, d.contactName, d.contactPhone, d.installerPlan, installerId, d.note || null, subtotal, timestamp, timestamp);
    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, title, brand, model, quantity, unit_price_php, line_total_php) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const line of lines) {
      insertItem.run(newId(), id, line.product.id, line.product.title, line.product.brand, line.product.model, line.quantity, line.unit, line.total);
    }
    db.prepare(
      "INSERT INTO order_events (id, order_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'customer', NULL, 'requested', ?, ?)",
    ).run(newId(), id, user.id, `Order request sent to ${supplier.business_name}`, timestamp);
  })();

  notify(supplier.user_id, "order", "New equipment order request", `A buyer in ${d.deliveryCity} requested ${lines.length} item${lines.length === 1 ? "" : "s"}.`, `/supplier/orders/${id}`);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "order.requested", entityType: "order", entityId: id, metadata: { items: lines.length } });
  redirect(`/app/orders/${id}?placed=1`);
}

export async function customerOrderAction(formData: FormData) {
  const user = await actionUser(["customer"]);
  if (!user) redirect("/login");
  const order = getOrderForCustomer(field(formData, "orderId"), user.id);
  if (!order) redirect("/app/orders");
  const to = field(formData, "to");
  if ((to !== "cancelled" && to !== "delivered") || !canTransitionOrder(order.status, to, "customer")) {
    redirect(`/app/orders/${order.id}?error=state`);
  }
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND customer_user_id = ?").run(to, timestamp, order.id, user.id);
    db.prepare(
      "INSERT INTO order_events (id, order_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?)",
    ).run(newId(), order.id, user.id, order.status, to, to === "cancelled" ? "Cancelled by buyer" : "Delivery confirmed by buyer", timestamp);
  })();
  const supplierUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(order.supplier_id) as { user_id: string } | undefined;
  if (supplierUser) notify(supplierUser.user_id, "order", `Order ${ORDER_STATUS_LABEL[to as "cancelled"].toLowerCase()}`, "The buyer updated an order.", `/supplier/orders/${order.id}`);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: `order.${to}`, entityType: "order", entityId: order.id });
  redirect(`/app/orders/${order.id}`);
}

/** Verified installer asks a supplier for private trade pricing. Never visible to buyers. */
export async function createPriceRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["installer"]);
  if (!user) return { error: "Please log in as an installer." };
  const installer = getInstallerByUserId(user.id);
  if (!installer || installer.verification_status !== "verified") return { error: "Price requests open once your installer account is verified." };
  if (!rateLimit(`pricereq:${user.id}`, 30, 60 * 60 * 1000).ok) return { error: "Too many requests. Please try again later." };
  const parsed = priceRequestSchema.safeParse({
    productId: field(formData, "productId"),
    quantity: field(formData, "quantity"),
    quoteRequestId: field(formData, "quoteRequestId"),
    message: field(formData, "message"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const product = getPublicProduct(d.productId);
  if (!product) return { error: "This product is not available." };
  if (d.quoteRequestId) {
    const invited = db.prepare("SELECT 1 FROM quote_invites WHERE quote_request_id = ? AND installer_id = ?").get(d.quoteRequestId, installer.id);
    if (!invited) return { error: "That lead is not one of yours." };
  }
  const open = db
    .prepare("SELECT 1 FROM price_requests WHERE installer_id = ? AND product_id = ? AND status IN ('open','quoted')")
    .get(installer.id, product.id);
  if (open) return { error: "You already have an active price request for this product." };

  const id = newId();
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO price_requests (id, installer_id, supplier_id, product_id, quote_request_id, quantity, message, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(id, installer.id, product.supplier_id, product.id, d.quoteRequestId || null, d.quantity, d.message || null, timestamp, timestamp);
  const supplierUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(product.supplier_id) as { user_id: string };
  notify(supplierUser.user_id, "price_request", "New installer price request", `${installer.business_name} asked for pricing on ${product.brand} ${product.model}.`, "/supplier/requests");
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "price_request.created", entityType: "price_request", entityId: id });
  redirect("/installer/price-requests?sent=1");
}

export async function installerPriceRequestAction(formData: FormData) {
  const user = await actionUser(["installer"]);
  if (!user) redirect("/login");
  const installer = getInstallerByUserId(user.id);
  if (!installer) redirect("/installer");
  const request = getPriceRequestForInstaller(field(formData, "requestId"), installer.id);
  if (!request) redirect("/installer/price-requests");
  const to = field(formData, "to");
  if ((to !== "accepted" && to !== "withdrawn") || !canTransitionPriceRequest(request.status, to, "installer")) {
    redirect("/installer/price-requests?error=state");
  }
  db.prepare("UPDATE price_requests SET status = ?, updated_at = ? WHERE id = ? AND installer_id = ?").run(to, nowIso(), request.id, installer.id);
  const supplierUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(request.supplier_id) as { user_id: string } | undefined;
  if (supplierUser) notify(supplierUser.user_id, "price_request", to === "accepted" ? "Installer accepted your price" : "Price request withdrawn", `${installer.business_name} ${to === "accepted" ? "accepted your price. Contact them to arrange the order." : "withdrew a request."}`, "/supplier/requests");
  logAudit({ actorUserId: user.id, actorRole: user.role, action: `price_request.${to}`, entityType: "price_request", entityId: request.id });
  redirect("/installer/price-requests");
}
