"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { getAssessment, getInstallerByUserId, getQuoteRequestForCustomer, listVerifiedInstallers } from "@/lib/data";
import { checkProviderSelection, eligibleInstallers } from "@/lib/matching";
import { getPublicProduct, type CatalogueItem } from "@/lib/marketplace-data";
import { sizingStatus } from "@/lib/solar/view";
import type { AssessmentResult } from "@/lib/solar/engine";
import { requestContext } from "@/lib/request";
import { field, installerQuoteSchema, quoteRequestSchema, zodFieldErrors, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { QuoteRequestRow, SiteRow } from "@/lib/types";

export async function createQuoteRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };

  const installerIds = formData.getAll("installerIds").filter((v): v is string => typeof v === "string");
  const uniqueIds = Array.from(new Set(installerIds));
  const parsed = quoteRequestSchema.safeParse({
    assessmentId: field(formData, "assessmentId"),
    installerIds: uniqueIds.length > 0 ? uniqueIds : installerIds,
    message: field(formData, "message"),
    shareContact: formData.get("shareContact") === "on" ? "on" : undefined,
    contactName: field(formData, "contactName"),
    contactPhone: field(formData, "contactPhone"),
    contactEmail: field(formData, "contactEmail"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };

  const assessment = getAssessment(parsed.data.assessmentId, user.id);
  if (!assessment) return { error: "Assessment not found." };
  if (assessment.status === "archived") return { error: "This assessment is archived." };

  const site = db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(assessment.site_id, user.id) as
    | SiteRow
    | undefined;
  if (!site) return { error: "Assessment site not found." };

  const result = JSON.parse(assessment.result_json) as AssessmentResult;
  const sizing = sizingStatus(result);
  if (sizing === "insufficient_roof") return { error: "This estimate has no system to quote. Check your roof details first." };
  if (sizing === "roof_unchecked" || site.roof_area_status === "unknown") {
    return { error: "Add your roof area and run a new estimate before asking providers for a site-specific quote." };
  }

  // One active request per estimate: prevents duplicate submissions and repeat spam to providers.
  const active = db
    .prepare("SELECT id FROM quote_requests WHERE assessment_id = ? AND customer_user_id = ? AND status IN ('open','matched') LIMIT 1")
    .get(assessment.id, user.id) as { id: string } | undefined;
  if (active) return { error: "You already have an active quote request for this estimate. Open it from your quote requests." };

  const eligible = eligibleInstallers(listVerifiedInstallers(), { city: site.city, province: site.province });
  const selection = checkProviderSelection(parsed.data.installerIds, eligible.map((e) => e.installer.id));
  if (!selection.ok) return { error: selection.error, fieldErrors: { installerIds: selection.error } };
  const chosen = eligible.filter((e) => selection.ids.includes(e.installer.id)).map((e) => e.installer);

  const id = newId();
  const timestamp = nowIso();
  const sharing = parsed.data.shareContact === "on";

  db.transaction(() => {
    db.prepare(
      `INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, status, message, share_contact,
         contact_name, contact_phone, contact_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      user.id,
      assessment.site_id,
      assessment.id,
      parsed.data.message || null,
      sharing ? 1 : 0,
      sharing ? parsed.data.contactName || user.name : null,
      sharing ? parsed.data.contactPhone || null : null,
      sharing ? parsed.data.contactEmail || user.email : null,
      timestamp,
      timestamp,
    );

    const insertInvite = db.prepare(
      "INSERT INTO quote_invites (id, quote_request_id, installer_id, status, created_at) VALUES (?, ?, ?, 'invited', ?)",
    );
    const notifyInstaller = db.prepare(
      "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const installer of chosen) {
      insertInvite.run(newId(), id, installer.id, timestamp);
      notifyInstaller.run(
        newId(),
        installer.user_id,
        "quote_request",
        "New quote request",
        `A customer in ${site.city} requested quotes. Open the lead to review the assessment.`,
        `/installer/leads/${id}`,
        timestamp,
      );
    }

    db.prepare("UPDATE assessments SET status = 'quote_requested', updated_at = ? WHERE id = ?").run(timestamp, assessment.id);
    db.prepare(
      `INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, 'customer', NULL, 'open', ?, ?)`,
    ).run(newId(), id, user.id, `Invited ${chosen.length} verified provider(s) serving ${site.city}`, timestamp);
  })();

  const ctx = await requestContext();
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "quote_request.created",
    entityType: "quote_request",
    entityId: id,
    metadata: { installers: chosen.length, shareContact: sharing },
    ip: ctx.ip,
  });
  redirect(`/app/quotes/${id}`);
}

export async function closeQuoteRequestAction(formData: FormData) {
  const user = await actionUser(["customer"]);
  if (!user) redirect("/login");
  const id = field(formData, "quoteRequestId");
  const request = getQuoteRequestForCustomer(id, user.id);
  if (!request) redirect("/app/quotes");

  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE quote_requests SET status = 'closed', updated_at = ? WHERE id = ? AND customer_user_id = ?").run(
      timestamp,
      id,
      user.id,
    );
    const invites = db
      .prepare("SELECT id, installer_id FROM quote_invites WHERE quote_request_id = ? AND status IN ('invited','viewed')")
      .all(id) as { id: string; installer_id: string }[];
    const updateInvite = db.prepare("UPDATE quote_invites SET status = 'withdrawn', responded_at = ? WHERE id = ?");
    for (const invite of invites) {
      updateInvite.run(timestamp, invite.id);
      db.prepare(
        "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, (SELECT user_id FROM installers WHERE id = ?), ?, ?, ?, ?, ?)",
      ).run(newId(), invite.installer_id, "request_closed", "Quote request closed", "The customer closed this request.", "/installer", timestamp);
    }
    db.prepare(
      `INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, 'customer', ?, 'closed', 'Customer closed the request', ?)`,
    ).run(newId(), id, user.id, request.status, timestamp);
  })();

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "quote_request.closed", entityType: "quote_request", entityId: id, ip: ctx.ip });
  redirect(`/app/quotes/${id}?closed=1`);
}

export async function submitInstallerQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["installer"]);
  if (!user) return { error: "Please log in as an installer." };
  const installer = getInstallerByUserId(user.id);
  if (!installer) return { error: "Complete your installer profile first." };
  if (installer.verification_status !== "verified") {
    return { error: "Your business must be verified before you can submit quotes." };
  }

  const descriptions = formData.getAll("itemDescription").filter((v): v is string => typeof v === "string");
  const amounts = formData.getAll("itemAmount").filter((v): v is string => typeof v === "string");
  const lineItems = descriptions
    .map((description, index) => ({ description, amountPhp: amounts[index] ?? "" }))
    .filter((item) => item.description.trim().length > 0)
    .slice(0, 20);

  const parsed = installerQuoteSchema.safeParse({
    inviteId: field(formData, "inviteId"),
    capacityKwp: field(formData, "capacityKwp"),
    pricePhp: field(formData, "pricePhp"),
    warrantyYears: field(formData, "warrantyYears"),
    workmanshipWarrantyYears: field(formData, "workmanshipWarrantyYears"),
    timelineWeeks: field(formData, "timelineWeeks"),
    expectedAnnualKwh: field(formData, "expectedAnnualKwh"),
    exclusions: field(formData, "exclusions"),
    notes: field(formData, "notes"),
    validUntil: field(formData, "validUntil"),
    panelModel: field(formData, "panelModel"),
    inverterModel: field(formData, "inverterModel"),
    equipmentSupplier: field(formData, "equipmentSupplier"),
    inclusions: field(formData, "inclusions"),
    panelProductId: field(formData, "panelProductId"),
    inverterProductId: field(formData, "inverterProductId"),
    lineItems,
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };

  // Catalogue links must be approved products of the right category; they fill in model and supplier.
  const linked = { panel: null as CatalogueItem | null, inverter: null as CatalogueItem | null };
  for (const [key, category] of [["panelProductId", "panel"], ["inverterProductId", "inverter"]] as const) {
    const productId = parsed.data[key];
    if (!productId) continue;
    const product = getPublicProduct(productId);
    if (!product || product.category !== category) return { error: `The selected ${category} is no longer available in the catalogue.` };
    linked[category] = product;
  }
  if (linked.panel) {
    parsed.data.panelModel = `${linked.panel.brand} ${linked.panel.model}`;
    parsed.data.equipmentSupplier = parsed.data.equipmentSupplier || linked.panel.supplier_name;
  }
  if (linked.inverter) {
    parsed.data.inverterModel = `${linked.inverter.brand} ${linked.inverter.model}`;
    parsed.data.equipmentSupplier = parsed.data.equipmentSupplier || linked.inverter.supplier_name;
  }
  if (parsed.data.lineItems.length === 0) {
    return { error: "Add at least one itemised line (for example, panels, inverter, labour)." };
  }
  const itemsTotal = parsed.data.lineItems.reduce((sum, item) => sum + item.amountPhp, 0);
  const tolerance = Math.max(1000, parsed.data.pricePhp * 0.05);
  if (Math.abs(itemsTotal - parsed.data.pricePhp) > tolerance) {
    return { error: `Line items add up to ₱${itemsTotal.toLocaleString("en-PH")}, which does not match the total price. Adjust the lines or the total.` };
  }

  const invite = db
    .prepare("SELECT * FROM quote_invites WHERE id = ? AND installer_id = ?")
    .get(parsed.data.inviteId, installer.id) as { id: string; quote_request_id: string; status: string } | undefined;
  if (!invite) return { error: "This lead is not assigned to you." };

  const request = db
    .prepare("SELECT * FROM quote_requests WHERE id = ?")
    .get(invite.quote_request_id) as QuoteRequestRow | undefined;
  if (!request || request.status === "closed" || request.status === "cancelled") {
    return { error: "This quote request is closed." };
  }
  const site = db.prepare("SELECT * FROM sites WHERE id = ?").get(request.site_id) as SiteRow;
  const timestamp = nowIso();
  const existing = db.prepare("SELECT id FROM installer_quotes WHERE invite_id = ?").get(invite.id) as { id: string } | undefined;
  const quoteId = existing?.id ?? newId();

  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE installer_quotes SET status='revised', capacity_kwp=?, price_php=?, warranty_years=?,
           workmanship_warranty_years=?, timeline_weeks=?, expected_annual_kwh=?, exclusions=?, notes=?, valid_until=?,
           panel_model=?, inverter_model=?, equipment_supplier=?, inclusions=?, panel_product_id=?, inverter_product_id=?, updated_at=?
         WHERE id=?`,
      ).run(
        parsed.data.capacityKwp,
        parsed.data.pricePhp,
        parsed.data.warrantyYears,
        parsed.data.workmanshipWarrantyYears,
        parsed.data.timelineWeeks,
        parsed.data.expectedAnnualKwh,
        parsed.data.exclusions || null,
        parsed.data.notes || null,
        parsed.data.validUntil || null,
        parsed.data.panelModel || null,
        parsed.data.inverterModel || null,
        parsed.data.equipmentSupplier || null,
        parsed.data.inclusions || null,
        linked.panel?.id ?? null,
        linked.inverter?.id ?? null,
        timestamp,
        quoteId,
      );
      db.prepare("DELETE FROM quote_line_items WHERE quote_id = ?").run(quoteId);
    } else {
      db.prepare(
        `INSERT INTO installer_quotes (id, invite_id, quote_request_id, installer_id, status, capacity_kwp, price_php,
           warranty_years, workmanship_warranty_years, timeline_weeks, expected_annual_kwh, exclusions, notes, valid_until,
           panel_model, inverter_model, equipment_supplier, inclusions, panel_product_id, inverter_product_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        quoteId,
        invite.id,
        request.id,
        installer.id,
        parsed.data.capacityKwp,
        parsed.data.pricePhp,
        parsed.data.warrantyYears,
        parsed.data.workmanshipWarrantyYears,
        parsed.data.timelineWeeks,
        parsed.data.expectedAnnualKwh,
        parsed.data.exclusions || null,
        parsed.data.notes || null,
        parsed.data.validUntil || null,
        parsed.data.panelModel || null,
        parsed.data.inverterModel || null,
        parsed.data.equipmentSupplier || null,
        parsed.data.inclusions || null,
        linked.panel?.id ?? null,
        linked.inverter?.id ?? null,
        timestamp,
        timestamp,
      );
    }

    const insertItem = db.prepare(
      "INSERT INTO quote_line_items (id, quote_id, category, description, quantity, unit, unit_price_php, amount_php) VALUES (?, ?, ?, ?, 1, NULL, NULL, ?)",
    );
    for (const item of parsed.data.lineItems) {
      insertItem.run(newId(), quoteId, "item", item.description, item.amountPhp);
    }

    db.prepare("UPDATE quote_invites SET status = 'quoted', responded_at = ? WHERE id = ?").run(timestamp, invite.id);
    db.prepare("UPDATE quote_requests SET status = 'matched', updated_at = ? WHERE id = ?").run(timestamp, request.id);
    db.prepare(
      `INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, 'installer', ?, 'matched', ?, ?)`,
    ).run(newId(), request.id, user.id, request.status, `Quote ${existing ? "revised" : "submitted"} by ${installer.business_name}`, timestamp);

    db.prepare(
      "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newId(),
      request.customer_user_id,
      "quote_received",
      existing ? "An installer revised a quote" : "You received a solar quote",
      `${installer.business_name} submitted a quote for ${site.name}. Compare it with the others.`,
      `/app/quotes/${request.id}`,
      timestamp,
    );
  })();

  const ctx = await requestContext();
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: existing ? "quote.revised" : "quote.submitted",
    entityType: "installer_quote",
    entityId: quoteId,
    metadata: { installerId: installer.id, requestId: request.id },
    ip: ctx.ip,
  });
  redirect(`/installer/leads/${request.id}?submitted=1`);
}

export async function declineInviteAction(formData: FormData) {
  const user = await actionUser(["installer"]);
  if (!user) redirect("/login");
  const installer = getInstallerByUserId(user.id);
  if (!installer) redirect("/installer");
  if (installer.verification_status !== "verified") redirect("/installer");

  const inviteId = field(formData, "inviteId");
  const invite = db
    .prepare(
      `SELECT qi.*, qr.customer_user_id FROM quote_invites qi
       JOIN quote_requests qr ON qr.id = qi.quote_request_id
       WHERE qi.id = ? AND qi.installer_id = ?`,
    )
    .get(inviteId, installer.id) as { id: string; quote_request_id: string; customer_user_id: string; status: string } | undefined;
  if (!invite) redirect("/installer");
  if (!["invited", "viewed"].includes(invite.status)) redirect(`/installer/leads/${invite.quote_request_id}`);

  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE quote_invites SET status = 'declined', responded_at = ? WHERE id = ?").run(timestamp, invite.id);
    db.prepare(
      "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'invite_declined', 'An installer declined', ?, ?, ?)",
    ).run(
      newId(),
      invite.customer_user_id,
      `${installer.business_name} declined this request. You can still receive quotes from the other invited installers.`,
      `/app/quotes/${invite.quote_request_id}`,
      timestamp,
    );
  })();

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "invite.declined", entityType: "quote_invite", entityId: invite.id, ip: ctx.ip });
  redirect("/installer?declined=1");
}

export async function adminWithdrawQuoteAction(formData: FormData) {
  const user = await actionUser(["admin"]);
  if (!user) redirect("/login");
  const quoteId = field(formData, "quoteId");
  const note = field(formData, "note").slice(0, 500);
  const quote = db.prepare("SELECT * FROM installer_quotes WHERE id = ?").get(quoteId) as
    | { id: string; installer_id: string; quote_request_id: string; status: string }
    | undefined;
  if (!quote) redirect("/admin/quotes");

  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE installer_quotes SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(timestamp, quoteId);
    db.prepare(
      `INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, 'admin', ?, 'withdrawn', ?, ?)`,
    ).run(newId(), quote.quote_request_id, user.id, quote.status, note || "Withdrawn by admin moderation", timestamp);
  })();

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "quote.withdrawn_by_admin", entityType: "installer_quote", entityId: quoteId, metadata: { note }, ip: ctx.ip });
  redirect("/admin/quotes?withdrawn=1");
}
