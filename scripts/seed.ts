/**
 * Loads synthetic demonstration data. No real customer bills or installer
 * credentials are used. Safe to run repeatedly: demo accounts are replaced.
 *
 * Usage: npm run db:seed
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { newId, nowIso, sha256 } from "@/lib/ids";
import { hashPassword } from "@/lib/passwords";
import { assessSolar } from "@/lib/solar/engine";
import type { AssessmentResult } from "@/lib/solar/engine";
import sharp from "sharp";
import { currentTemplate, type SurveyType } from "@/lib/survey/templates";
import { emptySurveyData, type SurveyData } from "@/lib/survey/model";

let pendingSurveySeed: { customerId: string; adminId: string; installer1Id: string; installer1UserId: string; requestAId: string; requestBId: string } | null = null;

const PASSWORD = "Solarekta2026!";
const root = process.cwd();
const uploadRoot = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(root, "var", "uploads");
const now = Date.now();

const iso = (daysAgo = 0, hoursAgo = 0) =>
  new Date(now - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString();

const DEMO_EMAILS = [
  "customer@solarekta.ph",
  "installer1@solarekta.ph",
  "installer2@solarekta.ph",
  "installer3@solarekta.ph",
  "admin@solarekta.ph",
  "installer4@solarekta.ph",
  "installer5@solarekta.ph",
  "supplier1@solarekta.ph",
  "supplier2@solarekta.ph",
  "supplier3@solarekta.ph",
];

function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Builds a tiny, valid single-page PDF so demo documents open in a browser. */
function makePdf(title: string, lines: string[]) {
  const content = [
    "BT",
    "/F1 16 Tf",
    "50 780 Td",
    `(${esc(title)}) Tj`,
    "/F1 10 Tf",
    ...lines.flatMap((line) => ["0 -20 Td", `(${esc(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function pruneDemoData() {
  const placeholders = DEMO_EMAILS.map(() => "?").join(",");
  const files = db
    .prepare(`SELECT f.storage_key FROM files f JOIN users u ON u.id = f.owner_user_id WHERE u.email IN (${placeholders})`)
    .all(...DEMO_EMAILS) as { storage_key: string }[];
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(uploadRoot, file.storage_key));
    } catch {
      // Missing disk file should not block reseeding.
    }
  }
  // Demo surveys (and their private media) go first so user deletion isn't blocked by references.
  const demoSurveys = db.prepare("SELECT id FROM site_surveys WHERE is_demo = 1").all() as { id: string }[];
  for (const survey of demoSurveys) fs.rmSync(path.join(uploadRoot, "surveys", survey.id), { recursive: true, force: true });
  db.prepare("DELETE FROM site_surveys WHERE is_demo = 1").run();
  const demoUserIds = (db.prepare(`SELECT id FROM users WHERE email IN (${placeholders})`).all(...DEMO_EMAILS) as { id: string }[]).map((u) => u.id);
  for (const uid of demoUserIds) {
    db.prepare("UPDATE site_surveys SET reviewed_by = NULL WHERE reviewed_by = ?").run(uid);
    db.prepare("UPDATE site_surveys SET exception_approved_by = NULL WHERE exception_approved_by = ?").run(uid);
    db.prepare("UPDATE site_surveys SET updated_by = NULL WHERE updated_by = ?").run(uid);
  }
  db.prepare(`DELETE FROM users WHERE email IN (${placeholders})`).run(...DEMO_EMAILS);
}

function insertUser(input: {
  email: string;
  name: string;
  role: "customer" | "installer" | "supplier" | "admin";
  phone?: string;
  createdAt?: string;
}) {
  const id = newId();
  const timestamp = input.createdAt ?? iso(30);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, phone, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, input.email, hashPassword(PASSWORD), input.name, input.phone ?? null, input.role, timestamp, timestamp);
  return id;
}

function consent(userId: string, kind: string, version: string, daysAgo: number) {
  db.prepare(
    "INSERT INTO consents (id, user_id, kind, version, granted_at, ip) VALUES (?, ?, ?, ?, ?, '127.0.0.1')",
  ).run(newId(), userId, kind, version, iso(daysAgo));
}

function insertFile(input: { ownerUserId: string; filename: string; title: string; lines: string[]; daysAgo: number; purpose?: string }) {
  const id = newId();
  const storageKey = path.posix.join(iso(input.daysAgo).slice(0, 7), `${id}.pdf`);
  const bytes = makePdf(input.title, input.lines);
  fs.mkdirSync(path.dirname(path.join(uploadRoot, storageKey)), { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, storageKey), bytes);
  db.prepare(
    `INSERT INTO files (id, owner_user_id, storage_key, original_name, mime_type, size_bytes, sha256, purpose, created_at)
     VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?)`,
  ).run(id, input.ownerUserId, storageKey, input.filename, bytes.length, sha256(bytes), input.purpose ?? "installer_document", iso(input.daysAgo));
  return id;
}

function insertAssessment(input: {
  siteId: string;
  userId: string;
  city: string;
  monthlyKwh: number;
  monthlyBillPhp: number;
  roofAreaM2: number;
  roofType: "concrete" | "metal" | "tile" | "asbestos" | "unknown";
  daytimeUsage: "low" | "medium" | "high";
  installBudgetPhp: number;
  daysAgo: number;
}) {
  const result = assessSolar({
    city: input.city,
    monthlyKwh: input.monthlyKwh,
    monthlyBillPhp: input.monthlyBillPhp,
    roofAreaM2: input.roofAreaM2,
    roofType: input.roofType,
    daytimeUsage: input.daytimeUsage,
    systemType: "net_metering",
    installBudgetPhp: input.installBudgetPhp,
  });
  const id = newId();
  const timestamp = iso(input.daysAgo);
  const inputs = {
    city: input.city,
    monthlyKwh: input.monthlyKwh,
    monthlyBillPhp: input.monthlyBillPhp,
    roofAreaM2: input.roofAreaM2,
    roofType: input.roofType,
    daytimeUsage: input.daytimeUsage,
    systemType: "net_metering",
    installBudgetPhp: input.installBudgetPhp,
  };
  db.prepare(
    `INSERT INTO assessments (id, site_id, user_id, model_version, inputs_json, result_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
  ).run(id, input.siteId, input.userId, result.modelVersion, JSON.stringify(inputs), JSON.stringify(result), timestamp, timestamp);
  const insertScenario = db.prepare(
    `INSERT INTO assessment_scenarios (id, assessment_id, name, capacity_kwp, annual_production_kwh, annual_savings_php,
       payback_years, capex_php, net_25y_php, self_consumption_ratio, summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const scenario of result.scenarios) {
    insertScenario.run(
      newId(),
      id,
      scenario.name,
      scenario.capacityKwp,
      scenario.annualProductionKwh,
      scenario.annualSavingsPhp,
      scenario.paybackYears,
      scenario.capexPhp,
      scenario.net25yPhp,
      scenario.selfConsumptionRatio,
      JSON.stringify(scenario),
    );
  }
  return { id, result };
}

function audit(input: {
  actorUserId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  daysAgo: number;
}) {
  db.prepare(
    `INSERT INTO audit_events (id, actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '127.0.0.1', ?)`,
  ).run(
    newId(),
    input.actorUserId ?? null,
    input.actorRole ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    iso(input.daysAgo),
  );
}

function notify(input: { userId: string; kind: string; title: string; body: string; href: string; daysAgo: number; read?: boolean }) {
  db.prepare(
    "INSERT INTO notifications (id, user_id, kind, title, body, href, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    newId(),
    input.userId,
    input.kind,
    input.title,
    input.body,
    input.href,
    input.read ? iso(input.daysAgo) : null,
    iso(input.daysAgo),
  );
}

function main() {
  console.log("Seeding synthetic SOLARekta demo data...");

  db.transaction(() => {
    pruneDemoData();

    // --- Accounts -----------------------------------------------------------
    const customerId = insertUser({ email: "customer@solarekta.ph", name: "Maria Santos", role: "customer", phone: "+63 917 555 0101", createdAt: iso(34) });
    const installer1UserId = insertUser({ email: "installer1@solarekta.ph", name: "Ramon Dela Cruz", role: "installer", phone: "+63 917 555 0201", createdAt: iso(40) });
    const installer2UserId = insertUser({ email: "installer2@solarekta.ph", name: "Aileen Lim", role: "installer", phone: "+63 917 555 0301", createdAt: iso(37) });
    const installer3UserId = insertUser({ email: "installer3@solarekta.ph", name: "Jose Villanueva", role: "installer", phone: "+63 917 555 0401", createdAt: iso(4) });
    const adminId = insertUser({ email: "admin@solarekta.ph", name: "SOLARekta Operations", role: "admin", phone: "+63 917 555 0001", createdAt: iso(60) });

    const policy = "2026-01";
    for (const userId of [customerId, installer1UserId, installer2UserId, installer3UserId, adminId]) {
      consent(userId, "terms", policy, 30);
      consent(userId, "privacy", policy, 30);
    }
    consent(customerId, "bill_processing", policy, 30);
    consent(customerId, "marketing", policy, 20);

    db.prepare(
      "INSERT INTO customer_profiles (user_id, account_type, address, city, province, marketing_opt_in, created_at, updated_at) VALUES (?, 'homeowner', ?, ?, ?, 1, ?, ?)",
    ).run(customerId, "12 Sampaguita Street, UP Village", "Quezon City", "Metro Manila", iso(30), iso(30));

    // --- Installers ---------------------------------------------------------
    const installer1Id = newId();
    const installer2Id = newId();
    const installer3Id = newId();

    db.prepare(
      `INSERT INTO installers (id, user_id, business_name, slug, about, website, phone, service_areas_json,
         verification_status, verified_at, license_no, years_experience, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?)`,
    ).run(
      installer1Id,
      installer1UserId,
      "Bayanihan Solar Energy",
      "bayanihan-solar-energy",
      "Residential and small-commercial rooftop solar across Metro Manila and nearby provinces. We handle structural checks, permitting guidance and net-metering paperwork, and we explain every line of the quote before you sign.",
      "https://example.com/bayanihan-solar",
      "+63 917 555 0201",
      JSON.stringify(["Quezon City", "Manila", "Pasig", "Antipolo"]),
      iso(25),
      "DOE-RES-2024-0182 (synthetic demo)",
      9,
      iso(40),
      iso(25),
    );

    db.prepare(
      `INSERT INTO installers (id, user_id, business_name, slug, about, website, phone, service_areas_json,
         verification_status, verified_at, license_no, years_experience, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?)`,
    ).run(
      installer2Id,
      installer2UserId,
      "Liwanag Solar Solutions",
      "liwanag-solar-solutions",
      "Engineering-led solar installer focused on roof safety and honest production estimates. Our quotes itemise equipment, labour and exclusions so customers can compare like for like.",
      "https://example.com/liwanag-solar",
      "+63 917 555 0301",
      JSON.stringify(["Makati", "Pasig", "Taguig", "Quezon City"]),
      iso(22),
      "DOE-RES-2023-0441 (synthetic demo)",
      6,
      iso(37),
      iso(22),
    );

    db.prepare(
      `INSERT INTO installers (id, user_id, business_name, slug, about, website, phone, service_areas_json,
         verification_status, verified_at, license_no, years_experience, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)`,
    ).run(
      installer3Id,
      installer3UserId,
      "Sierra Solar Trading",
      "sierra-solar-trading",
      "Cebu-based solar trading and installation team serving residential and small business rooftops in Central Visayas. We are preparing our documents for SOLARekta verification.",
      null,
      "+63 917 555 0401",
      JSON.stringify(["Cebu City", "Mandaue", "Lapu-Lapu"]),
      "DOE-RES-2026-0044 (synthetic demo)",
      4,
      iso(4),
      iso(4),
    );

    db.prepare(
      "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'approved', ?, ?)",
    ).run(newId(), installer1Id, adminId, "Business registration and mayor's permit reviewed. Approved for the pilot.", iso(25));
    db.prepare(
      "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'approved', ?, ?)",
    ).run(newId(), installer2Id, adminId, "Documents reviewed. Approved for the pilot with a note to keep insurance current.", iso(22));
    db.prepare(
      "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)",
    ).run(newId(), installer3Id, installer3UserId, "Initial application submitted for manual review.", iso(4));

    const installer1Doc = insertFile({
      ownerUserId: installer1UserId,
      filename: "bayanihan-permit-demo.pdf",
      title: "SYNTHETIC DEMO DOCUMENT",
      lines: [
        "Business: Bayanihan Solar Energy (demo only)",
        "Document: Mayor's permit placeholder",
        "This file contains no real permit, licence or personal data.",
        "Generated for the SOLARekta pilot demonstration.",
      ],
      daysAgo: 26,
    });
    db.prepare(
      "INSERT INTO installer_documents (id, installer_id, file_id, kind, status, reviewed_by, reviewed_at, notes, created_at) VALUES (?, ?, ?, 'mayors_permit', 'approved', ?, ?, ?, ?)",
    ).run(newId(), installer1Id, installer1Doc, adminId, iso(25), "Demo document accepted for the pilot.", iso(26));

    const installer3Doc = insertFile({
      ownerUserId: installer3UserId,
      filename: "sierra-registration-demo.pdf",
      title: "SYNTHETIC DEMO DOCUMENT",
      lines: [
        "Business: Sierra Solar Trading (demo only)",
        "Document: SEC registration placeholder",
        "This file contains no real registration or personal data.",
        "Awaiting admin review in the demo.",
      ],
      daysAgo: 3,
    });
    db.prepare(
      "INSERT INTO installer_documents (id, installer_id, file_id, kind, status, notes, created_at) VALUES (?, ?, ?, 'sec_registration', 'pending', ?, ?)",
    ).run(newId(), installer3Id, installer3Doc, "Awaiting review in the demo queue.", iso(3));

    // --- Customer sites and bills ------------------------------------------
    const site1Id = newId();
    const site2Id = newId();
    db.prepare(
      `INSERT INTO sites (id, user_id, name, address, city, province, property_type, ownership, roof_type,
         roof_area_m2, roof_age_years, daytime_usage, install_budget_php, export_preference, utility_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'residential', 'owner', 'concrete', 82, 12, 'medium', 450000, 'net_metering', 'Meralco', ?, ?)`,
    ).run(site1Id, customerId, "Casa Santos", "12 Sampaguita Street, UP Village", "Quezon City", "Metro Manila", iso(28), iso(28));
    db.prepare(
      `INSERT INTO sites (id, user_id, name, address, city, province, property_type, ownership, roof_type,
         roof_area_m2, roof_age_years, daytime_usage, install_budget_php, export_preference, utility_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'commercial', 'owner', 'metal', 150, 7, 'high', 900000, 'not_sure', 'Meralco', ?, ?)`,
    ).run(site2Id, customerId, "Santos Sari-sari Store", "88 Mabini Street", "Pasig", "Metro Manila", iso(15), iso(15));

    db.prepare(
      `INSERT INTO electricity_bills (id, site_id, user_id, provider, billing_period_start, billing_period_end,
         monthly_kwh, total_php, generation_charge_php, fixed_charges_php, effective_rate_php, status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'Meralco', ?, ?, 486, 5832, 4210, 1622, 12.00, 'confirmed', 'manual', ?, ?)`,
    ).run(newId(), site1Id, customerId, iso(58).slice(0, 10), iso(29).slice(0, 10), iso(27), iso(27));
    db.prepare(
      `INSERT INTO electricity_bills (id, site_id, user_id, provider, billing_period_start, billing_period_end,
         monthly_kwh, total_php, generation_charge_php, fixed_charges_php, effective_rate_php, status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'Meralco', ?, ?, 1180, 15340, 11052, 4288, 13.00, 'confirmed', 'manual', ?, ?)`,
    ).run(newId(), site2Id, customerId, iso(45).slice(0, 10), iso(16).slice(0, 10), iso(14), iso(14));

    // --- Assessments --------------------------------------------------------
    const assessment1 = insertAssessment({
      siteId: site1Id,
      userId: customerId,
      city: "Quezon City",
      monthlyKwh: 486,
      monthlyBillPhp: 5832,
      roofAreaM2: 82,
      roofType: "concrete",
      daytimeUsage: "medium",
      installBudgetPhp: 450000,
      daysAgo: 27,
    });
    const assessment2 = insertAssessment({
      siteId: site2Id,
      userId: customerId,
      city: "Pasig",
      monthlyKwh: 1180,
      monthlyBillPhp: 15340,
      roofAreaM2: 150,
      roofType: "metal",
      daytimeUsage: "high",
      installBudgetPhp: 900000,
      daysAgo: 13,
    });

    // --- Quote request A: matched, two quotes -------------------------------
    const requestAId = newId();
    db.prepare(
      `INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, status, message, share_contact,
         contact_name, contact_phone, contact_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'matched', ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      requestAId,
      customerId,
      site1Id,
      assessment1.id,
      "We use most of our electricity in the evening. Please tell us how net metering would work with Meralco and whether the old concrete roof needs reinforcement.",
      "Maria Santos",
      "+63 917 555 0101",
      "customer@solarekta.ph",
      iso(10),
      iso(2),
    );
    db.prepare("UPDATE assessments SET status = 'quote_requested', updated_at = ? WHERE id = ?").run(iso(10), assessment1.id);

    const inviteA1 = newId();
    const inviteA2 = newId();
    db.prepare("INSERT INTO quote_invites (id, quote_request_id, installer_id, status, responded_at, created_at) VALUES (?, ?, ?, 'quoted', ?, ?)").run(inviteA1, requestAId, installer1Id, iso(3), iso(10));
    db.prepare("INSERT INTO quote_invites (id, quote_request_id, installer_id, status, responded_at, created_at) VALUES (?, ?, ?, 'quoted', ?, ?)").run(inviteA2, requestAId, installer2Id, iso(2), iso(10));

    const quoteA1 = newId();
    db.prepare(
      `INSERT INTO installer_quotes (id, invite_id, quote_request_id, installer_id, status, capacity_kwp, price_php,
         warranty_years, workmanship_warranty_years, timeline_weeks, expected_annual_kwh, exclusions, notes, valid_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'submitted', 3.2, 188000, 12, 5, 8, 4380, ?, ?, ?, ?, ?)`,
    ).run(
      quoteA1,
      inviteA1,
      requestAId,
      installer1Id,
      "Excludes structural reinforcement, permit fees and any Meralco upgrade charges. Roof access assumes existing ladder points.",
      "Includes 8 x 400 W panels, a 3 kW hybrid-ready inverter and monitoring. A site survey will confirm shading and roof condition before we finalise the design.",
      iso(-20).slice(0, 10),
      iso(3),
      iso(2),
    );
    const lineA1 = [
      ["Solar panels (8 x 400 W)", 92000],
      ["Inverter and monitoring", 46000],
      ["Mounting and electrical BOS", 28000],
      ["Labour, commissioning and paperwork", 22000],
    ] as const;
    for (const [description, amount] of lineA1) {
      db.prepare(
        "INSERT INTO quote_line_items (id, quote_id, category, description, quantity, unit, unit_price_php, amount_php) VALUES (?, ?, 'item', ?, 1, NULL, NULL, ?)",
      ).run(newId(), quoteA1, description, amount);
    }

    const quoteA2 = newId();
    db.prepare(
      `INSERT INTO installer_quotes (id, invite_id, quote_request_id, installer_id, status, capacity_kwp, price_php,
         warranty_years, workmanship_warranty_years, timeline_weeks, expected_annual_kwh, exclusions, notes, valid_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'revised', 3.0, 192500, 10, 5, 6, 4250, ?, ?, ?, ?, ?)`,
    ).run(
      quoteA2,
      inviteA2,
      requestAId,
      installer2Id,
      "Excludes roof repair, permits and any utility interconnection fees. Price assumes standard flush mounting.",
      "Revised after a desktop shading check. We include a pre-installation structural inspection and a production monitoring handover.",
      iso(-18).slice(0, 10),
      iso(2),
      iso(1),
    );
    const lineA2 = [
      ["Panels and racking", 98000],
      ["Inverter", 45500],
      ["Electrical works and cabling", 27000],
      ["Installation and commissioning", 22000],
    ] as const;
    for (const [description, amount] of lineA2) {
      db.prepare(
        "INSERT INTO quote_line_items (id, quote_id, category, description, quantity, unit, unit_price_php, amount_php) VALUES (?, ?, 'item', ?, 1, NULL, NULL, ?)",
      ).run(newId(), quoteA2, description, amount);
    }

    db.prepare(
      "INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'customer', NULL, 'open', ?, ?)",
    ).run(newId(), requestAId, customerId, "Invited 2 verified installers", iso(10));
    db.prepare(
      "INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'installer', 'open', 'matched', ?, ?)",
    ).run(newId(), requestAId, installer1UserId, "Quote submitted by Bayanihan Solar Energy", iso(3));
    db.prepare(
      "INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'installer', 'matched', 'matched', ?, ?)",
    ).run(newId(), requestAId, installer2UserId, "Quote revised by Liwanag Solar Solutions", iso(1));

    // --- Quote request B: open, one invitation, no quote yet ----------------
    const requestBId = newId();
    db.prepare(
      `INSERT INTO quote_requests (id, customer_user_id, site_id, assessment_id, status, message, share_contact,
         contact_name, contact_phone, contact_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, 0, NULL, NULL, NULL, ?, ?)`,
    ).run(
      requestBId,
      customerId,
      site2Id,
      assessment2.id,
      "The store has a metal roof and high daytime load from freezers. We would like a quote that explains the roof mounting and any extra electrical work.",
      iso(4),
      iso(4),
    );
    db.prepare("UPDATE assessments SET status = 'quote_requested', updated_at = ? WHERE id = ?").run(iso(4), assessment2.id);
    const inviteB1 = newId();
    db.prepare("INSERT INTO quote_invites (id, quote_request_id, installer_id, status, created_at) VALUES (?, ?, ?, 'viewed', ?)").run(inviteB1, requestBId, installer1Id, iso(4));
    db.prepare(
      "INSERT INTO lead_status_events (id, quote_request_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'customer', NULL, 'open', ?, ?)",
    ).run(newId(), requestBId, customerId, "Invited 1 verified installer", iso(4));

    // --- Notifications ------------------------------------------------------
    notify({ userId: installer1UserId, kind: "quote_request", title: "New quote request", body: "A customer in Pasig requested a quote for a commercial rooftop.", href: `/installer/leads/${requestBId}`, daysAgo: 4 });
    notify({ userId: installer1UserId, kind: "request_closed", title: "Quote submitted", body: "Your quote for Casa Santos is with the customer.", href: `/installer/leads/${requestAId}`, daysAgo: 2, read: true });
    notify({ userId: installer2UserId, kind: "request_closed", title: "Quote received", body: "Your revised quote for Casa Santos is with the customer.", href: `/installer/leads/${requestAId}`, daysAgo: 1, read: true });
    notify({ userId: customerId, kind: "quote_received", title: "You received a solar quote", body: "Bayanihan Solar Energy submitted a quote for Casa Santos. Compare it with the other bid.", href: `/app/quotes/${requestAId}`, daysAgo: 3 });
    notify({ userId: customerId, kind: "quote_received", title: "An installer revised a quote", body: "Liwanag Solar Solutions updated its quote for Casa Santos.", href: `/app/quotes/${requestAId}`, daysAgo: 1 });
    notify({ userId: installer3UserId, kind: "verification", title: "Application received", body: "Your documents are queued for manual review. We will notify you when a decision is recorded.", href: "/installer/profile", daysAgo: 4 });
    notify({ userId: adminId, kind: "verification", title: "Installer application to review", body: "Sierra Solar Trading submitted documents for manual review.", href: "/admin/installers", daysAgo: 3 });

    // --- Data rights request ------------------------------------------------
    db.prepare(
      "INSERT INTO data_requests (id, user_id, kind, status, note, created_at) VALUES (?, ?, 'export', 'pending', ?, ?)",
    ).run(newId(), customerId, "Please send a copy of my assessment history before I decide on an installer.", iso(2));

    // --- Audit trail --------------------------------------------------------
    audit({ action: "user.signup", entityType: "user", entityId: customerId, actorUserId: customerId, actorRole: "customer", daysAgo: 34 });
    audit({ action: "installer.applied", entityType: "installer", entityId: installer1Id, actorUserId: installer1UserId, actorRole: "installer", daysAgo: 40 });
    audit({ action: "installer.applied", entityType: "installer", entityId: installer2Id, actorUserId: installer2UserId, actorRole: "installer", daysAgo: 37 });
    audit({ action: "installer.approve", entityType: "installer", entityId: installer1Id, actorUserId: adminId, actorRole: "admin", metadata: { to: "verified" }, daysAgo: 25 });
    audit({ action: "installer.approve", entityType: "installer", entityId: installer2Id, actorUserId: adminId, actorRole: "admin", metadata: { to: "verified" }, daysAgo: 22 });
    audit({ action: "assessment.created", entityType: "assessment", entityId: assessment1.id, actorUserId: customerId, actorRole: "customer", metadata: { modelVersion: assessment1.result.modelVersion }, daysAgo: 27 });
    audit({ action: "quote_request.created", entityType: "quote_request", entityId: requestAId, actorUserId: customerId, actorRole: "customer", metadata: { installers: 2, shareContact: true }, daysAgo: 10 });
    audit({ action: "quote.submitted", entityType: "installer_quote", entityId: quoteA1, actorUserId: installer1UserId, actorRole: "installer", metadata: { installerId: installer1Id, requestId: requestAId }, daysAgo: 3 });
    audit({ action: "quote.revised", entityType: "installer_quote", entityId: quoteA2, actorUserId: installer2UserId, actorRole: "installer", metadata: { installerId: installer2Id, requestId: requestAId }, daysAgo: 1 });
    audit({ action: "data_request.export_requested", entityType: "user", entityId: customerId, actorUserId: customerId, actorRole: "customer", daysAgo: 2 });

    // --- Marketplace demo (clearly flagged is_demo) ---------------------------
    seedMarketplace({ customerId, adminId, installer1Id, installer1UserId, requestAId, quoteA1 });
    pendingSurveySeed = { customerId, adminId, installer1Id, installer1UserId, requestAId, requestBId };

    // --- Summary ------------------------------------------------------------
    const resultSummary: AssessmentResult[] = [assessment1.result, assessment2.result];
    console.log("");
    console.log("Demo accounts (password for all): " + PASSWORD);
    console.log("  customer@solarekta.ph   Maria Santos (customer)");
    console.log("  installer1@solarekta.ph Ramon Dela Cruz, Bayanihan Solar Energy (verified)");
    console.log("  installer2@solarekta.ph Aileen Lim, Liwanag Solar Solutions (verified)");
    console.log("  installer3@solarekta.ph Jose Villanueva, Sierra Solar Trading (pending review)");
    console.log("  admin@solarekta.ph      SOLARekta Operations (admin)");
    console.log("  installer4/5@solarekta.ph  demo installers in Cebu and Davao (verified)");
    console.log("  supplier1@solarekta.ph  Sinag Distribution PH (verified demo supplier)");
    console.log("  supplier2@solarekta.ph  Kidlat Power Trading (verified demo supplier)");
    console.log("  supplier3@solarekta.ph  Tala Energy Imports (pending review)");
    console.log("");
    for (const result of resultSummary) {
      console.log(
        `Assessment: ${result.location.city} — base ${result.base.capacityKwp} kWp, ${result.base.annualProductionKwh.toLocaleString("en-PH")} kWh/yr, ${result.base.paybackYears ?? "25+"} payback`,
      );
    }
    console.log("Quote request with 2 comparable quotes is ready under /app/quotes.");
    console.log("Seeded at " + nowIso());
  })();
}

