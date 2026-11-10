import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { saveSurvey, surveyAccess } from "@/lib/survey/data";
import { surveyDataSchema } from "@/lib/survey/model";

export const runtime = "nodejs";

/**
 * Autosave. Body: { version, data }. Returns the new version, or 409 with the stored copy when
 * someone saved in between (the client then offers a conflict resolution), or 423 when the
 * survey is no longer editable.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { id } = await params;
  const access = surveyAccess(user, id);
  if (!access || access.role !== "surveyor") return NextResponse.json({ error: "Survey not found." }, { status: 404 });
  if (!rateLimit(`survey-save:${user.id}`, 240, 10 * 60_000).ok) return NextResponse.json({ error: "Saving too often. Wait a moment." }, { status: 429 });
  const raw = await request.text();
  if (raw.length > 400_000) return NextResponse.json({ error: "Survey is too large to save." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }
  const version = Number((body as { version?: unknown })?.version);
  const parsed = surveyDataSchema.safeParse((body as { data?: unknown })?.data);
  if (!Number.isInteger(version) || !parsed.success) return NextResponse.json({ error: "Some values are not valid. Check numbers and lengths." }, { status: 400 });
  const result = saveSurvey(id, user.id, version, parsed.data);
  if (result.ok) return NextResponse.json(result);
  if (result.reason === "conflict") return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ...result, error: "This survey has been submitted. Reopen it to make changes." }, { status: 423 });
}
