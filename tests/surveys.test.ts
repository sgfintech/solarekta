import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { parseEvidenceRequirements } from "@/lib/survey/config";
import { allItems, currentTemplate, getTemplate, TEMPLATES } from "@/lib/survey/templates";
import {
  assessLocation,
  canTransition,
  changedFields,
  contradictionChecks,
  distanceMeters,
  emptySurveyData,
  progress,
  reopenCreatesRevision,
  submissionChecks,
  surveyDataSchema,
  surveyReference,
  type EvidenceSummary,
  type SurveyData,
  type VisitState,
} from "@/lib/survey/model";

const visitOk: VisitState = { checkedInAt: "2026-11-10T01:00:00Z", checkedOutAt: "2026-11-10T02:00:00Z", locationStatus: "consistent", exceptionApproved: false, exceptionReason: null };
const reqs = parseEvidenceRequirements(undefined);

function completeData(type: "residential" | "commercial"): SurveyData {
  const data = emptySurveyData();
  Object.assign(data.details, { clientName: "Client", address: "1 Street", utility: "Meralco", surveyorName: "Surveyor", siteLat: 14.5, siteLng: 121 });
  for (const item of allItems(currentTemplate(type))) data.items[item.id] = { status: "completed", note: "", values: {} };
  data.roofPlanes = [{ id: "p1", label: "North", usableAreaM2: 20, pitchDeg: 10, orientation: "north", notes: "", shadeMorning: "", shadeNoon: "", shadeAfternoon: "" }];
  data.findings = { notes: "Findings", recommendedKwp: 4, nextSteps: "Quote" };
  return data;
}
const photos: EvidenceSummary[] = [
  { id: "a", category: "site_frontage", kind: "photo", itemId: null, planeId: null, reviewStatus: "pending" },
  { id: "b", category: "roof_overview", kind: "photo", itemId: null, planeId: null, reviewStatus: "pending" },
];

describe("templates", () => {
  it("are versioned with unique item ids per template", () => {
    for (const t of TEMPLATES) {
      const ids = allItems(t).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(t.version).toMatch(/^(res|com)-\d{4}\.\d{2}\.\d+$/);
    }
    expect(getTemplate("commercial", "com-2026.11.1").id).toBe("commercial");
    expect(getTemplate("residential", "unknown-version").version).toBe(currentTemplate("residential").version);
    expect(currentTemplate("commercial").sections.some((s) => s.engineerReview)).toBe(true);
  });

  it("measures progress from the template, not a fixed count", () => {
    const data = emptySurveyData();
    const total = allItems(currentTemplate("residential")).length;
    expect(progress(currentTemplate("residential"), data)).toMatchObject({ answered: 0, total, percent: 0 });
    data.items.site_pin = { status: "na", note: "remote", values: {} };
    data.items.roof_age = { status: "completed", note: "", values: { years: 8 } };
    const p = progress(currentTemplate("residential"), data);
    expect(p.answered).toBe(2);
    expect(p.sections.find((s) => s.sectionId === "roof")?.answered).toBe(1);
  });
});

