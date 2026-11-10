"use server";

import fs from "node:fs/promises";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { deleteFile, filePathFor, saveUpload, UploadError } from "@/lib/files";
import { extractBillFromImage, aiStatus } from "@/lib/ai/provider";
import { SolarInputError } from "@/lib/solar/engine";
import { createAssessmentRecord, inputsForSite } from "@/lib/assessments";
import { getAssessment, getBill, getSite } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { assessmentSchema, billSchema, field, optionalNumber, siteSchema, zodFieldErrors, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { AssessmentResult } from "@/lib/solar/engine";
import type { BillRow, SiteRow } from "@/lib/types";

function siteInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    address: field(formData, "address"),
    city: field(formData, "city"),
    province: field(formData, "province"),
    propertyType: field(formData, "propertyType"),
    ownership: field(formData, "ownership"),
    roofType: field(formData, "roofType"),
    roofAreaStatus: field(formData, "roofAreaStatus") === "unknown" ? "unknown" : "known",
    roofAreaM2: optionalNumber(formData, "roofAreaM2"),
    roofAgeYears: optionalNumber(formData, "roofAgeYears"),
    daytimeUsage: field(formData, "daytimeUsage"),
    installBudgetPhp: optionalNumber(formData, "installBudgetPhp"),
    exportPreference: field(formData, "exportPreference") || "not_sure",
    utilityProvider: field(formData, "utilityProvider"),
  };
}

function siteValues(d: SiteInput) {
  const unknown = d.roofAreaStatus === "unknown";
  return {
    // Unknown roof area is stored explicitly; roof_area_m2 = 0 is never used for sizing.
    roofAreaM2: unknown ? 0 : (d.roofAreaM2 as number),
    roofAreaStatus: unknown ? "unknown" : "known",
  };
}

type SiteInput = ReturnType<typeof siteSchema.parse>;

export async function createSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };
  const parsed = siteSchema.safeParse(siteInput(formData));
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const roof = siteValues(d);
  const ctx = await requestContext();
  const id = newId();
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO sites (id, user_id, name, address, city, province, property_type, ownership, roof_type,
       roof_area_m2, roof_area_status, roof_age_years, daytime_usage, install_budget_php, export_preference,
       utility_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    user.id,
    d.name,
    d.address || null,
    d.city,
    d.province || null,
    d.propertyType,
    d.ownership,
    d.roofType,
    roof.roofAreaM2,
    roof.roofAreaStatus,
    d.roofAgeYears ?? null,
    d.daytimeUsage,
    d.installBudgetPhp ?? null,
    d.exportPreference,
    d.utilityProvider || null,
    timestamp,
    timestamp,
  );

  logAudit({ actorUserId: user.id, actorRole: user.role, action: "site.created", entityType: "site", entityId: id, ip: ctx.ip });
  redirect(`/app/sites/${id}`);
}

export async function updateSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };
  const siteId = field(formData, "siteId");
  const site = getSite(siteId, user.id);
  if (!site) return { error: "Site not found." };
  const parsed = siteSchema.safeParse(siteInput(formData));
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const roof = siteValues(d);

  // The legacy monthly_budget_php value is intentionally left unchanged: its meaning was ambiguous.
  db.prepare(
    `UPDATE sites SET name=?, address=?, city=?, province=?, property_type=?, ownership=?, roof_type=?,
       roof_area_m2=?, roof_area_status=?, roof_age_years=?, daytime_usage=?, install_budget_php=?, export_preference=?,
       utility_provider=?, updated_at=?
     WHERE id=? AND user_id=?`,
  ).run(
    d.name,
    d.address || null,
    d.city,
    d.province || null,
    d.propertyType,
    d.ownership,
    d.roofType,
    roof.roofAreaM2,
    roof.roofAreaStatus,
    d.roofAgeYears ?? null,
    d.daytimeUsage,
    d.installBudgetPhp ?? null,
    d.exportPreference,
    d.utilityProvider || null,
    nowIso(),
    siteId,
    user.id,
  );

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "site.updated", entityType: "site", entityId: siteId, ip: ctx.ip });
  redirect(`/app/sites/${siteId}?saved=1`);
}

