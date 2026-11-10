import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { uploadDir } from "@/lib/files";
import { serverLimits, EVIDENCE_CATEGORIES, type SurveyLimits } from "@/lib/survey/config";
import type { EvidenceRow } from "@/lib/survey/data";

/**
 * Private evidence storage on the server's disk (UPLOAD_DIR). Uploads are streamed to a
 * temporary file while hashing and counting bytes, so large videos never sit in memory.
 * Type is decided from file content, not from the name or client MIME. Originals are
 * kept unchanged; thumbnails are separate derived files.
 */

export type EvidenceKind = "photo" | "video" | "document" | "signature";

interface Sniffed {
  kind: Exclude<EvidenceKind, "signature">;
  mime: string;
  ext: string;
}

/** Identifies allowed content from the first bytes. Anything else is rejected. */
export function sniffContent(head: Buffer): Sniffed | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "photo", mime: "image/jpeg", ext: "jpg" };
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "photo", mime: "image/png", ext: "png" };
  if (head.length >= 12 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return { kind: "photo", mime: "image/webp", ext: "webp" };
  if (head.length >= 5 && head.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "document", mime: "application/pdf", ext: "pdf" };
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: "video", mime: "video/webm", ext: "webm" };
  if (head.length >= 12 && head.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = head.subarray(8, 12).toString("latin1");
    if (/^(heic|heix|hevc|mif1|msf1|heim|heis)/.test(brand)) return { kind: "photo", mime: "image/heic", ext: "heic" };
    if (/^qt {2}/.test(brand)) return { kind: "video", mime: "video/quicktime", ext: "mov" };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |MSNV|3gp|dash)/.test(brand)) return { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  return null;
}

export class EvidenceUploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface UploadMeta {
  clientKey: string;
  category: string;
  caption: string;
  itemId: string | null;
  planeId: string | null;
  originalName: string;
  captureSource: "in_app_camera" | "file_upload" | "unknown";
  capturedAt: string | null;
  capturedAtSource: "device_file" | "device_clock" | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  durationSec: number | null;
  /** Only "signature" may be forced (server-generated signature PNGs). */
  forceKind?: "signature";
}

const VALID_CATEGORIES = new Set<string>(EVIDENCE_CATEGORIES.map((c) => c.id));

export function surveyDir(surveyId: string) {
  return path.join(uploadDir(), "surveys", surveyId);
}
function tmpDir() {
  return path.join(uploadDir(), "tmp");
}
export function evidencePath(storageKey: string) {
  const root = path.resolve(uploadDir());
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root + path.sep)) throw new EvidenceUploadError("Invalid file path.", 400);
  return resolved;
}

export function safeName(name: string): string {
  const base = path.basename(name || "file").normalize("NFKC").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "file").slice(0, 120);
}

function sizeLimit(kind: EvidenceKind, limits: SurveyLimits) {
  return kind === "video" ? limits.videoBytes : kind === "document" ? limits.documentBytes : limits.photoBytes;
}

/**
 * Streams an upload to private storage and registers it. Idempotent per (survey, clientKey):
 * a retry of a completed upload returns the existing record instead of creating a duplicate.
 * The database row is written only after the file is fully stored, and the file is removed if
 * registration fails, so an upload is never reported complete without both.
 */
