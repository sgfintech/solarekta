import fs from "node:fs/promises";
import { getSessionUser } from "@/lib/auth";
import { getFile, filePathFor } from "@/lib/files";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/** A datasheet attached to an approved product of a verified supplier is public. Nothing else is. */
function isPublicDatasheet(fileId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM products p JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.datasheet_file_id = ? AND p.status = 'approved' AND s.verification_status = 'verified'`,
      )
      .get(fileId),
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;
  const file = getFile(id);
  if (!file) return new Response("Not found", { status: user ? 404 : 401 });
  const publicDatasheet = file.purpose === "product_datasheet" && isPublicDatasheet(file.id);
  if (!publicDatasheet) {
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (file.owner_user_id !== user.id && user.role !== "admin") {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePathFor(file.storage_key));
  } catch {
    return new Response("File unavailable", { status: 404 });
  }

  logAudit({
    actorUserId: user?.id ?? null,
    actorRole: user?.role ?? "public",
    action: "file.accessed",
    entityType: "file",
    entityId: file.id,
    metadata: { purpose: file.purpose },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime_type,
      "Content-Length": String(file.size_bytes),
      "Content-Disposition": `inline; filename="${file.original_name.replace(/["\\]/g, "_")}"`,
      "Cache-Control": publicDatasheet ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
