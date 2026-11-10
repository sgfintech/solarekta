import { getSessionUser } from "@/lib/auth";
import { getEvidence, surveyAccess } from "@/lib/survey/data";
import { fileResponse } from "@/lib/survey/storage";

export const runtime = "nodejs";

/**
 * Serves evidence only to users with access to its survey. Customers (on surveys shared with
 * them) never receive signature images. `?v=thumb` returns the derived preview when available.
 */
export async function GET(request: Request, { params }: { params: Promise<{ eid: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { eid } = await params;
  const evidence = getEvidence(eid);
  if (!evidence) return new Response("Not found", { status: 404 });
  const access = surveyAccess(user, evidence.survey_id);
  if (!access) return new Response("Not found", { status: 404 });
  if (access.role === "customer" && (evidence.kind === "signature" || evidence.status !== "active" || evidence.review_status === "rejected")) return new Response("Not found", { status: 404 });

  const variant = new URL(request.url).searchParams.get("v");
  if (variant === "thumb" && evidence.thumb_storage_key) {
    const mime = evidence.thumb_storage_key.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return fileResponse(evidence.thumb_storage_key, mime, `preview-${evidence.original_name}`, null, "inline");
  }
  const download = variant === "download";
  return fileResponse(evidence.storage_key, evidence.mime_type, evidence.original_name, request.headers.get("range"), download ? "attachment" : "inline");
}