export async function storeEvidence(input: {
  surveyId: string;
  userId: string;
  meta: UploadMeta;
  body: ReadableStream<Uint8Array> | Readable;
  declaredBytes: number | null;
  limits?: SurveyLimits;
}): Promise<{ evidence: EvidenceRow; duplicate: boolean }> {
  const limits = input.limits ?? serverLimits();
  const { meta } = input;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(meta.clientKey)) throw new EvidenceUploadError("Missing upload key.");
  if (!VALID_CATEGORIES.has(meta.category)) throw new EvidenceUploadError("Choose an evidence category.");

  const existing = db.prepare("SELECT * FROM survey_evidence WHERE survey_id = ? AND client_key = ?").get(input.surveyId, meta.clientKey) as EvidenceRow | undefined;
  if (existing) return { evidence: existing, duplicate: true };

  const count = (db.prepare("SELECT COUNT(*) AS c FROM survey_evidence WHERE survey_id = ? AND status = 'active'").get(input.surveyId) as { c: number }).c;
  if (count >= limits.maxEvidencePerSurvey) throw new EvidenceUploadError(`This survey already has ${count} files, the maximum allowed.`, 413);
  const maxAny = Math.max(limits.videoBytes, limits.photoBytes, limits.documentBytes);
  if (input.declaredBytes != null && input.declaredBytes > maxAny) throw new EvidenceUploadError("File is too large.", 413);

  await fs.mkdir(tmpDir(), { recursive: true });
  const tmp = path.join(tmpDir(), `${newId()}.part`);
  const hash = createHash("sha256");
  let bytes = 0;
  let head = Buffer.alloc(0);
  let sniffed: Sniffed | null = null;
  let limit = maxAny;

  const source = input.body instanceof Readable ? input.body : Readable.fromWeb(input.body as import("node:stream/web").ReadableStream<Uint8Array>);
  const out = createWriteStream(tmp, { flags: "wx" });
  try {
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      bytes += buf.length;
      if (!sniffed && head.length < 64) {
        head = Buffer.concat([head, buf.subarray(0, 64 - head.length)]);
        if (head.length >= 16 || bytes === buf.length) {
          sniffed = sniffContent(head);
          if (!sniffed && head.length >= 16) throw new EvidenceUploadError("Only photos (JPG, PNG, WEBP, HEIC), videos (MP4, MOV, WEBM) and PDF documents are accepted.", 415);
          if (sniffed) limit = sizeLimit(meta.forceKind ?? sniffed.kind, limits);
        }
      }
      if (bytes > limit) throw new EvidenceUploadError(`File is larger than the ${Math.round(limit / 1024 / 1024)} MB limit for this type.`, 413);
      hash.update(buf);
      if (!out.write(buf)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
    if (!sniffed) sniffed = sniffContent(head);
    if (!sniffed) throw new EvidenceUploadError("Only photos, videos and PDF documents are accepted.", 415);
    if (bytes === 0) throw new EvidenceUploadError("The file is empty.");
    if (meta.forceKind === "signature" && sniffed.mime !== "image/png") throw new EvidenceUploadError("Signature must be a PNG image.");
  } catch (error) {
    out.destroy();
    await fs.rm(tmp, { force: true });
    if (error instanceof EvidenceUploadError) throw error;
    throw new EvidenceUploadError("The upload was interrupted. Try again.", 400);
  }

  const kind: EvidenceKind = meta.forceKind ?? sniffed.kind;
  const id = newId();
  const dir = surveyDir(input.surveyId);
  await fs.mkdir(dir, { recursive: true });
  const storageKey = path.posix.join("surveys", input.surveyId, `${id}.${sniffed.ext}`);
  const finalPath = evidencePath(storageKey);
  await fs.rename(tmp, finalPath);

  // Derived data. Failures here never fail the upload.
  let thumbKey: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let capturedAt = meta.capturedAt;
  let capturedAtSource: EvidenceRow["captured_at_source"] = meta.capturedAt ? meta.capturedAtSource ?? "device_clock" : null;
  let durationSec: number | null = null;
  let durationSource: EvidenceRow["duration_source"] = null;
  if (kind === "photo" || kind === "signature") {
    const derived = await deriveImage(finalPath, path.join(dir, `${id}.thumb.webp`));
    if (derived) {
      thumbKey = derived.thumb ? path.posix.join("surveys", input.surveyId, `${id}.thumb.webp`) : null;
      width = derived.width;
      height = derived.height;
      if (derived.exifDate) {
        capturedAt = derived.exifDate;
        capturedAtSource = "exif";
      }
    }
  }
  if (kind === "video") {
    const server = sniffed.ext === "mp4" || sniffed.ext === "mov" ? await mp4DurationFromFile(finalPath) : null;
    if (server != null) {
      durationSec = server;
      durationSource = "server";
    } else if (meta.durationSec != null && meta.durationSec > 0) {
      durationSec = meta.durationSec;
      durationSource = "device";
    }
    if (durationSec != null && durationSec > limits.videoSeconds) {
      await fs.rm(finalPath, { force: true });
      throw new EvidenceUploadError(`Video is longer than the ${Math.round(limits.videoSeconds / 60)}-minute limit.`, 413);
    }
  }

  const row: EvidenceRow = {
    id,
    survey_id: input.surveyId,
    uploader_user_id: input.userId,
    client_key: meta.clientKey,
    kind,
    category: meta.category,
    caption: meta.caption.slice(0, 300),
    item_id: meta.itemId,
    plane_id: meta.planeId,
    mime_type: sniffed.mime,
    size_bytes: bytes,
    sha256: hash.digest("hex"),
    storage_key: storageKey,
    original_name: safeName(meta.originalName),
    thumb_storage_key: thumbKey,
    thumb_source: thumbKey ? "server" : null,
    width,
    height,
    duration_sec: durationSec,
    duration_source: durationSource,
    capture_source: meta.captureSource,
    captured_at: capturedAt,
    captured_at_source: capturedAtSource,
    device_lat: meta.lat,
    device_lng: meta.lng,
    device_accuracy_m: meta.accuracy,
    location_source: meta.lat != null && meta.lng != null ? "device_gps" : "none",
    uploaded_at: nowIso(),
    status: "active",
    removed_at: null,
    removed_by: null,
    review_status: "pending",
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
  };
  try {
    db.prepare(
      `INSERT INTO survey_evidence (id, survey_id, uploader_user_id, client_key, kind, category, caption, item_id, plane_id, mime_type, size_bytes, sha256, storage_key,
         original_name, thumb_storage_key, thumb_source, width, height, duration_sec, duration_source, capture_source, captured_at, captured_at_source,
         device_lat, device_lng, device_accuracy_m, location_source, uploaded_at, status, review_status)
       VALUES (@id, @survey_id, @uploader_user_id, @client_key, @kind, @category, @caption, @item_id, @plane_id, @mime_type, @size_bytes, @sha256, @storage_key,
         @original_name, @thumb_storage_key, @thumb_source, @width, @height, @duration_sec, @duration_source, @capture_source, @captured_at, @captured_at_source,
         @device_lat, @device_lng, @device_accuracy_m, @location_source, @uploaded_at, @status, @review_status)`,
    ).run(row);
  } catch (error) {
    await fs.rm(finalPath, { force: true });
    if (thumbKey) await fs.rm(evidencePath(thumbKey), { force: true });
    // A concurrent retry with the same key may have won the race.
    const winner = db.prepare("SELECT * FROM survey_evidence WHERE survey_id = ? AND client_key = ?").get(input.surveyId, meta.clientKey) as EvidenceRow | undefined;
    if (winner) return { evidence: winner, duplicate: true };
    throw error;
  }
  return { evidence: row, duplicate: false };
}

