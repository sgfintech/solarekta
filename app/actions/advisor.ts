"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser, getSessionUser } from "@/lib/auth";
import { newId, nowIso, randomToken, sha256 } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { deleteFile, saveUpload, UploadError } from "@/lib/files";
import { aiExtractQuotation } from "@/lib/advisor/ai";
import { emptyQuote, quoteDataSchema } from "@/lib/advisor/quote";
import { askAdvisor, dailyQuestionLimit, deleteThread, questionsToday, type Owner } from "@/lib/advisor/service";
import { getQuoteReview } from "@/lib/advisor/quote-reviews";
import { getPublicProduct } from "@/lib/marketplace-data";
import { advisorQuestionSchema, field, supplierQuoteReplySchema, supplierQuoteRequestSchema, zodFieldErrors, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { AdvisorAnswer } from "@/lib/advisor/view";
import type { SupplierQuoteRequestRow, SupplierRow } from "@/lib/types";

const GUEST_COOKIE = "solarekta_advisor";

/** The current owner: signed-in user, or a guest identified by an httpOnly cookie. */
async function currentOwner(create: boolean): Promise<Owner> {
  const user = await getSessionUser();
  if (user) return { userId: user.id, guestKey: null };
  const store = await cookies();
  let token = store.get(GUEST_COOKIE)?.value;
  if (!token && create) {
    token = randomToken(24);
    store.set(GUEST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  }
  return { userId: null, guestKey: token ? sha256(token) : null };
}

function notify(userId: string, kind: string, title: string, body: string, href: string) {
  db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(newId(), userId, kind, title, body, href, nowIso());
}

export type AskResult = { ok: true; answer: AdvisorAnswer } | { ok: false; error: string };

/** Ask the Solar Price Advisor a question. Validated, rate-limited and quota-limited. */
export async function askAdvisorAction(input: { question: string; threadId?: string | null; productId?: string | null; quoteReviewId?: string | null }): Promise<AskResult> {
  const parsed = advisorQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  const { ip } = await requestContext();
  if (!rateLimit(`advisor:ip:${ip}`, 12, 60_000).ok) return { ok: false, error: "Too many questions in a minute. Please wait a moment and try again." };
  const owner = await currentOwner(true);
  if (questionsToday(owner) >= dailyQuestionLimit(owner)) {
    return { ok: false, error: owner.userId ? "You have reached today’s question limit. Please try again tomorrow." : "You have reached today’s limit for guests. Log in or create a free account to ask more." };
  }
  try {
    const answer = await askAdvisor(owner, parsed.data);
    return { ok: true, answer };
  } catch (error) {
    console.error("advisor.ask failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Something went wrong while checking prices. Please try again." };
  }
}

export async function clearAdvisorThreadAction(threadId: string): Promise<{ ok: boolean }> {
  const owner = await currentOwner(false);
  return { ok: typeof threadId === "string" && deleteThread(threadId, owner) };
}

/* ----------------------------------------------------------------------------
 * Quotation review (private to the uploader)
 * ------------------------------------------------------------------------- */

export async function uploadQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer", "installer"]);
  if (!user) return { error: "Log in to review a quotation. Quotations stay private to your account." };
  if (!rateLimit(`quote-upload:${user.id}`, 10, 60 * 60_000).ok) return { error: "Too many uploads in a short time. Please try again later." };
  const file = formData.get("quotation");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or photo of the quotation.", fieldErrors: { quotation: "Choose a file." } };

  let stored;
  try {
    stored = await saveUpload(file, user.id, "quote_review");
  } catch (error) {
    return { error: error instanceof UploadError ? error.message.replace("bill files", "files") : "Upload failed.", fieldErrors: { quotation: "Upload failed." } };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const extraction = await aiExtractQuotation({ bytes, mimeType: stored.mime_type, filename: stored.original_name, userId: user.id });
  const id = newId();
  const t = nowIso();
  db.prepare(
    "INSERT INTO quote_reviews (id, user_id, file_id, status, extraction_source, extraction_note, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, user.id, stored.id, extraction.ok ? "extracted" : "manual", extraction.ok ? "ai" : "manual", extraction.ok ? null : extraction.reason, JSON.stringify(extraction.data), t, t);
  // Metadata only: the quotation text is never written to logs.
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "quote_review.created", entityType: "quote_review", entityId: id, metadata: { extracted: extraction.ok, mime: stored.mime_type } });
  redirect(`/advisor/quote/${id}`);
}

export async function startManualQuoteAction(): Promise<void> {
  const user = await actionUser(["customer", "installer"]);
  if (!user) redirect("/login?next=/advisor/quote");
  const id = newId();
  const t = nowIso();
  db.prepare("INSERT INTO quote_reviews (id, user_id, file_id, status, extraction_source, extraction_note, data_json, created_at, updated_at) VALUES (?, ?, NULL, 'manual', 'manual', NULL, ?, ?, ?)").run(
    id,
    user.id,
    JSON.stringify(emptyQuote()),
    t,
    t,
  );
  redirect(`/advisor/quote/${id}`);
}

export async function saveQuoteCorrectionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer", "installer"]);
  if (!user) return { error: "Please log in again." };
  const review = getQuoteReview(field(formData, "reviewId"), user.id);
  if (!review) return { error: "Quotation not found." };
  let raw: unknown;
  try {
    raw = JSON.parse(field(formData, "data") || "{}");
  } catch {
    return { error: "The quotation could not be saved. Please try again." };
  }
  const parsed = quoteDataSchema.safeParse(raw);
  if (!parsed.success) return { error: `Check the quotation values: ${zodMessage(parsed.error)}` };
  db.prepare("UPDATE quote_reviews SET data_json = ?, status = 'confirmed', updated_at = ? WHERE id = ? AND user_id = ?").run(JSON.stringify(parsed.data), nowIso(), review.id, user.id);
  redirect(`/advisor/quote/${review.id}?saved=1#comparison`);
}