describe("submission checks", () => {
  it("passes a complete survey with required evidence", () => {
    const issues = submissionChecks({ template: currentTemplate("residential"), data: completeData("residential"), evidence: photos, requirements: reqs, visit: visitOk, requireCheckIn: true });
    expect(issues.filter((i) => i.severity === "blocker")).toEqual([]);
  });

  it("blocks missing required answers, explanations, planes and evidence", () => {
    const data = completeData("residential");
    data.items.roof_age = { status: "not_assessed", note: "", values: {} };
    data.items.roof_condition = { status: "issue", note: " ", values: {} };
    data.items.site_access = { status: "na", note: "", values: {} };
    data.items.site_offline_map = { status: "na", note: "", values: {} };
    data.roofPlanes = [];
    data.details.siteLat = null;
    const issues = submissionChecks({ template: currentTemplate("residential"), data, evidence: [photos[0]], requirements: reqs, visit: visitOk, requireCheckIn: true });
    const blockers = issues.filter((i) => i.severity === "blocker").map((i) => i.message);
    expect(blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Roof age.*not been assessed/),
        expect.stringMatching(/Explain the issue found for “Roof condition/),
        expect.stringMatching(/why “Ladder, access and parking checked” is not applicable/),
        "Add at least one roof plane with its usable area.",
        "Save the site's GPS pin, or enter coordinates manually.",
        expect.stringMatching(/Roof overview/),
      ]),
    );
    // Offline map allows "Not applicable" without a reason.
    expect(blockers.join(" ")).not.toMatch(/Offline map/);
  });

  it("separates checklist status from values: completed with an empty value is a warning, not a value", () => {
    const data = completeData("residential");
    const issues = submissionChecks({ template: currentTemplate("residential"), data, evidence: photos, requirements: reqs, visit: visitOk, requireCheckIn: true });
    expect(issues.some((i) => i.severity === "warning" && /Main breaker checked.*main breaker rating is empty/.test(i.message))).toBe(true);
  });

  it("does not count rejected evidence toward requirements", () => {
    const issues = submissionChecks({ template: currentTemplate("residential"), data: completeData("residential"), evidence: [photos[0], { ...photos[1], reviewStatus: "rejected" }], requirements: reqs, visit: visitOk, requireCheckIn: true });
    expect(issues.some((i) => i.severity === "blocker" && /Roof overview/.test(i.message))).toBe(true);
  });

  it("turns location problems into review flags, never lost work", () => {
    const data = completeData("residential");
    const denied = submissionChecks({ template: currentTemplate("residential"), data, evidence: photos, requirements: reqs, visit: { ...visitOk, locationStatus: "denied" }, requireCheckIn: true });
    expect(denied.filter((i) => i.severity === "blocker")).toEqual([]);
    expect(denied.some((i) => i.where === "visit" && i.severity === "warning")).toBe(true);
    const noVisit = submissionChecks({ template: currentTemplate("residential"), data, evidence: photos, requirements: reqs, visit: { ...visitOk, checkedInAt: null, checkedOutAt: null }, requireCheckIn: true });
    expect(noVisit.some((i) => i.severity === "blocker" && /Start the site visit/.test(i.message))).toBe(true);
    data.details.actualVisitAt = "2026-11-10T09:00";
    const manual = submissionChecks({ template: currentTemplate("residential"), data, evidence: photos, requirements: reqs, visit: { ...visitOk, checkedInAt: null, checkedOutAt: null }, requireCheckIn: true });
    expect(manual.filter((i) => i.severity === "blocker")).toEqual([]);
  });

  it("parses configurable evidence requirements", () => {
    expect(parseEvidenceRequirements("site_frontage:2,walkthrough_video:1,bogus:3")).toEqual([
      { category: "site_frontage", min: 2, kind: "any" },
      { category: "walkthrough_video", min: 1, kind: "any" },
    ]);
    expect(parseEvidenceRequirements("none")).toEqual([]);
  });
});

