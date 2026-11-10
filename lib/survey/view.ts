/**
 * Role-based, serializable views of survey records for the client. Precise coordinates and
 * device metadata are shown to the surveying company and reviewers only. Pure.
 */
import type { EvidenceRow } from "@/lib/survey/data";

export interface EvidenceView {
  id: string;
  kind: EvidenceRow["kind"];
  category: string;
  caption: string;
  itemId: string | null;
  planeId: string | null;
  mime: string;
  sizeBytes: number;
  sha256: string | null;
  originalName: string;
  url: string;
  thumbUrl: string | null;
  thumbSource: EvidenceRow["thumb_source"];
  width: number | null;
  height: number | null;
  durationSec: number | null;
  durationSource: EvidenceRow["duration_source"];
  captureSource: EvidenceRow["capture_source"];
  capturedAt: string | null;
  capturedAtSource: EvidenceRow["captured_at_source"];
  /** Device-reported; null for customers. */
  location: { lat: number; lng: number; accuracy: number | null } | null;
  uploadedAt: string;
  status: EvidenceRow["status"];
  reviewStatus: EvidenceRow["review_status"];
  reviewNote: string | null;
}

export function evidenceView(e: EvidenceRow, role: "surveyor" | "reviewer" | "customer"): EvidenceView {
  const internal = role !== "customer";
  return {
    id: e.id,
    kind: e.kind,
    category: e.category,
    caption: e.caption,
    itemId: e.item_id,
    planeId: e.plane_id,
    mime: e.mime_type,
    sizeBytes: e.size_bytes,
    sha256: internal ? e.sha256 : null,
    originalName: e.original_name,
    url: `/api/surveys/evidence/${e.id}`,
    thumbUrl: e.thumb_storage_key ? `/api/surveys/evidence/${e.id}?v=thumb` : null,
    thumbSource: e.thumb_source,
    width: e.width,
    height: e.height,
    durationSec: e.duration_sec,
    durationSource: e.duration_source,
    captureSource: internal ? e.capture_source : "unknown",
    capturedAt: internal ? e.captured_at : null,
    capturedAtSource: internal ? e.captured_at_source : null,
    location: internal && e.device_lat != null && e.device_lng != null ? { lat: e.device_lat, lng: e.device_lng, accuracy: e.device_accuracy_m } : null,
    uploadedAt: e.uploaded_at,
    status: e.status,
    reviewStatus: e.review_status,
    reviewNote: internal ? e.review_note : null,
  };
}

export const CAPTURE_SOURCE_LABEL: Record<EvidenceRow["capture_source"], string> = {
  in_app_camera: "Taken with the device camera from the survey (device-reported)",
  file_upload: "Uploaded from files or gallery",
  unknown: "Source unknown",
};

export const CAPTURED_AT_SOURCE_LABEL: Record<NonNullable<EvidenceRow["captured_at_source"]>, string> = {
  exif: "camera time in the photo's EXIF data (device-reported)",
  device_file: "file timestamp from the device (device-reported)",
  device_clock: "device clock at selection (device-reported)",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