type SharpFactory = (input: string | Buffer, options?: Record<string, unknown>) => {
  metadata(): Promise<{ width?: number; height?: number; exif?: Buffer; orientation?: number }>;
  rotate(): ReturnType<SharpFactory>;
  resize(options: Record<string, unknown>): ReturnType<SharpFactory>;
  webp(options: Record<string, unknown>): ReturnType<SharpFactory>;
  toFile(path: string): Promise<unknown>;
};

let sharpLoader: Promise<SharpFactory | null> | null = null;
/** sharp ships with Next.js; if it can't load, thumbnails are skipped and originals are shown. */
function loadSharp(): Promise<SharpFactory | null> {
  sharpLoader ??= import("sharp").then((m) => (m.default ?? m) as unknown as SharpFactory).catch(() => null);
  return sharpLoader;
}

async function deriveImage(original: string, thumbPath: string): Promise<{ thumb: boolean; width: number | null; height: number | null; exifDate: string | null } | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const meta = await sharp(original, { failOn: "none" }).metadata();
    let thumb = false;
    try {
      await sharp(original, { failOn: "none" }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumbPath);
      thumb = true;
    } catch {
      thumb = false;
    }
    return { thumb, width: meta.width ?? null, height: meta.height ?? null, exifDate: meta.exif ? exifDateTimeOriginal(meta.exif) : null };
  } catch {
    return null;
  }
}

/**
 * Reads DateTimeOriginal (tag 0x9003) from a raw EXIF block. Device-reported: cameras let
 * users change their clock, so this is shown as "camera time", never as proof.
 */