interface MarketIds {
  customerId: string;
  adminId: string;
  installer1Id: string;
  installer1UserId: string;
  requestAId: string;
  quoteA1: string;
}

/**
 * Demonstration marketplace: fictional suppliers, brands and installers. Every company
 * row carries is_demo = 1 and the UI labels it "Demo listing". No real brands are used.
 */
function seedMarketplace(ids: MarketIds) {
  db.prepare("UPDATE installers SET is_demo = 1").run();

  const installer = (email: string, name: string, business: string, areas: string[], about: string, years: number) => {
    const userId = insertUser({ email, name, role: "installer", phone: "+63 917 000 0000", createdAt: iso(45) });
    const id = newId();
    db.prepare(
      `INSERT INTO installers (id, user_id, business_name, slug, about, phone, service_areas_json, verification_status, verified_at,
         license_no, years_experience, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '+63 917 000 0000', ?, 'verified', ?, 'DEMO-LIC', ?, 1, ?, ?)`,
    ).run(id, userId, business, business.toLowerCase().replace(/[^a-z0-9]+/g, "-"), about, JSON.stringify(areas), iso(20), years, iso(45), iso(20));
    return id;
  };
  installer("installer4@solarekta.ph", "Carla Mendoza", "Bisaya Sun Installers", ["Cebu City", "Mandaue", "Cebu"], "Demo listing: residential and small commercial rooftop installs across Metro Cebu.", 6);
  installer("installer5@solarekta.ph", "Paolo Garcia", "Mindanao Rooftop Solar", ["Davao City", "Davao del Sur", "General Santos"], "Demo listing: grid-tie and hybrid systems for homes and farms in Southern Mindanao.", 9);

  const supplier = (email: string, name: string, business: string, type: string, areas: string[], about: string, status: string, years: number) => {
    const userId = insertUser({ email, name, role: "supplier", phone: "+63 2 8000 0000", createdAt: iso(50) });
    const id = newId();
    db.prepare(
      `INSERT INTO suppliers (id, user_id, business_name, slug, supplier_type, about, phone, delivery_areas_json, registration_no,
         years_in_business, verification_status, verified_at, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '+63 2 8000 0000', ?, 'DEMO-DTI-0000', ?, ?, ?, 1, ?, ?)`,
    ).run(id, userId, business, business.toLowerCase().replace(/[^a-z0-9]+/g, "-"), type, about, JSON.stringify(areas), years, status, status === "verified" ? iso(18) : null, iso(50), iso(5));
    const doc = insertFile({ ownerUserId: userId, filename: `${business} registration (demo).pdf`, title: `${business} — DEMO registration`, lines: ["Sample document for demonstration only."], daysAgo: 30, purpose: "supplier_document" });
    db.prepare("INSERT INTO supplier_documents (id, supplier_id, file_id, kind, status, created_at) VALUES (?, ?, ?, 'business_registration', ?, ?)").run(newId(), id, doc, status === "verified" ? "approved" : "pending", iso(30));
    db.prepare("INSERT INTO supplier_verification_events (id, supplier_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', 'Supplier application submitted', ?)").run(newId(), id, userId, iso(30));
    if (status === "verified") {
      db.prepare("INSERT INTO supplier_verification_events (id, supplier_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'approve', 'Demo approval', ?)").run(newId(), id, ids.adminId, iso(18));
    }
    return { id, userId };
  };
  const sinag = supplier("supplier1@solarekta.ph", "Liza Ramos", "Sinag Distribution PH", "distributor", ["Metro Manila", "Rizal", "Cavite", "Laguna", "Bulacan"], "Demo listing: distributor of Sinag panels and Imbak batteries with a Pasig warehouse and same-week Metro Manila delivery.", "verified", 8);
  const kidlat = supplier("supplier2@solarekta.ph", "Ben Torres", "Kidlat Power Trading", "distributor", ["Nationwide"], "Demo listing: inverter and balance-of-system specialist shipping nationwide from Cebu and Manila.", "verified", 11);
  const tala = supplier("supplier3@solarekta.ph", "Grace Uy", "Tala Energy Imports", "retailer", ["Davao City", "Cagayan de Oro"], "Demo listing: Mindanao retailer awaiting verification.", "pending", 3);

  const product = (supplierId: string, p: {
    category: string; brand: string; model: string; title: string; description: string; specs: Record<string, unknown>;
    warranty: [number | null, number | null]; backer: string; certs: string; price: number | null; unit?: string; stock?: string; lead?: number; status?: string; notes?: string;
    basis?: string; inclusions?: string; exclusions?: string; updated?: number;
  }) => {
    const id = newId();
    db.prepare(
      `INSERT INTO products (id, supplier_id, category, brand, model, title, description, specs_json, warranty_product_years, warranty_performance_years,
         warranty_backer, certifications, price_php, unit, stock_status, lead_time_days, price_basis, inclusions, exclusions, status, review_notes, reviewed_by, reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, supplierId, p.category, p.brand, p.model, p.title, p.description, JSON.stringify(p.specs), p.warranty[0], p.warranty[1], p.backer, p.certs, p.price, p.unit ?? "piece", p.stock ?? "in_stock", p.lead ?? 5, p.basis ?? "equipment_only", p.inclusions ?? null, p.exclusions ?? null, p.status ?? "approved", p.notes ?? null, p.status === "pending" ? null : ids.adminId, p.status === "pending" ? null : iso(15), iso(25), iso(p.updated ?? 4));
    return id;
  };
  const sinag550 = product(sinag.id, { category: "panel", brand: "Sinag", model: "SN-550M", title: "550 W mono half-cell panel", description: "Demo product. 144 half-cut cells, anodised frame, suited to concrete and metal roofs.", specs: { ratedPowerW: 550, efficiencyPct: 21.3 }, warranty: [12, 25], backer: "Sinag Distribution PH (authorised distributor)", certs: "IEC 61215, IEC 61730 (demo)", price: 6950 });
  product(sinag.id, { category: "panel", brand: "Sinag", model: "SN-450M", title: "450 W mono panel for smaller roofs", description: "Demo product. Compact frame for tight roof sections.", specs: { ratedPowerW: 450, efficiencyPct: 20.7 }, warranty: [12, 25], backer: "Sinag Distribution PH (authorised distributor)", certs: "IEC 61215, IEC 61730 (demo)", price: 5850 });
  product(sinag.id, { category: "battery", brand: "Imbak", model: "IB-5.1", title: "5.1 kWh LiFePO4 wall battery", description: "Demo product. Wall-mounted battery compatible with common hybrid inverters.", specs: { capacityKwh: 5.1, nominalVoltageV: 51.2, capacityAh: 100, chemistry: "LiFePO4", communication: ["CAN", "RS485"], compatibleModels: ["KH-6K"] }, warranty: [10, null], backer: "Sinag Distribution PH", certs: "IEC 62619 (demo)", price: 98000, stock: "made_to_order", lead: 21, inclusions: "BMS, wall bracket, communication cable", exclusions: "Installation, delivery outside Metro Manila" });
  product(sinag.id, { category: "battery", brand: "Imbak", model: "IB-15R", title: "51.2 V 300 Ah LiFePO4 rack battery", description: "Demo product. Rack-mounted 16-cell pack.", specs: { nominalVoltageV: 51.2, capacityAh: 300, chemistry: "LiFePO4", dodPercent: 90, communication: ["CAN", "RS485"] }, warranty: [10, null], backer: "Sinag Distribution PH", certs: "IEC 62619 (demo)", price: 168000, lead: 10, inclusions: "BMS, battery cables", exclusions: "Rack cabinet, installation" });
  product(sinag.id, { category: "battery", brand: "Imbak", model: "IB-15R-INST", title: "51.2 V 300 Ah battery, supplied and installed (Metro Manila)", description: "Demo product. Same pack as IB-15R with installation by a partner installer.", specs: { nominalVoltageV: 51.2, capacityAh: 300, chemistry: "LiFePO4", dodPercent: 90 }, warranty: [10, null], backer: "Sinag Distribution PH", certs: "IEC 62619 (demo)", price: 189000, basis: "supply_and_install", inclusions: "Battery, BMS, cabling, installation and commissioning", exclusions: "Inverter, permits" });
  product(sinag.id, { category: "mounting", brand: "Bakal", model: "BR-RAIL-4", title: "Aluminium rail kit for 4 panels", description: "Demo product. Rails, clamps and roof hooks for metal or tile roofs.", specs: {}, warranty: [10, null], backer: "Sinag Distribution PH", certs: "", price: 7400, unit: "kit" });
  product(sinag.id, { category: "panel", brand: "Sinag", model: "SN-600B", title: "600 W bifacial panel", description: "Demo product awaiting review.", specs: { ratedPowerW: 600, efficiencyPct: 22.1 }, warranty: [15, 30], backer: "Sinag Distribution PH", certs: "IEC 61215 (demo)", price: 8900, status: "pending" });
  const kidlat5 = product(kidlat.id, { category: "inverter", brand: "Kidlat", model: "KG-5K", title: "5 kW single-phase grid-tie inverter", description: "Demo product. Dual MPPT, Wi-Fi monitoring app.", specs: { ratedKw: 5, inverterType: "grid_tie", phase: "single" }, warranty: [10, null], backer: "Kidlat Power Trading service centre, Cebu", certs: "IEC 62109 (demo)", price: 52000 });
  product(kidlat.id, { category: "inverter", brand: "Kidlat", model: "KH-6K", title: "6 kW hybrid inverter (battery-ready)", description: "Demo product. Works with or without a battery.", specs: { ratedKw: 6, inverterType: "hybrid", phase: "single", batteryVoltageV: 48, communication: ["CAN", "RS485"], compatibleModels: ["IB-5.1"] }, warranty: [10, null], backer: "Kidlat Power Trading service centre, Cebu", certs: "IEC 62109 (demo)", price: 79000, lead: 10 });
  product(kidlat.id, { category: "inverter", brand: "Agos", model: "AG-3K", title: "3 kW compact grid-tie inverter", description: "Demo product for small homes.", specs: { ratedKw: 3, inverterType: "grid_tie", phase: "single" }, warranty: [5, null], backer: "Kidlat Power Trading", certs: "", price: null, stock: "made_to_order", lead: 14 });
  product(kidlat.id, { category: "battery", brand: "Agos", model: "AB-300", title: "51.2 V 300 Ah LiFePO4 floor battery", description: "Demo product. Floor-standing battery with wheels.", specs: { nominalVoltageV: 51.2, capacityAh: 300, chemistry: "LiFePO4", communication: ["CAN"] }, warranty: [8, null], backer: "Kidlat Power Trading", certs: "UN38.3 (demo)", price: 152500, lead: 7, inclusions: "BMS" });
  product(kidlat.id, { category: "battery", brand: "Agos", model: "AB-280", title: "51.2 V 280 Ah LiFePO4 battery", description: "Demo product.", specs: { nominalVoltageV: 51.2, capacityAh: 280, chemistry: "LiFePO4" }, warranty: [8, null], backer: "Kidlat Power Trading", certs: "", price: 139000, lead: 7, updated: 120 });
  product(kidlat.id, { category: "battery", brand: "Agos", model: "AB-48-300", title: "48 V 300 Ah LiFePO4 battery", description: "Demo product.", specs: { nominalVoltageV: 48, capacityAh: 300, chemistry: "LiFePO4" }, warranty: [8, null], backer: "Kidlat Power Trading", certs: "", price: null, stock: "made_to_order", lead: 21 });
  product(kidlat.id, { category: "accessory", brand: "Kidlat", model: "PV-4MM-100", title: "4 mm² PV cable, 100 m roll", description: "Demo product. UV-resistant DC solar cable.", specs: {}, warranty: [null, null], backer: "Kidlat Power Trading", certs: "", price: 6200, unit: "set" });
  product(kidlat.id, { category: "inverter", brand: "Kidlat", model: "KG-10K", title: "10 kW three-phase inverter", description: "Demo product. Rejected example.", specs: { ratedKw: 10, inverterType: "grid_tie", phase: "three" }, warranty: [10, null], backer: "", certs: "", price: 98000, status: "rejected", notes: "Please add who honours the warranty locally and attach the certificate." });
  product(tala.id, { category: "panel", brand: "Tala", model: "TL-500", title: "500 W mono panel", description: "Demo product from a pending supplier (hidden from the catalogue).", specs: { ratedPowerW: 500 }, warranty: [10, 25], backer: "Tala Energy Imports", certs: "", price: 6100, status: "pending" });

  // Link the existing demo quote to catalogue products so the comparison shows verified listings.
  db.prepare("UPDATE installer_quotes SET panel_product_id = ?, inverter_product_id = ?, panel_model = 'Sinag SN-550M', inverter_model = 'Kidlat KG-5K', equipment_supplier = 'Sinag Distribution PH and Kidlat Power Trading', inclusions = 'Panels, inverter, rails, DC/AC wiring, monitoring app setup, net-metering paperwork assistance' WHERE id = ?").run(sinag550, kidlat5, ids.quoteA1);

  // Installer trade-price request (private between installer and supplier).
  db.prepare(
    `INSERT INTO price_requests (id, installer_id, supplier_id, product_id, quote_request_id, quantity, message, status, unit_price_php, total_php,
       lead_time_days, supplier_note, valid_until, responded_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 8, 'For a Quezon City lead, delivery to Pasig warehouse pickup.', 'quoted', 6100, 48800, 5, 'Trade price for verified installers; pickup or Metro Manila delivery.', ?, ?, ?, ?)`,
  ).run(newId(), ids.installer1Id, sinag.id, sinag550, ids.requestAId, iso(-20).slice(0, 10), iso(2), iso(4), iso(2));

  // A buyer order already confirmed by the supplier.
  const orderId = newId();
  db.prepare(
    `INSERT INTO orders (id, customer_user_id, supplier_id, status, delivery_city, delivery_province, contact_name, contact_phone, installer_plan, installer_id,
       note, subtotal_php, delivery_fee_php, total_php, eta_date, supplier_note, created_at, updated_at)
     VALUES (?, ?, ?, 'confirmed', 'Quezon City', 'Metro Manila', 'Maria Santos', '+63 917 555 0101', 'platform_installer', ?, 'Spare panels to match our installer quote.',
       13900, 800, 14700, ?, 'Demo: pay by bank transfer to our official account; official receipt issued on payment.', ?, ?)`,
  ).run(orderId, ids.customerId, sinag.id, ids.installer1Id, iso(-6).slice(0, 10), iso(3), iso(1));
  db.prepare("INSERT INTO order_items (id, order_id, product_id, title, brand, model, quantity, unit_price_php, line_total_php) VALUES (?, ?, ?, '550 W mono half-cell panel', 'Sinag', 'SN-550M', 2, 6950, 13900)").run(newId(), orderId, sinag550);
  db.prepare("INSERT INTO order_events (id, order_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'customer', NULL, 'requested', 'Order request sent to Sinag Distribution PH', ?)").run(newId(), orderId, ids.customerId, iso(3));
  db.prepare("INSERT INTO order_events (id, order_id, actor_user_id, actor_role, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'supplier', 'requested', 'confirmed', 'Confirmed with ₱800 delivery', ?)").run(newId(), orderId, sinag.userId, iso(1));
  notify({ userId: ids.customerId, kind: "order", title: "Order update: Confirmed — arrange payment", body: "Sinag Distribution PH confirmed your equipment order.", href: `/app/orders/${orderId}`, daysAgo: 1 });
}

main();
if (pendingSurveySeed) {
  seedSurveys(pendingSurveySeed).catch((error) => {
    console.error("Survey demo seed failed:", error);
    process.exit(1);
  });
}


/* ----------------------------------------------------------------------------
 * Demo site surveys (labelled demo; placeholder images only)
 * ------------------------------------------------------------------------- */

function demoAnswers(type: SurveyType, complete: boolean): SurveyData {
  const template = currentTemplate(type);
  const data = emptySurveyData();
  let n = 0;
  for (const section of template.sections) {
    for (const item of section.items) {
      n += 1;
      if (!complete && n % 3 !== 0) continue;
      const values: Record<string, string | number | string[] | null> = {};
      for (const f of item.fields ?? []) {
        if (f.type === "number") values[f.key] = f.unit === "A" ? 60 : f.unit === "m" ? 18 : f.unit === "years" ? 8 : f.unit === "mm" ? 600 : 12;
        else if (f.type === "select") values[f.key] = f.options?.[0]?.value ?? null;
        else if (f.type === "multiselect") values[f.key] = f.options?.slice(-1).map((o) => o.value) ?? [];
        else if (f.type === "yesno") values[f.key] = "no";
        else values[f.key] = "Demo value";
      }
      const status = item.id === "roof_rafters" || item.id === "st_loading" ? "na" : item.id === "roof_condition" ? "issue" : "completed";
      if (item.id === "roof_condition") values.observed = ["rust"];
      data.items[item.id] = { status, note: status === "na" ? "Demo: not measured safely on this visit." : status === "issue" ? "Demo: surface rust on two GI sheets near the gutter." : "", values };
    }
  }
  data.roofPlanes = [
    { id: "p1", label: "North plane", usableAreaM2: 24, pitchDeg: 15, orientation: "north", notes: "Demo plane.", shadeMorning: "", shadeNoon: "", shadeAfternoon: "" },
    { id: "p2", label: "South plane", usableAreaM2: 18, pitchDeg: 15, orientation: "south", notes: "Water tank on the east edge.", shadeMorning: "", shadeNoon: "", shadeAfternoon: "" },
  ];
  return data;
}

async function placeholderJpeg(label: string, colour: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720"><rect width="100%" height="100%" fill="${colour}"/><text x="50%" y="46%" font-family="Arial" font-size="44" fill="#ffffff" text-anchor="middle">DEMO PLACEHOLDER</text><text x="50%" y="56%" font-family="Arial" font-size="32" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

async function seedSurveys(ids: NonNullable<typeof pendingSurveySeed>) {
  const insertSurvey = (input: { type: SurveyType; status: string; data: SurveyData; requestId: string; checkedIn: boolean; shared: boolean; daysAgo: number }) => {
    const id = newId();
    const t = iso(input.daysAgo);
    const year = new Date().getUTCFullYear();
    const seq = db.prepare("INSERT INTO survey_sequences (year, last) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last = last + 1 RETURNING last").get(year) as { last: number };
    const reference = `SRV-${year}-${String(seq.last).padStart(5, "0")}`;
    const site = db.prepare("SELECT s.* FROM quote_requests qr JOIN sites s ON s.id = qr.site_id WHERE qr.id = ?").get(input.requestId) as { id: string; address: string | null; city: string; province: string | null; utility_provider: string | null };
    const d = input.data.details;
    Object.assign(d, { clientName: "Maria Santos (demo)", clientPhone: "+63 917 555 0101", address: site.address ?? "Demo address", city: site.city, province: site.province ?? "", utility: site.utility_provider ?? "Meralco", surveyorName: "Ramon Dela Cruz", scheduledDate: t.slice(0, 10), visitType: "initial", purpose: "Demo survey for the SOLARekta pilot", interests: ["net_metering", "hybrid"], siteLat: 14.5764, siteLng: 121.0851, siteLocationSource: "device" });
    input.data.findings = { notes: input.status === "submitted" ? "Demo findings: roof suitable for a small system on two planes; minor rust to be treated before mounting." : "", recommendedKwp: input.status === "submitted" ? 6 : null, nextSteps: input.status === "submitted" ? "Send quotation after technical review." : "" };
    const checkIn = input.checkedIn ? JSON.stringify({ outcome: "ok", device: { lat: 14.5766, lng: 121.0849, accuracy: 12 }, distance: 31, geofenceMeters: 300, deviceTime: t }) : null;
    db.prepare(
      `INSERT INTO site_surveys (id, reference, type, template_version, installer_id, created_by, customer_user_id, site_id, quote_request_id, status, revision, version, data_json, client_name, site_label, surveyor_name,
         scheduled_date, checked_in_at, check_in_json, checked_out_at, location_status, shared_with_customer, submitted_at, is_demo, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, reference, input.type, currentTemplate(input.type).version, ids.installer1Id, ids.installer1UserId, ids.customerId, site.id, input.requestId, input.status, JSON.stringify(input.data), d.clientName, [d.address, d.city].filter(Boolean).join(", "), d.surveyorName, d.scheduledDate, input.checkedIn ? t : null, checkIn, input.checkedIn ? iso(input.daysAgo, -2) : null, input.checkedIn ? "consistent" : "not_recorded", input.shared ? 1 : 0, input.status === "submitted" ? iso(input.daysAgo - 1) : null, ids.installer1UserId, t, t);
    const event = (type: string, message: string, daysAgo: number) => db.prepare("INSERT INTO survey_events (id, survey_id, actor_user_id, type, message, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(newId(), id, ids.installer1UserId, type, message, iso(daysAgo));
    event("created", "Demo survey created.", input.daysAgo + 1);
    if (input.checkedIn) {
      event("visit_started", "Site visit started.", input.daysAgo);
      event("visit_finished", "Site visit finished.", input.daysAgo);
    }
    return id;
  };

  insertSurvey({ type: "commercial", status: "in_progress", data: demoAnswers("commercial", false), requestId: ids.requestBId, checkedIn: false, shared: false, daysAgo: 1 });
  const submittedId = insertSurvey({ type: "residential", status: "submitted", data: demoAnswers("residential", true), requestId: ids.requestAId, checkedIn: true, shared: true, daysAgo: 3 });

  const dir = path.join(uploadRoot, "surveys", submittedId);
  fs.mkdirSync(dir, { recursive: true });
  const evidenceIds: string[] = [];
  for (const [category, label, colour, itemId] of [["site_frontage", "Frontage", "#12601c", "ph_frontage"], ["roof_overview", "Roof overview", "#0b4012", "ph_roof_planes"]] as const) {
    const eid = newId();
    const original = await placeholderJpeg(label, colour);
    fs.writeFileSync(path.join(dir, `${eid}.jpg`), original);
    await sharp(original).resize({ width: 640 }).webp({ quality: 70 }).toFile(path.join(dir, `${eid}.thumb.webp`));
    db.prepare(
      `INSERT INTO survey_evidence (id, survey_id, uploader_user_id, client_key, kind, category, caption, item_id, mime_type, size_bytes, sha256, storage_key, original_name, thumb_storage_key, thumb_source, width, height,
         capture_source, location_source, uploaded_at, status, review_status)
       VALUES (?, ?, ?, ?, 'photo', ?, ?, ?, 'image/jpeg', ?, ?, ?, ?, ?, 'server', 960, 720, 'unknown', 'none', ?, 'active', 'pending')`,
    ).run(eid, submittedId, ids.installer1UserId, `demo_${eid.replace(/-/g, "")}`, category, `Demo placeholder — ${label}`, itemId, original.length, sha256(original), `surveys/${submittedId}/${eid}.jpg`, `demo-${category}.jpg`, `surveys/${submittedId}/${eid}.thumb.webp`, iso(3));
    evidenceIds.push(eid);
  }
  const row = db.prepare("SELECT data_json FROM site_surveys WHERE id = ?").get(submittedId) as { data_json: string };
  db.prepare("INSERT INTO survey_revisions (id, survey_id, revision, status, data_json, evidence_ids_json, changed_fields_json, reason, created_by, created_at) VALUES (?, ?, 1, 'submitted', ?, ?, '[]', 'Submitted for review (demo)', ?, ?)").run(newId(), submittedId, row.data_json, JSON.stringify(evidenceIds), ids.installer1UserId, iso(2));
  db.prepare("INSERT INTO survey_events (id, survey_id, actor_user_id, type, message, created_at) VALUES (?, ?, ?, 'submitted', 'Revision 1 submitted for technical review.', ?)").run(newId(), submittedId, ids.installer1UserId, iso(2));
  notify({ userId: ids.adminId, kind: "survey", title: "Site survey submitted", body: "A demo residential survey is ready for review.", href: `/admin/surveys/${submittedId}`, daysAgo: 2 });
  console.log("  Site surveys: 1 commercial in progress, 1 residential submitted (demo, placeholder photos).");
}