function billInput(formData: FormData) {
  return {
    siteId: field(formData, "siteId"),
    provider: field(formData, "provider"),
    periodStart: field(formData, "periodStart"),
    periodEnd: field(formData, "periodEnd"),
    monthlyKwh: field(formData, "monthlyKwh"),
    totalPhp: field(formData, "totalPhp"),
    generationChargePhp: optionalNumber(formData, "generationChargePhp"),
    fixedChargesPhp: optionalNumber(formData, "fixedChargesPhp"),
  };
}

export async function createManualBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };
  const parsed = billSchema.safeParse(billInput(formData));
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const d = parsed.data;
  if (!getSite(d.siteId, user.id)) return { error: "Site not found." };

  const id = newId();
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO electricity_bills (id, site_id, user_id, provider, billing_period_start, billing_period_end,
       monthly_kwh, total_php, generation_charge_php, fixed_charges_php, effective_rate_php, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'manual', ?, ?)`,
  ).run(
    id,
    d.siteId,
    user.id,
    d.provider,
    d.periodStart || null,
    d.periodEnd || null,
    d.monthlyKwh,
    d.totalPhp,
    d.generationChargePhp ?? null,
    d.fixedChargesPhp ?? null,
    Math.round((d.totalPhp / d.monthlyKwh) * 100) / 100,
    timestamp,
    timestamp,
  );

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "bill.created", entityType: "bill", entityId: id, metadata: { source: "manual" }, ip: ctx.ip });
  redirect(`/app/sites/${d.siteId}?saved=bill`);
}

export async function uploadBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };

  const siteId = field(formData, "siteId");
  if (!getSite(siteId, user.id)) return { error: "Site not found." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a bill file to upload." };

  const ctx = await requestContext();
  const limit = rateLimit(`upload:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Too many uploads. Please try again later." };

  let saved;
  try {
    saved = await saveUpload(file, user.id, "bill");
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Upload failed. Try a smaller file." };
  }

  const wantAi = formData.get("useAi") === "on" && aiStatus().enabled;
  let extracted = null as Awaited<ReturnType<typeof extractBillFromImage>> | null;
  if (wantAi) {
    try {
      const bytes = await fs.readFile(filePathFor(saved.storage_key));
      extracted = await extractBillFromImage({ bytes, mimeType: saved.mime_type, filename: saved.original_name, userId: user.id });
    } catch {
      extracted = { ok: false, reason: "AI assist could not read the file. Enter values manually." };
    }
  }

  const timestamp = nowIso();
  const id = newId();
  const aiData = extracted?.ok ? extracted.data : null;

  db.prepare(
    `INSERT INTO electricity_bills (id, site_id, user_id, provider, billing_period_start, billing_period_end,
       monthly_kwh, total_php, generation_charge_php, fixed_charges_php, effective_rate_php, status, source, file_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'draft', ?, ?, ?, ?)`,
  ).run(
    id,
    siteId,
    user.id,
    aiData?.provider || "To be confirmed",
    aiData?.billingPeriodStart ?? null,
    aiData?.billingPeriodEnd ?? null,
    aiData?.monthlyKwh ?? 0,
    aiData?.totalPhp ?? 0,
    aiData?.generationChargePhp ?? null,
    aiData?.fixedChargesPhp ?? null,
    aiData ? "ai" : "manual",
    saved.id,
    timestamp,
    timestamp,
  );

  if (wantAi) {
    db.prepare(
      `INSERT INTO bill_extractions (id, bill_id, provider, model, raw_json, confidence, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      id,
      aiStatus().provider,
      aiStatus().model,
      extracted && extracted.ok ? JSON.stringify(extracted.data) : null,
      extracted && extracted.ok ? extracted.data.confidence : null,
      extracted?.ok ? "suggested" : "failed",
      extracted && extracted.ok ? null : extracted?.reason ?? "AI assist was unavailable.",
      timestamp,
    );
  }

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "bill.uploaded",
    entityType: "bill",
    entityId: id,
    metadata: { ai: Boolean(aiData), mime: saved.mime_type },
    ip: ctx.ip,
  });
  redirect(`/app/bills/${id}`);
}

export async function confirmBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };
  const billId = field(formData, "billId");
  const bill = getBill(billId, user.id);
  if (!bill) return { error: "Bill not found." };
  const parsed = billSchema.safeParse({ ...billInput(formData), siteId: bill.site_id });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const d = parsed.data;

  const extraction = db
    .prepare("SELECT id FROM bill_extractions WHERE bill_id = ? AND status = 'suggested' ORDER BY created_at DESC LIMIT 1")
    .get(billId) as { id: string } | undefined;

  db.transaction(() => {
    db.prepare(
      `UPDATE electricity_bills SET provider=?, billing_period_start=?, billing_period_end=?, monthly_kwh=?, total_php=?,
         generation_charge_php=?, fixed_charges_php=?, effective_rate_php=?, status='confirmed', source=?, updated_at=?
       WHERE id=? AND user_id=?`,
    ).run(
      d.provider,
      d.periodStart || null,
      d.periodEnd || null,
      d.monthlyKwh,
      d.totalPhp,
      d.generationChargePhp ?? null,
      d.fixedChargesPhp ?? null,
      Math.round((d.totalPhp / d.monthlyKwh) * 100) / 100,
      extraction ? "ai_corrected" : "manual",
      nowIso(),
      billId,
      user.id,
    );
    if (extraction) {
      db.prepare("UPDATE bill_extractions SET status = 'accepted' WHERE id = ?").run(extraction.id);
    }
  })();

  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "bill.confirmed", entityType: "bill", entityId: billId, ip: ctx.ip });
  redirect(`/app/sites/${bill.site_id}?saved=bill`);
}

export async function deleteBillAction(formData: FormData) {
  const user = await actionUser(["customer"]);
  if (!user) {
    redirect("/login");
  }
  const billId = field(formData, "billId");
  const bill = getBill(billId, user.id);
  if (!bill) redirect("/app/sites");

  db.prepare("DELETE FROM electricity_bills WHERE id = ? AND user_id = ?").run(billId, user.id);
  if (bill.file_id) await deleteFile(bill.file_id);
  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "bill.deleted", entityType: "bill", entityId: billId, ip: ctx.ip });
  redirect(`/app/sites/${bill.site_id}?deleted=bill`);
}

export async function createAssessmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["customer"]);
  if (!user) return { error: "Please log in as a customer." };
  const parsed = assessmentSchema.safeParse({ siteId: field(formData, "siteId"), systemType: field(formData, "systemType") });
  if (!parsed.success) return { error: zodMessage(parsed.error), fieldErrors: zodFieldErrors(parsed.error) };
  const { siteId, systemType } = parsed.data;
  const site = getSite(siteId, user.id);
  if (!site) return { error: "Site not found." };

  const bill = db
    .prepare(
      "SELECT * FROM electricity_bills WHERE site_id = ? AND user_id = ? AND status = 'confirmed' ORDER BY created_at DESC LIMIT 1",
    )
    .get(siteId, user.id) as { monthly_kwh: number; total_php: number } | undefined;
  if (!bill) return { error: "Add and confirm an electricity bill first." };

  const ctx = await requestContext();
  let created: { id: string; result: AssessmentResult };
  try {
    created = createAssessmentRecord(user.id, siteId, inputsForSite(site, bill, systemType));
  } catch (error) {
    return {
      error:
        error instanceof SolarInputError
          ? `${error.message} Check the bill and roof details.`
          : "Those figures cannot produce a valid estimate. Check the bill and roof details.",
    };
  }
  // Remember the answer so the next estimate starts from it.
  db.prepare("UPDATE sites SET export_preference = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(systemType, nowIso(), siteId, user.id);

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "assessment.created",
    entityType: "assessment",
    entityId: created.id,
    metadata: { modelVersion: created.result.modelVersion, sizing: created.result.sizing?.status },
    ip: ctx.ip,
  });
  redirect(`/app/assessments/${created.id}`);
}

export async function archiveAssessmentAction(formData: FormData) {
  const user = await actionUser(["customer"]);
  if (!user) redirect("/login");
  const id = field(formData, "assessmentId");
  db.prepare("UPDATE assessments SET status = 'archived', updated_at = ? WHERE id = ? AND user_id = ?").run(
    nowIso(),
    id,
    user.id,
  );
  const ctx = await requestContext();
  logAudit({ actorUserId: user.id, actorRole: user.role, action: "assessment.archived", entityType: "assessment", entityId: id, ip: ctx.ip });
  redirect("/app");
}