export function exifDateTimeOriginal(exif: Buffer): string | null {
  const text = exif.toString("latin1");
  const matches = [...text.matchAll(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g)];
  if (!matches.length) return null;
  // DateTimeOriginal usually follows DateTime; prefer the second timestamp when present.
  const m = matches[1] ?? matches[0];
  const [, y, mo, d, h, mi, s] = m;
  const year = Number(y);
  if (year < 1990 || year > 2100) return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

/** Duration from the MP4/MOV `mvhd` box, scanning the file in chunks (moov may be at the end). */
export async function mp4DurationFromFile(file: string): Promise<number | null> {
  const handle = await fs.open(file, "r");
  try {
    const { size } = await handle.stat();
    const chunk = 1024 * 1024;
    const buf = Buffer.alloc(chunk + 32);
    let carry = Buffer.alloc(0);
    for (let pos = 0; pos < size; pos += chunk) {
      const { bytesRead } = await handle.read(buf, 0, chunk, pos);
      const window = Buffer.concat([carry, buf.subarray(0, bytesRead)]);
      const found = mvhdDuration(window);
      if (found !== undefined) return found;
      carry = window.subarray(Math.max(0, window.length - 40));
    }
    return null;
  } finally {
    await handle.close();
  }
}

/** Parses an mvhd box inside a buffer. Returns undefined when not present. Exported for tests. */
export function mvhdDuration(buf: Buffer): number | null | undefined {
  const at = buf.indexOf("mvhd", 0, "latin1");
  if (at < 0 || at + 32 > buf.length) return undefined;
  const version = buf[at + 4];
  if (version === 1) {
    if (at + 4 + 4 + 16 + 4 + 8 > buf.length) return undefined;
    const timescale = buf.readUInt32BE(at + 4 + 4 + 16);
    const duration = Number(buf.readBigUInt64BE(at + 4 + 4 + 16 + 4));
    return timescale > 0 ? Math.round((duration / timescale) * 10) / 10 : null;
  }
  const timescale = buf.readUInt32BE(at + 4 + 4 + 8);
  const duration = buf.readUInt32BE(at + 4 + 4 + 8 + 4);
  return timescale > 0 ? Math.round((duration / timescale) * 10) / 10 : null;
}

/** Saves a device-generated preview frame for a video (labelled as device-generated). */
export async function storeVideoPoster(evidence: EvidenceRow, jpeg: Buffer): Promise<string> {
  const sniffed = sniffContent(jpeg.subarray(0, 64));
  if (!sniffed || (sniffed.mime !== "image/jpeg" && sniffed.mime !== "image/webp")) throw new EvidenceUploadError("Preview must be a JPG or WEBP image.", 415);
  if (jpeg.length > 3 * 1024 * 1024) throw new EvidenceUploadError("Preview image is too large.", 413);
  const key = path.posix.join("surveys", evidence.survey_id, `${evidence.id}.poster.${sniffed.ext}`);
  await fs.writeFile(evidencePath(key), jpeg);
  db.prepare("UPDATE survey_evidence SET thumb_storage_key = ?, thumb_source = 'device' WHERE id = ?").run(key, evidence.id);
  return key;
}

export async function deleteEvidenceFiles(evidence: Pick<EvidenceRow, "storage_key" | "thumb_storage_key">) {
  await fs.rm(evidencePath(evidence.storage_key), { force: true });
  if (evidence.thumb_storage_key) await fs.rm(evidencePath(evidence.thumb_storage_key), { force: true });
}

/**
 * Removes abandoned partial uploads (temp files) older than `olderThanMs`. Media referenced by
 * a survey is never touched: only files under tmp/ are deleted.
 */
export async function cleanupAbandonedUploads(olderThanMs = 24 * 3600_000): Promise<number> {
  let removed = 0;
  try {
    for (const name of await fs.readdir(tmpDir())) {
      const file = path.join(tmpDir(), name);
      const stat = await fs.stat(file);
      if (Date.now() - stat.mtimeMs > olderThanMs) {
        await fs.rm(file, { force: true });
        removed += 1;
      }
    }
  } catch {
    return removed;
  }
  return removed;
}

/** Streams a stored file with HTTP Range support (needed for video seeking). */
export async function fileResponse(storageKey: string, mime: string, downloadName: string, rangeHeader: string | null, disposition: "inline" | "attachment"): Promise<Response> {
  const file = evidencePath(storageKey);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": `${disposition}; filename="${safeName(downloadName).replace(/"/g, "")}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
  };
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : stat.size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(stat.size) } });
}
