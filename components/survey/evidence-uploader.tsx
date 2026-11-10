"use client";
/* eslint-disable @next/next/no-img-element -- private, session-authorised media can't go through the image optimiser */

import { useCallback, useEffect, useRef, useState } from "react";
import { removeEvidenceAction, updateEvidenceAction } from "@/app/actions/surveys";
import { Alert, Check } from "@/components/icons";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABEL, type EvidenceCategory } from "@/lib/survey/config";
import { CAPTURE_SOURCE_LABEL, CAPTURED_AT_SOURCE_LABEL, formatBytes, formatDuration, type EvidenceView } from "@/lib/survey/view";
import { randomKey, requestPosition } from "@/components/survey/client-utils";

type QueueState = "waiting" | "uploading" | "failed" | "cancelled";
interface QueueItem {
  key: string;
  file: File;
  state: QueueState;
  progress: number;
  error: string | null;
  source: "in_app_camera" | "file_upload";
  category: EvidenceCategory;
  caption: string;
  itemId: string | null;
  planeId: string | null;
  preview: string | null;
}

export interface LinkTargets {
  items: { id: string; label: string }[];
  planes: { id: string; label: string }[];
}

const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name);

/** Reads a video's reported duration and a preview frame on the device (both labelled device-generated). */
function inspectVideo(file: File): Promise<{ duration: number | null; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (result: { duration: number | null; poster: Blob | null }) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ duration: null, poster: null }), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null;
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 640 / (video.videoWidth || 640));
          canvas.width = Math.round((video.videoWidth || 640) * scale);
          canvas.height = Math.round((video.videoHeight || 360) * scale);
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            clearTimeout(timer);
            finish({ duration, poster: blob });
          }, "image/jpeg", 0.72);
        } catch {
          clearTimeout(timer);
          finish({ duration, poster: null });
        }
      };
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish({ duration: null, poster: null });
    };
  });
}

/**
 * Captures and uploads survey evidence. Each file gets a client key; retries reuse it, and the
 * server returns the existing record instead of creating a duplicate. A file shows as complete
 * only after the server stored it and registered it.
 */
