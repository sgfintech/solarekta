import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * Immediate self-service data export. Returns the signed-in user's own records as
 * JSON. Private file bytes and storage keys are intentionally excluded; the export
 * lists file metadata so the user knows what is held.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sites = db
    .prepare("SELECT * FROM sites WHERE user_id = ? ORDER BY created_at")
    .all(user.id) as Record<string, unknown>[];
  const bills = db
    .prepare(
      `SELECT id, site_id, provider, billing_period_start, billing_period_end, monthly_kwh, total_php,
         generation_charge_php, fixed_charges_php, effective_rate_php, status, source, file_id, created_at, updated_at
       FROM electricity_bills WHERE user_id = ? ORDER BY created_at`,
    )
    .all(user.id) as Record<string, unknown>[];
  const assessments = db
    .prepare("SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at")
    .all(user.id) as Record<string, unknown>[];
  const quoteRequests = db
    .prepare("SELECT * FROM quote_requests WHERE customer_user_id = ? ORDER BY created_at")
    .all(user.id) as Record<string, unknown>[];
  const consents = db
    .prepare("SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at")
    .all(user.id) as Record<string, unknown>[];
  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at")
    .all(user.id) as Record<string, unknown>[];
  const dataRequests = db
    .prepare("SELECT * FROM data_requests WHERE user_id = ? ORDER BY created_at")
    .all(user.id) as Record<string, unknown>[];
  const files = db
    .prepare(
      "SELECT id, original_name, mime_type, size_bytes, purpose, created_at FROM files WHERE owner_user_id = ? ORDER BY created_at",
    )
    .all(user.id) as Record<string, unknown>[];
  const installer = db
    .prepare(
      `SELECT id, business_name, slug, about, website, phone, service_areas_json, verification_status,
         verified_at, license_no, years_experience, created_at, updated_at
       FROM installers WHERE user_id = ?`,
    )
    .get(user.id) as Record<string, unknown> | undefined;
  const installerQuotes = installer
    ? (db
        .prepare(
          `SELECT q.* FROM installer_quotes q WHERE q.installer_id = ? ORDER BY q.created_at`,
        )
        .all(installer.id) as Record<string, unknown>[])
    : [];

  const payload = {
    exportedAt: new Date().toISOString(),
    notice:
      "This export contains records associated with your SOLARekta account. Private uploaded files are not included; file metadata is listed. Figures in assessments are estimates, not guarantees.",
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
    },
    sites,
    bills,
    assessments: assessments.map((assessment) => ({
      ...assessment,
      inputs: parseJson(assessment.inputs_json),
      result: parseJson(assessment.result_json),
    })),
    quoteRequests,
    installer: installer ?? null,
    installerQuotes,
    consents,
    notifications,
    dataRequests,
    files,
  };

  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: "user.data_exported",
    entityType: "user",
    entityId: user.id,
    metadata: { counts: { sites: sites.length, bills: bills.length, assessments: assessments.length } },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="solarekta-export-${date}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
