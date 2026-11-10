import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { logAudit } from "@/lib/audit";
import { addEvent, surveyAccess } from "@/lib/survey/data";
import { EDITABLE } from "@/lib/survey/model";
import { EvidenceUploadError, storeEvidence, type UploadMeta } from "@/lib/survey/storage";
import { evidenceView } from "@/lib/survey/view";

export const runtime = "nodejs";

const num = (v: string | null, min: number, max: number) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const text = (v: string | null, max: number) => (v ?? "").slice(0, max);
const isoOrNull = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/**
 * Streams one evidence file into private storage. Metadata travels in the query string; the
 * request body is the raw file. Retries with the same `clientKey` return the existing record.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { id } = await params;
  const access = surveyAccess(user, id);
  if (!access || access.role !== "surveyor") return NextResponse.json({ error: "Survey not found." }, { status: 404 });
  if (!EDITABLE.includes(access.survey.status)) return NextResponse.json({ error: "This survey is submitted. Reopen it to add evidence." }, { status: 409 });
  if (!rateLimit(`survey-upload:${user.id}`, 120, 10 * 60_000).ok) return NextResponse.json({ error: "Too many uploads. Wait a few minutes." }, { status: 429 });
  if (!request.body) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const q = new URL(request.url).searchParams;
  const captureSource = q.get("source");
  const meta: UploadMeta = {
    clientKey: text(q.get("key"), 64),
    category: text(q.get("category"), 40),
    caption: text(q.get("caption"), 300),
    itemId: q.get("item") ? text(q.get("item"), 60) : null,
    planeId: q.get("plane") ? text(q.get("plane"), 40) : null,
    originalName: text(q.get("name"), 200) || "upload",
    captureSource: captureSource === "in_app_camera" || captureSource === "file_upload" ? captureSource : "unknown",
    capturedAt: isoOrNull(q.get("capturedAt")),
    capturedAtSource: q.get("capturedAtSource") === "device_file" ? "device_file" : q.get("capturedAt") ? "device_clock" : null,
    lat: num(q.get("lat"), -90, 90),
    lng: num(q.get("lng"), -180, 180),
    accuracy: num(q.get("accuracy"), 0, 100000),
    durationSec: num(q.get("duration"), 0, 86400),
  };
  if (meta.lat == null || meta.lng == null) {
    meta.lat = null;
    meta.lng = null;
    meta.accuracy = null;
  }
  const declared = Number(request.headers.get("content-length"));
  try {
    const { evidence, duplicate } = await storeEvidence({ surveyId: id, userId: user.id, meta, body: request.body, declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null });
    if (!duplicate) {
      addEvent(id, user.id, "evidence_added", `${evidence.kind === "video" ? "Video" : evidence.kind === "document" ? "Document" : "Photo"} added (${evidence.category.replace(/_/g, " ")}).`, { evidenceId: evidence.id });
      logAudit({ actorUserId: user.id, actorRole: user.role, action: "survey.evidence_added", entityType: "survey", entityId: id, metadata: { evidenceId: evidence.id, kind: evidence.kind, bytes: evidence.size_bytes } });
    }
    return NextResponse.json({ evidence: evidenceView(evidence, "surveyor"), duplicate }, { status: duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof EvidenceUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("survey upload failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The upload could not be saved. Try again." }, { status: 500 });
  }
}