export function EvidenceUploader({
  surveyId,
  editable,
  defaultCategory = "other",
  itemId = null,
  planeId = null,
  compact = false,
  onUploaded,
}: {
  surveyId: string;
  editable: boolean;
  defaultCategory?: EvidenceCategory;
  itemId?: string | null;
  planeId?: string | null;
  compact?: boolean;
  onUploaded: (e: EvidenceView) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState<EvidenceCategory>(defaultCategory);
  const [caption, setCaption] = useState("");
  const [attachLocation, setAttachLocation] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const location = useRef<{ lat: number; lng: number; accuracy: number | null; at: number } | null>(null);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const patch = (key: string, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const ensureLocation = useCallback(async () => {
    if (!attachLocation) return null;
    if (location.current && Date.now() - location.current.at < 120_000) return location.current;
    const result = await requestPosition(10000);
    if (result.outcome === "ok") {
      location.current = { lat: result.lat, lng: result.lng, accuracy: result.accuracy, at: Date.now() };
      setLocationNote(`Location attached (±${result.accuracy ?? "?"} m, device-reported).`);
      return location.current;
    }
    setLocationNote(result.message);
    return null;
  }, [attachLocation]);

  const upload = useCallback(
    async (item: QueueItem) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        patch(item.key, { state: "waiting", error: "Offline — will upload when the connection returns." });
        return;
      }
      patch(item.key, { state: "uploading", progress: 0, error: null });
      const video = isVideo(item.file) ? await inspectVideo(item.file) : null;
      const loc = await ensureLocation();
      const params = new URLSearchParams({
        key: item.key,
        category: item.category,
        caption: item.caption,
        name: item.file.name,
        source: item.source,
        capturedAt: new Date(item.file.lastModified || Date.now()).toISOString(),
        capturedAtSource: item.file.lastModified ? "device_file" : "device_clock",
      });
      if (item.itemId) params.set("item", item.itemId);
      if (item.planeId) params.set("plane", item.planeId);
      if (loc) {
        params.set("lat", String(loc.lat));
        params.set("lng", String(loc.lng));
        if (loc.accuracy != null) params.set("accuracy", String(loc.accuracy));
      }
      if (video?.duration) params.set("duration", String(video.duration));

      const xhr = new XMLHttpRequest();
      xhrs.current.set(item.key, xhr);
      xhr.open("POST", `/api/surveys/${surveyId}/evidence?${params}`);
      xhr.setRequestHeader("Content-Type", item.file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) patch(item.key, { progress: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = async () => {
        xhrs.current.delete(item.key);
        let body: { evidence?: EvidenceView; error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error */
        }
        if ((xhr.status === 200 || xhr.status === 201) && body.evidence) {
          let evidence = body.evidence;
          if (evidence.kind === "video" && video?.poster && !evidence.thumbUrl) {
            const res = await fetch(`/api/surveys/evidence/${evidence.id}/poster`, { method: "POST", body: video.poster, headers: { "Content-Type": "image/jpeg" } }).catch(() => null);
            if (res?.ok) evidence = { ...evidence, thumbUrl: `${evidence.url}?v=thumb`, thumbSource: "device" };
          }
          onUploaded(evidence);
          setQueue((q) => q.filter((i) => i.key !== item.key));
          if (item.preview) URL.revokeObjectURL(item.preview);
        } else {
          patch(item.key, { state: "failed", error: body.error ?? (xhr.status === 413 ? "File is too large." : `Upload failed (${xhr.status || "network"}). Retry when ready.`) });
        }
      };
      xhr.onerror = () => {
        xhrs.current.delete(item.key);
        patch(item.key, { state: "failed", error: "Connection lost during upload. Retry when the signal is back." });
      };
      xhr.onabort = () => {
        xhrs.current.delete(item.key);
        patch(item.key, { state: "cancelled", error: "Upload cancelled." });
      };
      xhr.send(item.file);
    },
    [ensureLocation, onUploaded, surveyId],
  );

  // Resume uploads that waited for a connection.
  useEffect(() => {
    const on = () => {
      setOnline(true);
      setQueue((q) => {
        q.filter((i) => i.state === "waiting").forEach((i) => void upload(i));
        return q;
      });
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [upload]);

  const addFiles = (files: FileList | null, source: "camera" | "files") => {
    if (!files?.length) return;
    const now = Date.now();
    const items: QueueItem[] = Array.from(files).map((file) => ({
      key: randomKey(),
      file,
      state: "waiting",
      progress: 0,
      error: null,
      // A camera capture produces a brand-new file; anything older came from the gallery.
      source: source === "camera" && now - (file.lastModified || now) < 5 * 60_000 ? "in_app_camera" : "file_upload",
      category,
      caption,
      itemId,
      planeId,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setQueue((q) => [...q, ...items]);
    setCaption("");
    // Two at a time keeps phones responsive on slow connections.
    (async () => {
      for (let i = 0; i < items.length; i += 2) await Promise.all(items.slice(i, i + 2).map((it) => upload(it)));
    })();
  };

  if (!editable) return null;
  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-2xl border border-line bg-paper p-4"}>
      {!compact ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`cat-${surveyId}-${itemId ?? planeId ?? "main"}`}>Category</label>
            <select id={`cat-${surveyId}-${itemId ?? planeId ?? "main"}`} className="select" value={category} onChange={(e) => setCategory(e.target.value as EvidenceCategory)}>
              {EVIDENCE_CATEGORIES.filter((c) => c.id !== "client_acknowledgment").map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`cap-${surveyId}-${itemId ?? planeId ?? "main"}`}>Caption <span className="font-normal text-muted">(optional)</span></label>
            <input id={`cap-${surveyId}-${itemId ?? planeId ?? "main"}`} className="input" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. North roof plane from the street" />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`btn btn-primary ${compact ? "btn-sm" : ""}`} onClick={() => photoRef.current?.click()}>Take photo</button>
        <button type="button" className={`btn btn-secondary ${compact ? "btn-sm" : ""}`} onClick={() => videoRef.current?.click()}>Record video</button>
        <button type="button" className={`btn btn-ghost ${compact ? "btn-sm" : ""}`} onClick={() => fileRef.current?.click()}>Upload files</button>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files, "camera"); e.target.value = ""; }} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files, "camera"); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files, "files"); e.target.value = ""; }} />
      </div>
      {!compact ? (
        <div className="text-xs text-muted">
          <label className="inline-flex min-h-7 items-center gap-2">
            <input type="checkbox" checked={attachLocation} onChange={(e) => setAttachLocation(e.target.checked)} />
            Attach my device location to new uploads
          </label>
          <p>Your browser will ask first. Location is device-reported, visible only to your company and reviewers, and supports — but doesn’t prove — where a photo was taken. On computers without a camera, “Take photo” and “Record video” open the file picker instead.</p>
          {locationNote ? <p className="mt-1 text-ink-soft">{locationNote}</p> : null}
        </div>
      ) : null}
      {!online ? <p className="alert-warn text-xs">You’re offline. Files stay queued on this page and upload when the connection returns. Keep this page open — queued files are not saved if you close it.</p> : null}
      {queue.length ? (
        <ul className="space-y-2" aria-live="polite">
          {queue.map((i) => (
            <li key={i.key} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-sm">
              {i.preview ? <img src={i.preview} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-paper-deep text-xs font-semibold text-muted">{isVideo(i.file) ? "VIDEO" : "FILE"}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{i.file.name}</p>
                {i.state === "uploading" ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.file.name}`}>
                    <div className="h-full bg-forest transition-[width]" style={{ width: `${i.progress}%` }} />
                  </div>
                ) : null}
                <p className={`text-xs ${i.state === "failed" ? "text-clay" : "text-muted"}`}>
                  {i.state === "uploading" ? `Uploading… ${i.progress}% · ${formatBytes(i.file.size)}` : i.state === "waiting" ? i.error ?? "Waiting…" : i.error}
                </p>
              </div>
              {i.state === "uploading" ? (
                <button type="button" className="link-action link-muted text-xs" onClick={() => xhrs.current.get(i.key)?.abort()}>Cancel</button>
              ) : i.state === "failed" || i.state === "cancelled" ? (
                <div className="flex gap-2">
                  <button type="button" className="link-action text-xs" onClick={() => void upload(i)}>Retry</button>
                  <button type="button" className="link-action link-muted text-xs" onClick={() => setQueue((q) => q.filter((x) => x.key !== i.key))}>Remove</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Thumbnail grid with a lightbox showing the media and its labelled metadata. */
export function EvidenceGallery({ evidence, editable, links, onChange, onRemove, showMeta = true }: { evidence: EvidenceView[]; editable: boolean; links?: LinkTargets; onChange?: (e: EvidenceView) => void; onRemove?: (id: string) => void; showMeta?: boolean }) {
  const [open, setOpen] = useState<EvidenceView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  if (!evidence.length) return null;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {evidence.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpen(e)} className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-line bg-paper-deep text-left" aria-label={`Open ${e.kind}: ${e.caption || EVIDENCE_CATEGORY_LABEL[e.category as EvidenceCategory] || e.originalName}`}>
              {e.thumbUrl || (e.kind === "photo" && e.mime !== "image/heic") || e.kind === "signature" ? (
                <img src={e.thumbUrl ?? e.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              ) : (
                <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-semibold text-muted">{e.kind === "document" ? "PDF" : e.kind === "video" ? "VIDEO" : "PHOTO"}</span>
              )}
              {e.kind === "video" ? <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1.5 py-0.5 text-xs font-semibold text-white">▶ {formatDuration(e.durationSec) || "video"}</span> : null}
              {e.reviewStatus === "rejected" ? <span className="absolute left-1 top-1 rounded bg-clay px-1.5 py-0.5 text-xs font-semibold text-white">Rejected</span> : null}
              {e.status === "removed" ? <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 text-xs font-semibold text-white">Removed</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <dialog ref={dialog} className="m-auto w-[min(56rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-white p-0 shadow-lift backdrop:bg-ink/60" onClose={() => setOpen(null)} aria-label="Evidence details">
          <EvidenceDetail evidence={open} editable={editable} links={links} showMeta={showMeta} onClose={() => dialog.current?.close()} onChange={(e) => { setOpen(e); onChange?.(e); }} onRemove={(id) => { dialog.current?.close(); onRemove?.(id); }} />
        </dialog>
      ) : null}
    </>
  );
}

function EvidenceDetail({ evidence: e, editable, links, showMeta, onClose, onChange, onRemove }: { evidence: EvidenceView; editable: boolean; links?: LinkTargets; showMeta: boolean; onClose: () => void; onChange: (e: EvidenceView) => void; onRemove: (id: string) => void }) {
  const [caption, setCaption] = useState(e.caption);
  const [category, setCategory] = useState(e.category);
  const [itemId, setItemId] = useState(e.itemId ?? "");
  const [planeId, setPlaneId] = useState(e.planeId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const canEdit = editable && e.kind !== "signature" && e.status === "active";
  return (
    <div className="grid max-h-[90vh] overflow-auto md:grid-cols-[1.3fr_1fr]">
      <div className="flex items-center justify-center bg-ink p-2">
        {e.kind === "video" ? (
          <video src={e.url} controls playsInline preload="metadata" poster={e.thumbUrl ?? undefined} className="max-h-[70vh] w-full" />
        ) : e.kind === "document" ? (
          <a href={e.url} target="_blank" rel="noreferrer" className="btn btn-sun my-16">Open PDF</a>
        ) : (
          <img src={e.url} alt={e.caption || "Survey evidence"} className="max-h-[70vh] w-auto object-contain" />
        )}
      </div>
      <div className="space-y-3 p-5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-forest-deep">{EVIDENCE_CATEGORY_LABEL[e.category as EvidenceCategory] ?? e.category}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        {canEdit ? (
          <form
            className="space-y-2"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const res = await updateEvidenceAction({ evidenceId: e.id, caption, category, itemId: itemId || null, planeId: planeId || null });
              setMsg(res.ok ? "Saved." : res.error ?? "Not saved.");
              if (res.ok) onChange({ ...e, caption, category, itemId: itemId || null, planeId: planeId || null });
            }}
          >
            <div><label className="label" htmlFor={`ec-${e.id}`}>Caption</label><input id={`ec-${e.id}`} className="input" maxLength={300} value={caption} onChange={(x) => setCaption(x.target.value)} /></div>
            <div>
              <label className="label" htmlFor={`eg-${e.id}`}>Category</label>
              <select id={`eg-${e.id}`} className="select" value={category} onChange={(x) => setCategory(x.target.value)}>
                {EVIDENCE_CATEGORIES.filter((c) => c.id !== "client_acknowledgment").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            {links?.items.length ? (
              <div>
                <label className="label" htmlFor={`ei-${e.id}`}>Linked checklist item</label>
                <select id={`ei-${e.id}`} className="select" value={itemId} onChange={(x) => setItemId(x.target.value)}>
                  <option value="">None</option>
                  {links.items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              </div>
            ) : null}
            {links?.planes.length ? (
              <div>
                <label className="label" htmlFor={`ep-${e.id}`}>Linked roof plane</label>
                <select id={`ep-${e.id}`} className="select" value={planeId} onChange={(x) => setPlaneId(x.target.value)}>
                  <option value="">None</option>
                  {links.planes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-primary btn-sm">Save details</button>
              {confirm ? (
                <button type="button" className="btn btn-sm border-clay text-clay" onClick={async () => { const r = await removeEvidenceAction(e.id); if (r.ok) onRemove(e.id); else setMsg(r.error ?? "Not removed."); }}>Confirm remove</button>
              ) : (
                <button type="button" className="link-action link-danger text-sm" onClick={() => setConfirm(true)}>Remove…</button>
              )}
              {msg ? <span role="status" className="text-xs text-muted">{msg}</span> : null}
            </div>
          </form>
        ) : e.caption ? <p className="text-ink">{e.caption}</p> : null}
        {e.reviewStatus !== "pending" ? (
          <p className={e.reviewStatus === "rejected" ? "alert-error" : "alert-success"}>
            Reviewer {e.reviewStatus === "rejected" ? "rejected" : "accepted"} this item{e.reviewNote ? `: ${e.reviewNote}` : "."}
          </p>
        ) : null}
        {showMeta ? (
          <dl className="space-y-1.5 border-t border-line pt-3 text-xs text-ink-soft">
            <div><dt className="inline font-semibold text-ink">Uploaded (server time): </dt><dd className="inline">{new Date(e.uploadedAt).toLocaleString("en-PH")}</dd></div>
            {e.capturedAt ? <div><dt className="inline font-semibold text-ink">Captured: </dt><dd className="inline">{new Date(e.capturedAt).toLocaleString("en-PH")} — {e.capturedAtSource ? CAPTURED_AT_SOURCE_LABEL[e.capturedAtSource] : "device-reported"}</dd></div> : null}
            <div><dt className="inline font-semibold text-ink">Source: </dt><dd className="inline">{CAPTURE_SOURCE_LABEL[e.captureSource]}</dd></div>
            <div><dt className="inline font-semibold text-ink">Device location: </dt><dd className="inline">{e.location ? `${e.location.lat.toFixed(5)}, ${e.location.lng.toFixed(5)} (±${e.location.accuracy ?? "?"} m, device-reported)` : "Not attached"}</dd></div>
            <div><dt className="inline font-semibold text-ink">File: </dt><dd className="inline">{e.originalName} · {e.mime} · {formatBytes(e.sizeBytes)}{e.durationSec ? ` · ${formatDuration(e.durationSec)} (${e.durationSource === "server" ? "read from the file by the server" : "reported by the device"})` : ""}</dd></div>
            {e.thumbUrl ? <div><dt className="inline font-semibold text-ink">Preview: </dt><dd className="inline">{e.thumbSource === "server" ? "Compressed copy made by the server; original kept unchanged" : "Frame generated on the uploading device"}</dd></div> : null}
            {e.sha256 ? <div><dt className="inline font-semibold text-ink">SHA-256: </dt><dd className="inline break-all font-mono">{e.sha256}</dd></div> : null}
            <p className="pt-1 text-muted">Metadata, GPS and timestamps support the visit record but can’t prove attendance or authenticity on their own.</p>
          </dl>
        ) : null}
        <a href={`${e.url}?v=download`} className="link-action text-sm">Download original</a>
      </div>
    </div>
  );
}

export function UploadErrorNote({ message }: { message: string }) {
  return (
    <p className="alert-error flex gap-2"><Alert className="mt-0.5 h-4 w-4 shrink-0" /> {message}</p>
  );
}

export { Check };
