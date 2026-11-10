import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { newId, nowIso, sha256 } from "@/lib/ids";
import type { FileRow } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (bytes: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 4).toString() === "%PDF" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: "png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
];

export function uploadDir() {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "var", "uploads");
}

export class UploadError extends Error {}

export async function saveUpload(file: File, ownerUserId: string, purpose = "bill"): Promise<FileRow> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    throw new UploadError("Choose a file to upload.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("File is larger than 8 MB. Compress the image or upload a smaller PDF.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = SIGNATURES.find((s) => s.test(buffer));
  if (!signature) {
    throw new UploadError("Only PDF, JPG, PNG or WEBP bill files are accepted.");
  }

  const id = newId();
  const storageKey = path.posix.join(new Date().toISOString().slice(0, 7), `${id}.${signature.ext}`);
  const destination = path.join(uploadDir(), storageKey);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer, { flag: "wx" });

  const row: FileRow = {
    id,
    owner_user_id: ownerUserId,
    storage_key: storageKey,
    original_name: sanitizeName(file.name || `bill.${signature.ext}`),
    mime_type: signature.mime,
    size_bytes: buffer.length,
    sha256: sha256(buffer),
    purpose,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO files (id, owner_user_id, storage_key, original_name, mime_type, size_bytes, sha256, purpose, created_at)
     VALUES (@id, @owner_user_id, @storage_key, @original_name, @mime_type, @size_bytes, @sha256, @purpose, @created_at)`,
  ).run(row);
  return row;
}

export function filePathFor(storageKey: string) {
  const root = uploadDir();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new UploadError("Invalid file path.");
  }
  return resolved;
}

export function getFile(id: string): FileRow | undefined {
  return db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
}

export async function deleteFile(id: string) {
  const file = getFile(id);
  if (!file) return;
  try {
    await fs.unlink(filePathFor(file.storage_key));
  } catch {
    // Missing file on disk should not block deletion of the database record.
  }
  db.prepare("DELETE FROM files WHERE id = ?").run(id);
}

function sanitizeName(name: string) {
  return name.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
}