describe("contradiction checks", () => {
  it("flags disagreeing answers without changing them", () => {
    const data = completeData("commercial");
    data.items.st_review_required = { status: "completed", note: "", values: { required: "no" } };
    data.items.st_corrosion = { status: "completed", note: "", values: { observed: ["corrosion"] } };
    data.items.st_loading = { status: "completed", note: "", values: { assumption: "0.15 kPa" } };
    data.items.elec_transformer = { status: "completed", note: "", values: { available: 200 } };
    data.findings.recommendedKwp = 100;
    const before = JSON.stringify(data);
    const out = contradictionChecks("commercial", data);
    expect(out.join(" ")).toMatch(/structural review is marked not required/);
    expect(out.join(" ")).toMatch(/loading assumption is recorded without its source/);
    expect(out.join(" ")).toMatch(/transformer capacity is recorded but not marked as verified/);
    expect(out.join(" ")).toMatch(/needs much more area/);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("workflow and revisions", () => {
  it("allows only the documented transitions per actor", () => {
    expect(canTransition("draft", "in_progress", "surveyor")).toBe(true);
    expect(canTransition("in_progress", "submitted", "surveyor")).toBe(true);
    expect(canTransition("submitted", "under_review", "reviewer")).toBe(true);
    expect(canTransition("submitted", "approved", "reviewer")).toBe(false);
    expect(canTransition("under_review", "approved", "reviewer")).toBe(true);
    expect(canTransition("under_review", "approved", "surveyor")).toBe(false);
    expect(canTransition("approved", "in_progress", "surveyor")).toBe(true);
    expect(canTransition("approved", "submitted", "surveyor")).toBe(false);
    expect(reopenCreatesRevision("approved")).toBe(true);
    expect(reopenCreatesRevision("changes_requested")).toBe(false);
    expect(surveyReference(2026, 42)).toBe("SRV-2026-00042");
  });

  it("lists changed fields between snapshots", () => {
    const a = completeData("residential");
    const b = structuredClone(a);
    b.details.utility = "VECO";
    b.items.roof_age = { status: "completed", note: "", values: { years: 12 } };
    expect(changedFields(a, b)).toEqual(["details.utility", "items.roof_age"]);
  });

  it("rejects malformed or oversized data", () => {
    expect(surveyDataSchema.safeParse({ roofPlanes: [{ id: "x", pitchDeg: 120 }] }).success).toBe(false);
    expect(surveyDataSchema.safeParse({ findings: { notes: "x".repeat(9000) } }).success).toBe(false);
  });
});

describe("location", () => {
  const site = { lat: 14.5764, lng: 121.0851 };
  it("computes distance and statuses", () => {
    expect(distanceMeters(site, { lat: 14.5766, lng: 121.0849 })).toBeGreaterThan(20);
    expect(distanceMeters(site, { lat: 14.5766, lng: 121.0849 })).toBeLessThan(40);
    const base = { site, geofenceMeters: 300, maxAccuracyMeters: 100 };
    expect(assessLocation({ ...base, device: { lat: 14.5766, lng: 121.0849, accuracy: 10 }, outcome: "ok" }).status).toBe("consistent");
    expect(assessLocation({ ...base, device: { lat: 14.6, lng: 121.1, accuracy: 10 }, outcome: "ok" }).status).toBe("inconsistent");
    expect(assessLocation({ ...base, device: { lat: 14.5766, lng: 121.0849, accuracy: 500 }, outcome: "ok" }).status).toBe("low_accuracy");
    expect(assessLocation({ ...base, device: null, outcome: "denied" }).status).toBe("denied");
    expect(assessLocation({ ...base, site: { lat: null, lng: null }, device: { lat: 1, lng: 1, accuracy: 5 }, outcome: "ok" }).status).toBe("no_site_pin");
  });
});

/* --------------------------------------------------------------------------
 * Server modules against a temporary database and upload folder
 * ----------------------------------------------------------------------- */

let tempDir: string;
let database: import("better-sqlite3").Database;
let data: typeof import("@/lib/survey/data");
let storage: typeof import("@/lib/survey/storage");
let view: typeof import("@/lib/survey/view");
let ai: typeof import("@/lib/survey/ai");
let provider: typeof import("@/lib/ai/provider");

const U = {
  inst1: "50000000-0000-4000-8000-000000000001",
  inst2: "50000000-0000-4000-8000-000000000002",
  admin: "50000000-0000-4000-8000-000000000003",
  cust: "50000000-0000-4000-8000-000000000004",
  other: "50000000-0000-4000-8000-000000000005",
};
const I1 = "60000000-0000-4000-8000-000000000001";
const I2 = "60000000-0000-4000-8000-000000000002";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d20000000049454e44ae426082", "hex");
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solarekta-survey-test-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.db");
  process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
  delete process.env.AI_PROVIDER;
  ({ db: database } = await import("@/lib/db"));
  data = await import("@/lib/survey/data");
  storage = await import("@/lib/survey/storage");
  view = await import("@/lib/survey/view");
  ai = await import("@/lib/survey/ai");
  provider = await import("@/lib/ai/provider");
  const t = new Date().toISOString();
  for (const [id, role] of [[U.inst1, "installer"], [U.inst2, "installer"], [U.admin, "admin"], [U.cust, "customer"], [U.other, "customer"]]) {
    database.prepare("INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'h', 'User', ?, 'active', ?, ?)").run(id, `${id}@x.ph`, role, t, t);
  }
  for (const [id, uid, slug] of [[I1, U.inst1, "one"], [I2, U.inst2, "two"]]) {
    database.prepare("INSERT INTO installers (id, user_id, business_name, slug, verification_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'verified', ?, ?)").run(id, uid, `Installer ${slug}`, slug, t, t);
  }
});

afterAll(() => {
  database?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const meta = (key: string, extra: Partial<import("@/lib/survey/storage").UploadMeta> = {}): import("@/lib/survey/storage").UploadMeta => ({
  clientKey: key,
  category: "site_frontage",
  caption: "Front",
  itemId: null,
  planeId: null,
  originalName: "../../etc/front<script>.png",
  captureSource: "in_app_camera",
  capturedAt: "2026-11-10T01:00:00.000Z",
  capturedAtSource: "device_file",
  lat: 14.5,
  lng: 121,
  accuracy: 8,
  durationSec: null,
  ...extra,
});

describe("survey access control", () => {
  it("scopes surveys to the owning installer, admins and shared customers", () => {
    const s = data.createSurvey({ type: "residential", installerId: I1, userId: U.inst1, data: completeData("residential"), customerUserId: U.cust });
    expect(s.reference).toMatch(/^SRV-\d{4}-\d{5}$/);
    expect(data.surveyAccess({ id: U.inst1, role: "installer" }, s.id)?.role).toBe("surveyor");
    expect(data.surveyAccess({ id: U.inst2, role: "installer" }, s.id)).toBeNull();
    expect(data.surveyAccess({ id: U.admin, role: "admin" }, s.id)?.role).toBe("reviewer");
    expect(data.surveyAccess({ id: U.cust, role: "customer" }, s.id)).toBeNull();
    database.prepare("UPDATE site_surveys SET shared_with_customer = 1 WHERE id = ?").run(s.id);
    expect(data.surveyAccess({ id: U.cust, role: "customer" }, s.id)?.role).toBe("customer");
    expect(data.surveyAccess({ id: U.other, role: "customer" }, s.id)).toBeNull();
    expect(data.listSurveys({ installerId: I2 })).toHaveLength(0);
    expect(data.listSurveys({ installerId: I1 }).map((r) => r.id)).toContain(s.id);
    expect(data.listSurveys({ customerUserId: U.other })).toHaveLength(0);
    expect(data.listSurveys({})).toEqual([]);
  });
});

describe("autosave with version checks", () => {
  it("saves, reports conflicts with the stored copy, and locks after submission", () => {
    const s = data.createSurvey({ type: "residential", installerId: I1, userId: U.inst1, data: emptySurveyData() });
    const edited = emptySurveyData();
    edited.items.roof_age = { status: "completed", note: "", values: { years: 5 } };
    const first = data.saveSurvey(s.id, U.inst1, 1, edited);
    expect(first).toMatchObject({ ok: true, version: 2, status: "in_progress" });
    const stale = data.saveSurvey(s.id, U.inst1, 1, emptySurveyData());
    expect(stale.ok).toBe(false);
    if (!stale.ok && stale.reason === "conflict") expect(stale.current.data.items.roof_age?.values.years).toBe(5);
    database.prepare("UPDATE site_surveys SET status = 'submitted' WHERE id = ?").run(s.id);
    expect(data.saveSurvey(s.id, U.inst1, 2, edited)).toMatchObject({ ok: false, reason: "locked" });
  });
});

describe("evidence uploads", () => {
  let surveyId: string;
  beforeAll(() => {
    surveyId = data.createSurvey({ type: "residential", installerId: I1, userId: U.inst1, data: emptySurveyData() }).id;
  });
  const tmpFiles = () => (fs.existsSync(path.join(process.env.UPLOAD_DIR!, "tmp")) ? fs.readdirSync(path.join(process.env.UPLOAD_DIR!, "tmp")) : []);

  it("stores, hashes, labels and registers a photo; retries return the same record", async () => {
    const first = await storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_photo_0001"), body: Readable.from(PNG), declaredBytes: PNG.length });
    expect(first.duplicate).toBe(false);
    expect(first.evidence).toMatchObject({ kind: "photo", mime_type: "image/png", size_bytes: PNG.length, capture_source: "in_app_camera", location_source: "device_gps", review_status: "pending" });
    expect(first.evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.evidence.original_name).not.toMatch(/[/<>]/);
    expect(fs.existsSync(storage.evidencePath(first.evidence.storage_key))).toBe(true);
    const retry = await storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_photo_0001"), body: Readable.from(PNG), declaredBytes: PNG.length });
    expect(retry.duplicate).toBe(true);
    expect(retry.evidence.id).toBe(first.evidence.id);
    expect((database.prepare("SELECT COUNT(*) AS c FROM survey_evidence WHERE survey_id = ?").get(surveyId) as { c: number }).c).toBe(1);
  });

  it("rejects disguised files and oversized uploads without leaving partial files", async () => {
    const script = Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " "));
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_bad_00001"), body: Readable.from(script), declaredBytes: script.length })).rejects.toThrow(/Only photos/);
    const limits = { ...(await import("@/lib/survey/config")).serverLimits(), photoBytes: 100 };
    const big = Buffer.concat([JPEG_HEAD, Buffer.alloc(500)]);
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_big_00001"), body: Readable.from([big.subarray(0, 20), big.subarray(20)]), declaredBytes: null, limits })).rejects.toThrow(/larger than/);
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("x"), body: Readable.from(PNG), declaredBytes: PNG.length })).rejects.toThrow(/upload key/);
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_cat_00001", { category: "selfie" }), body: Readable.from(PNG), declaredBytes: PNG.length })).rejects.toThrow(/category/);
    expect(tmpFiles()).toEqual([]);
    expect((database.prepare("SELECT COUNT(*) AS c FROM survey_evidence WHERE survey_id = ?").get(surveyId) as { c: number }).c).toBe(1);
  });

  it("enforces the per-survey file count", async () => {
    const limits = { ...(await import("@/lib/survey/config")).serverLimits(), maxEvidencePerSurvey: 1 };
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_count_0001"), body: Readable.from(PNG), declaredBytes: PNG.length, limits })).rejects.toThrow(/maximum/);
  });

  it("reads MP4 duration on the server and enforces the length limit", async () => {
    const mvhd = Buffer.alloc(32);
    mvhd.write("mvhd", 0, "latin1");
    mvhd.writeUInt8(0, 4);
    mvhd.writeUInt32BE(1000, 16);
    mvhd.writeUInt32BE(125_000, 20);
    expect(storage.mvhdDuration(mvhd)).toBe(125);
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom", "latin1"), Buffer.alloc(12), Buffer.from([0, 0, 0, 40, 0x6d, 0x6f, 0x6f, 0x76]), Buffer.from([0, 0, 0, 32]), mvhd]);
    const ok = await storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_video_0001", { category: "walkthrough_video", durationSec: 3 }), body: Readable.from(mp4), declaredBytes: mp4.length });
    expect(ok.evidence).toMatchObject({ kind: "video", mime_type: "video/mp4", duration_sec: 125, duration_source: "server" });
    const limits = { ...(await import("@/lib/survey/config")).serverLimits(), videoSeconds: 60 };
    await expect(storage.storeEvidence({ surveyId, userId: U.inst1, meta: meta("key_video_0002", { category: "walkthrough_video" }), body: Readable.from(mp4), declaredBytes: mp4.length, limits })).rejects.toThrow(/longer than/);
  });

  it("hides device metadata from customers and keeps submitted evidence", async () => {
    const row = data.listEvidence(surveyId)[0];
    expect(view.evidenceView(row, "surveyor").location).toEqual({ lat: 14.5, lng: 121, accuracy: 8 });
    const customerView = view.evidenceView(row, "customer");
    expect(customerView.location).toBeNull();
    expect(customerView.sha256).toBeNull();
    expect(customerView.capturedAt).toBeNull();
    expect(data.evidenceInRevision(surveyId, row.id)).toBe(false);
    data.snapshotRevision(database.prepare("SELECT * FROM site_surveys WHERE id = ?").get(surveyId) as import("@/lib/survey/data").SurveyRow, U.inst1, "Submitted");
    expect(data.evidenceInRevision(surveyId, row.id)).toBe(true);
  });

  it("identifies content by signature, never by name", () => {
    expect(storage.sniffContent(JPEG_HEAD)?.mime).toBe("image/jpeg");
    expect(storage.sniffContent(Buffer.from("%PDF-1.7\n".padEnd(16, " ")))?.kind).toBe("document");
    expect(storage.sniffContent(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypqt  ", "latin1"), Buffer.alloc(4)]))?.mime).toBe("video/quicktime");
    expect(storage.sniffContent(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe("video/webm");
    expect(storage.sniffContent(Buffer.from("GIF89a".padEnd(16, " ")))).toBeNull();
    expect(storage.exifDateTimeOriginal(Buffer.from("Exif..2026:11:01 08:00:00...2026:11:01 07:59:58", "latin1"))).toBe("2026-11-01T07:59:58");
  });
});

describe("AI assistance", () => {
  const facts = { roofPlanes: [{ usableAreaM2: 20 }], findings: { recommendedKwp: 4 } };
  it("accepts grounded suggestions and rejects invented numbers or verification claims", () => {
    expect(ai.validateAssist({ summary: "Usable roof area of 20 m² supports about 4 kWp, subject to technical review.", customerSummary: "Your roof was inspected and findings will be reviewed." }, facts)).not.toBeNull();
    expect(ai.validateAssist({ summary: "The roof has 35 m² usable area and supports 6 kWp easily.", customerSummary: "Your roof was inspected and findings will be reviewed." }, facts)).toBeNull();
    expect(ai.validateAssist({ summary: "The roof is structurally sound for 4 kWp per the survey.", customerSummary: "Your roof was inspected and findings will be reviewed." }, facts)).toBeNull();
    expect(ai.validateAssist({ summary: "Usable roof area of 20 m² noted for review purposes.", customerSummary: "Your installation is approved and compliant." }, facts)).toBeNull();
  });

  it("sends no names, phone numbers, addresses or coordinates", () => {
    const s = data.createSurvey({ type: "residential", installerId: I1, userId: U.inst1, data: (() => { const d = completeData("residential"); d.details.clientName = "Juan Secret"; d.details.clientPhone = "09171234567"; return d; })() });
    const json = JSON.stringify(ai.surveyFacts(s));
    expect(json).not.toMatch(/Juan Secret|09171234567|1 Street|14\.5|"siteLat"/);
  });

  it("works without AI and falls back when the provider fails", async () => {
    const s = data.createSurvey({ type: "residential", installerId: I1, userId: U.inst1, data: completeData("residential") });
    const off = await ai.generateSurveyAssist(s, U.inst1);
    expect(off).toMatchObject({ ok: false });
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test";
    provider.__setAiTestHooks({ fetch: async () => new Response("down", { status: 503 }), sleep: async () => undefined });
    const failed = await ai.generateSurveyAssist(s, U.inst1);
    expect(failed.ok).toBe(false);
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });
});
