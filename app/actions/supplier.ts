"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { saveUpload, UploadError } from "@/lib/files";
import { uniqueSlug } from "@/lib/slug";
import { requestContext } from "@/lib/request";
import { getOrderForSupplier, getPriceRequestForSupplier, getSupplierByUserId, getSupplierProduct, orderItems } from "@/lib/marketplace-data";
import { canTransitionOrder, canTransitionPriceRequest, ORDER_STATUS_LABEL, REVIEWED_PRODUCT_FIELDS } from "@/lib/marketplace";
import {
  field,
  optionalNumber,
  orderUpdateSchema,
  priceResponseSchema,
  productSchema,
  supplierApplicationSchema,
  zodFieldErrors,
  zodMessage,
} from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { ProductRow } from "@/lib/types";

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

function notifyAdmins(title: string, body: string, href: string) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all() as { id: string }[];
  for (const admin of admins) notify(admin.id, "verification", title, body, href);
}

export async function saveSupplierProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const parsed = supplierApplicationSchema.safeParse({
    businessName: field(formData, "businessName"),
    supplierType: field(formData, "supplierType"),
    about: field(formData, "about"),
    phone: field(formData, "phone"),
    deliveryAreas: field(formData, "deliveryAreas"),
    registrationNo: field(formData, "registrationNo"),
    yearsInBusiness: field(formData, "yearsInBusiness"),
    website: field(formData, "website"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const areas = Array.from(new Set(d.deliveryAreas.split(/[,\n]/).map((a) => a.trim()).filter(Boolean))).slice(0, 20);
  if (areas.length === 0) return { error: "List at least one area you deliver to.", fieldErrors: { deliveryAreas: "List at least one area you deliver to." } };

  const existing = getSupplierByUserId(user.id);
  const timestamp = nowIso();
  const current = existing?.verification_status;
  const next = !current || current === "draft" || current === "rejected" ? "pending" : current;

  if (existing) {
    db.prepare(
      `UPDATE suppliers SET business_name=?, supplier_type=?, about=?, website=?, phone=?, delivery_areas_json=?, registration_no=?,
         years_in_business=?, verification_status=?, updated_at=? WHERE id=?`,
    ).run(d.businessName, d.supplierType, d.about, d.website || null, d.phone, JSON.stringify(areas), d.registrationNo || null, d.yearsInBusiness, next, timestamp, existing.id);
    if (next === "pending" && current !== "pending") {
      db.prepare("INSERT INTO supplier_verification_events (id, supplier_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)").run(
        newId(),
        existing.id,
        user.id,
        "Profile resubmitted for review",
        timestamp,
      );
    }
  } else {
    const id = newId();
    const slug = uniqueSlug(d.businessName, (candidate) => Boolean(db.prepare("SELECT 1 FROM suppliers WHERE slug = ?").get(candidate)));
    db.prepare(
      `INSERT INTO suppliers (id, user_id, business_name, slug, supplier_type, about, website, phone, delivery_areas_json, registration_no,
         years_in_business, verification_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(id, user.id, d.businessName, slug, d.supplierType, d.about, d.website || null, d.phone, JSON.stringify(areas), d.registrationNo || null, d.yearsInBusiness, timestamp, timestamp);
    db.prepare("INSERT INTO supplier_verification_events (id, supplier_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)").run(
      newId(),
      id,
      user.id,
      "Supplier application submitted",
      timestamp,
    );
  }
  notifyAdmins("Supplier application to review", `${d.businessName} submitted details for review.`, "/admin/suppliers");
  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: existing ? "supplier.profile_updated" : "supplier.applied", entityType: "supplier", entityId: existing?.id ?? user.id, ip: ctx.ip });
  redirect("/supplier/profile?saved=1");
}

export async function uploadSupplierDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) return { error: "Save your company profile before uploading documents." };
  const kind = field(formData, "kind");
  if (!["business_registration", "mayors_permit", "distributor_certificate", "product_certification", "other"].includes(kind)) {
    return { error: "Choose a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a document to upload." };
  try {
    const saved = await saveUpload(file, user.id, "supplier_document");
    db.prepare("INSERT INTO supplier_documents (id, supplier_id, file_id, kind, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(
      newId(),
      supplier.id,
      saved.id,
      kind,
      nowIso(),
    );
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Upload failed. Try a smaller file." };
  }
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "supplier.document_uploaded", entityType: "supplier", entityId: supplier.id, metadata: { kind } });
  redirect("/supplier/profile?saved=document");
}

function productInput(formData: FormData) {
  return {
    category: field(formData, "category"),
    brand: field(formData, "brand"),
    model: field(formData, "model"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    ratedPowerW: optionalNumber(formData, "ratedPowerW"),
    efficiencyPct: optionalNumber(formData, "efficiencyPct"),
    ratedKw: optionalNumber(formData, "ratedKw"),
    capacityKwh: optionalNumber(formData, "capacityKwh"),
    phase: field(formData, "phase"),
    inverterType: field(formData, "inverterType"),
    chemistry: field(formData, "chemistry"),
    nominalVoltageV: optionalNumber(formData, "nominalVoltageV"),
    capacityAh: optionalNumber(formData, "capacityAh"),
    usableCapacityKwh: optionalNumber(formData, "usableCapacityKwh"),
    dodPercent: optionalNumber(formData, "dodPercent"),
    batteryVoltageV: optionalNumber(formData, "batteryVoltageV"),
    communication: field(formData, "communication"),
    compatibleModels: field(formData, "compatibleModels"),
    priceBasis: field(formData, "priceBasis") || "equipment_only",
    inclusions: field(formData, "inclusions"),
    exclusions: field(formData, "exclusions"),
    warrantyProductYears: optionalNumber(formData, "warrantyProductYears"),
    warrantyPerformanceYears: optionalNumber(formData, "warrantyPerformanceYears"),
    warrantyBacker: field(formData, "warrantyBacker"),
    certifications: field(formData, "certifications"),
    pricePhp: optionalNumber(formData, "pricePhp"),
    unit: field(formData, "unit") || "piece",
    stockStatus: field(formData, "stockStatus") || "in_stock",
    leadTimeDays: optionalNumber(formData, "leadTimeDays"),
  };
}

export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) return { error: "Save your company profile first." };
  const parsed = productSchema.safeParse(productInput(formData));
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const specs: Record<string, unknown> = {};
  if (d.category === "panel") Object.assign(specs, { ratedPowerW: d.ratedPowerW, efficiencyPct: d.efficiencyPct });
  const list = (value: string | undefined) => {
    const items = (value ?? "").split(/[,;\n]/).map((v) => v.trim()).filter(Boolean).slice(0, 30);
    return items.length ? items : undefined;
  };
  if (d.category === "inverter") {
    Object.assign(specs, {
      ratedKw: d.ratedKw,
      phase: d.phase || undefined,
      inverterType: d.inverterType || undefined,
      batteryVoltageV: d.batteryVoltageV,
      communication: list(d.communication),
      compatibleModels: list(d.compatibleModels),
    });
  }
  if (d.category === "battery") {
    Object.assign(specs, {
      capacityKwh: d.capacityKwh,
      chemistry: d.chemistry || undefined,
      nominalVoltageV: d.nominalVoltageV,
      capacityAh: d.capacityAh,
      usableCapacityKwh: d.usableCapacityKwh,
      dodPercent: d.dodPercent,
      communication: list(d.communication),
      compatibleModels: list(d.compatibleModels),
    });
  }
  const specsJson = JSON.stringify(Object.fromEntries(Object.entries(specs).filter(([, v]) => v != null && v !== "")));

  let datasheetId: string | null | undefined;
  const datasheet = formData.get("datasheet");
  if (datasheet instanceof File && datasheet.size > 0) {
    if (datasheet.type !== "application/pdf") return { error: "Upload the datasheet as a PDF.", fieldErrors: { datasheet: "Upload a PDF." } };
    try {
      datasheetId = (await saveUpload(datasheet, user.id, "product_datasheet")).id;
    } catch (error) {
      return { error: error instanceof UploadError ? error.message : "Datasheet upload failed." };
    }
  }

  const values = {
    category: d.category,
    brand: d.brand,
    model: d.model,
    title: d.title,
    description: d.description || null,
    specs_json: specsJson,
    warranty_product_years: d.warrantyProductYears ?? null,
    warranty_performance_years: d.warrantyPerformanceYears ?? null,
    warranty_backer: d.warrantyBacker || null,
    certifications: d.certifications || null,
    price_php: d.pricePhp ?? null,
    unit: d.unit,
    stock_status: d.stockStatus,
    lead_time_days: d.leadTimeDays ?? null,
    price_basis: d.priceBasis,
    inclusions: d.inclusions || null,
    exclusions: d.exclusions || null,
  };
  const timestamp = nowIso();
  const productId = field(formData, "productId");

  if (productId) {
    const existing = getSupplierProduct(productId, supplier.id);
    if (!existing) return { error: "Product not found." };
    const changedReviewed = REVIEWED_PRODUCT_FIELDS.some(
      (key) => String((existing as ProductRow)[key] ?? "") !== String((values as Record<string, unknown>)[key] ?? ""),
    );
    const status =
      existing.status === "archived"
        ? "archived"
        : existing.status === "approved" && !changedReviewed && datasheetId === undefined
          ? "approved"
          : "pending";
    db.prepare(
      `UPDATE products SET category=@category, brand=@brand, model=@model, title=@title, description=@description, specs_json=@specs_json,
         warranty_product_years=@warranty_product_years, warranty_performance_years=@warranty_performance_years,
         warranty_backer=@warranty_backer, certifications=@certifications, price_php=@price_php, unit=@unit,
         stock_status=@stock_status, lead_time_days=@lead_time_days, price_basis=@price_basis, inclusions=@inclusions, exclusions=@exclusions, status=@status,
         datasheet_file_id=COALESCE(@datasheet, datasheet_file_id), updated_at=@updated
       WHERE id=@id AND supplier_id=@supplier`,
    ).run({ ...values, status, datasheet: datasheetId ?? null, updated: timestamp, id: productId, supplier: supplier.id });
    if (status === "pending" && existing.status !== "pending") {
      notifyAdmins("Product to review", `${supplier.business_name} updated ${d.brand} ${d.model}.`, "/admin/products");
    }
    logAudit({ actorUserId: user.id, actorRole: user.role, action: "product.updated", entityType: "product", entityId: productId, metadata: { status } });
    redirect(`/supplier/products?saved=${status === "approved" ? "live" : "review"}`);
  }

  const id = newId();
  db.prepare(
    `INSERT INTO products (id, supplier_id, category, brand, model, title, description, specs_json, warranty_product_years,
       warranty_performance_years, warranty_backer, certifications, datasheet_file_id, price_php, unit, stock_status, lead_time_days,
       price_basis, inclusions, exclusions, status, created_at, updated_at)
     VALUES (@id, @supplier, @category, @brand, @model, @title, @description, @specs_json, @warranty_product_years,
       @warranty_performance_years, @warranty_backer, @certifications, @datasheet, @price_php, @unit, @stock_status, @lead_time_days,
       @price_basis, @inclusions, @exclusions, 'pending', @created, @created)`,
  ).run({ ...values, id, supplier: supplier.id, datasheet: datasheetId ?? null, created: timestamp });
  notifyAdmins("Product to review", `${supplier.business_name} listed ${d.brand} ${d.model}.`, "/admin/products");
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "product.created", entityType: "product", entityId: id });
  redirect("/supplier/products?saved=review");
}

export async function archiveProductAction(formData: FormData) {
  const user = await actionUser(["supplier"]);
  if (!user) redirect("/login");
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) redirect("/supplier/profile");
  const id = field(formData, "productId");
  const restore = field(formData, "restore") === "1";
  db.prepare("UPDATE products SET status = ?, updated_at = ? WHERE id = ? AND supplier_id = ?").run(restore ? "pending" : "archived", nowIso(), id, supplier.id);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: restore ? "product.restored" : "product.archived", entityType: "product", entityId: id });
  redirect("/supplier/products");
}

export async function respondPriceRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const supplier = getSupplierByUserId(user.id);
  if (!supplier || supplier.verification_status !== "verified") return { error: "Only verified suppliers can respond." };
  const parsed = priceResponseSchema.safeParse({
    requestId: field(formData, "requestId"),
    decision: field(formData, "decision"),
    unitPricePhp: optionalNumber(formData, "unitPricePhp"),
    leadTimeDays: optionalNumber(formData, "leadTimeDays"),
    validUntil: field(formData, "validUntil"),
    supplierNote: field(formData, "supplierNote"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const d = parsed.data;
  const request = getPriceRequestForSupplier(d.requestId, supplier.id);
  if (!request) return { error: "Request not found." };
  const to = d.decision === "quote" ? "quoted" : "declined";
  if (!canTransitionPriceRequest(request.status, to, "supplier")) return { error: "This request can no longer be changed." };
  if (to === "quoted" && d.unitPricePhp == null) return { error: "Enter a unit price.", fieldErrors: { unitPricePhp: "Enter a unit price." } };

  const timestamp = nowIso();
  const total = d.unitPricePhp != null ? Math.round(d.unitPricePhp * request.quantity * 100) / 100 : null;
  db.prepare(
    `UPDATE price_requests SET status=?, unit_price_php=?, total_php=?, lead_time_days=?, valid_until=?, supplier_note=?, responded_at=?, updated_at=?
     WHERE id=? AND supplier_id=?`,
  ).run(to, d.unitPricePhp ?? null, total, d.leadTimeDays ?? null, d.validUntil || null, d.supplierNote || null, timestamp, timestamp, request.id, supplier.id);
  const installerUser = db.prepare("SELECT user_id FROM installers WHERE id = ?").get(request.installer_id) as { user_id: string } | undefined;
  if (installerUser) {
    notify(
      installerUser.user_id,
      "price_request",
      to === "quoted" ? "Supplier price received" : "Price request declined",
      `${supplier.business_name} ${to === "quoted" ? "sent a price" : "declined your request"}.`,
      "/installer/price-requests",
    );
  }
  logAudit({ actorUserId: user.id, actorRole: user.role, action: `price_request.${to}`, entityType: "price_request", entityId: request.id });
  redirect(`/supplier/requests?saved=${to}`);
}

export async function supplierOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) return { error: "Supplier profile not found." };
  const parsed = orderUpdateSchema.safeParse({
    orderId: field(formData, "orderId"),
    to: field(formData, "to"),
    deliveryFeePhp: optionalNumber(formData, "deliveryFeePhp"),
    totalPhp: optionalNumber(formData, "totalPhp"),
    etaDate: field(formData, "etaDate"),
    note: field(formData, "note"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const d = parsed.data;
  const order = getOrderForSupplier(d.orderId, supplier.id);
  if (!order) return { error: "Order not found." };
  if (!canTransitionOrder(order.status, d.to, "supplier")) return { error: "That change isn’t allowed at this stage." };

  let total = order.total_php;
  let fee = order.delivery_fee_php;
  if (d.to === "confirmed") {
    fee = d.deliveryFeePhp ?? 0;
    // Items with listed prices total automatically; unpriced items need the supplier's total.
    const items = orderItems(order.id);
    const priced = items.every((i) => i.line_total_php != null);
    if (priced) total = Math.round(((order.subtotal_php ?? 0) + fee) * 100) / 100;
    else if (d.totalPhp != null) total = d.totalPhp;
    else return { error: "Some items have no listed price. Enter the full order total including delivery.", fieldErrors: { totalPhp: "Enter the order total." } };
    if (!d.etaDate) return { error: "Enter an estimated delivery date.", fieldErrors: { etaDate: "Enter a date." } };
  }

  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE orders SET status=?, delivery_fee_php=?, total_php=?, eta_date=COALESCE(?, eta_date), supplier_note=COALESCE(?, supplier_note), updated_at=?
       WHERE id=? AND supplier_id=?`,
    ).run(d.to, fee, total, d.etaDate || null, d.note || null, timestamp, order.id, supplier.id);
    db.prepare(
      "INSERT INTO order_events (id, order_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'supplier', ?, ?, ?, ?)",
    ).run(newId(), order.id, user.id, order.status, d.to, d.note || null, timestamp);
  })();
  notify(order.customer_user_id, "order", `Order update: ${ORDER_STATUS_LABEL[d.to]}`, `${supplier.business_name} updated your equipment order.`, `/app/orders/${order.id}`);
  logAudit({ actorUserId: user.id, actorRole: user.role, action: `order.${d.to}`, entityType: "order", entityId: order.id });
  redirect(`/supplier/orders/${order.id}?saved=1`);
}