export async function deleteQuoteReviewAction(formData: FormData): Promise<void> {
  const user = await actionUser(["customer", "installer"]);
  if (!user) redirect("/login");
  const review = getQuoteReview(field(formData, "reviewId"), user.id);
  if (review) {
    db.prepare("DELETE FROM quote_reviews WHERE id = ? AND user_id = ?").run(review.id, user.id);
    if (review.file_id) await deleteFile(review.file_id);
    logAudit({ actorUserId: user.id, actorRole: user.role, action: "quote_review.deleted", entityType: "quote_review", entityId: review.id });
  }
  redirect("/advisor/quote?deleted=1");
}

/* ----------------------------------------------------------------------------
 * Buyer → supplier quotation requests (explicit, reviewed before sending)
 * ------------------------------------------------------------------------- */

export async function createSupplierQuoteRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Log in with a homeowner or business account to request a quotation." };
  if (!rateLimit(`supplier-quote:${user.id}`, 10, 60 * 60_000).ok) return { error: "Too many requests in a short time. Please try again later." };
  const parsed = supplierQuoteRequestSchema.safeParse({
    productId: field(formData, "productId"),
    quantity: field(formData, "quantity"),
    deliveryCity: field(formData, "deliveryCity"),
    details: field(formData, "details"),
    shareContact: field(formData, "shareContact") || "no",
    contactName: field(formData, "contactName"),
    contactPhone: field(formData, "contactPhone"),
    confirmed: field(formData, "confirmed"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const product = getPublicProduct(d.productId);
  if (!product) return { error: "This product is no longer listed." };
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND verification_status = 'verified'").get(product.supplier_id) as SupplierRow | undefined;
  if (!supplier) return { error: "This supplier is not accepting requests right now." };
  const duplicate = db.prepare("SELECT id FROM supplier_quote_requests WHERE customer_user_id = ? AND product_id = ? AND status = 'sent'").get(user.id, product.id);
  if (duplicate) return { error: "You already have an open request for this product. Wait for the supplier’s reply." };

  const share = d.shareContact === "yes";
  const id = newId();
  const t = nowIso();
  db.prepare(
    `INSERT INTO supplier_quote_requests (id, customer_user_id, supplier_id, product_id, product_label, quantity, delivery_city, details, share_contact,
       contact_name, contact_phone, contact_email, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
  ).run(id, user.id, supplier.id, product.id, `${product.brand} ${product.model}`, d.quantity, d.deliveryCity, d.details || null, share ? 1 : 0, share ? d.contactName : null, share ? d.contactPhone : null, share ? user.email : null, t, t);
  notify(supplier.user_id, "quote_request", "New quotation request", `A buyer asked for a quotation on ${product.brand} ${product.model}.`, "/supplier/requests#buyer-requests");
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "supplier_quote_request.created", entityType: "supplier_quote_request", entityId: id, metadata: { shareContact: share } });
  redirect("/app/supplier-quotes?sent=1");
}

export async function closeSupplierQuoteRequestAction(formData: FormData): Promise<void> {
  const user = await actionUser(["customer"]);
  if (!user) redirect("/login");
  db.prepare("UPDATE supplier_quote_requests SET status = 'closed', updated_at = ? WHERE id = ? AND customer_user_id = ? AND status IN ('sent','replied')").run(nowIso(), field(formData, "requestId"), user.id);
  redirect("/app/supplier-quotes");
}

export async function replySupplierQuoteRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["supplier"]);
  if (!user) return { error: "Please log in as a supplier." };
  const supplier = db.prepare("SELECT * FROM suppliers WHERE user_id = ?").get(user.id) as SupplierRow | undefined;
  if (!supplier || supplier.verification_status !== "verified") return { error: "Only verified suppliers can reply." };
  const parsed = supplierQuoteReplySchema.safeParse({
    requestId: field(formData, "requestId"),
    decision: field(formData, "decision"),
    replyPricePhp: field(formData, "replyPricePhp") || undefined,
    replyValidUntil: field(formData, "replyValidUntil"),
    replyNote: field(formData, "replyNote"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const request = db.prepare("SELECT * FROM supplier_quote_requests WHERE id = ? AND supplier_id = ?").get(d.requestId, supplier.id) as SupplierQuoteRequestRow | undefined;
  if (!request) return { error: "Request not found." };
  if (!["sent", "replied"].includes(request.status)) return { error: "This request is closed." };
  if (d.decision === "reply" && d.replyPricePhp == null) return { error: "Enter your quoted total.", fieldErrors: { replyPricePhp: "Enter a price." } };
  if (d.decision === "decline" && !d.replyNote) return { error: "Tell the buyer why you are declining.", fieldErrors: { replyNote: "Add a short note." } };
  const status = d.decision === "reply" ? "replied" : "declined";
  db.prepare("UPDATE supplier_quote_requests SET status = ?, reply_price_php = ?, reply_note = ?, reply_valid_until = ?, replied_at = ?, updated_at = ? WHERE id = ? AND supplier_id = ?").run(
    status,
    d.decision === "reply" ? d.replyPricePhp : null,
    d.replyNote || null,
    d.replyValidUntil || null,
    nowIso(),
    nowIso(),
    request.id,
    supplier.id,
  );
  notify(request.customer_user_id, "quote_request", status === "replied" ? "Supplier sent a quotation" : "Supplier declined your request", `${supplier.business_name} responded about ${request.product_label}.`, "/app/supplier-quotes");
  logAudit({ actorUserId: user.id, actorRole: user.role, action: `supplier_quote_request.${status}`, entityType: "supplier_quote_request", entityId: request.id });
  redirect("/supplier/requests?saved=buyer#buyer-requests");
}
