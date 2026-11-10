import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSameOrigin } from "@/lib/same-origin";
import { getEvidence, surveyAccess } from "@/lib/survey/data";
import { EvidenceUploadError, storeVideoPoster } from "@/lib/survey/storage";

export const runtime = "nodejs";

/** Stores a preview frame the uploading device extracted from a video (labelled device-generated). */
export async function POST(request: Request, { params }: { params: Promise<{ eid: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { eid } = await params;
  const evidence = getEvidence(eid);
  if (!evidence || evidence.kind !== "video") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const access = surveyAccess(user, evidence.survey_id);
  if (!access || access.role !== "surveyor") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (evidence.thumb_storage_key) return NextResponse.json({ ok: true });
  const declared = Number(request.headers.get("content-length"));
  if (declared > 3 * 1024 * 1024) return NextResponse.json({ error: "Preview too large." }, { status: 413 });
  try {
    await storeVideoPoster(evidence, Buffer.from(await request.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EvidenceUploadError ? error.message : "Preview not saved." }, { status: error instanceof EvidenceUploadError ? error.status : 500 });
  }
}
