"use client";

/** Browser helpers for the survey editor: geolocation with consent, ids and local drafts. */

export type LocationOutcome =
  | { outcome: "ok"; lat: number; lng: number; accuracy: number | null }
  | { outcome: "denied" | "unavailable"; message: string };

/** Asks the browser for a one-off position. Never throws; denial and timeouts are outcomes. */
export function requestPosition(timeoutMs = 15000): Promise<LocationOutcome> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ outcome: "unavailable", message: "This browser can't share location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ outcome: "ok", lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null }),
      (e) =>
        resolve(
          e.code === e.PERMISSION_DENIED
            ? { outcome: "denied", message: "Location permission was declined. You can continue; the survey will be flagged for the reviewer." }
            : { outcome: "unavailable", message: e.code === e.TIMEOUT ? "Location took too long. Try again outdoors or continue without it." : "Location is unavailable on this device right now." },
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

export function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const DRAFT_PREFIX = "srv-draft:";

export interface LocalDraft<T> {
  baseVersion: number;
  data: T;
  savedAt: string;
}

export function readDraft<T>(surveyId: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + surveyId);
    return raw ? (JSON.parse(raw) as LocalDraft<T>) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is full or unavailable (private mode). */
export function writeDraft<T>(surveyId: string, draft: LocalDraft<T>): boolean {
  try {
    localStorage.setItem(DRAFT_PREFIX + surveyId, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(surveyId: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + surveyId);
  } catch {
    /* ignore */
  }
}

/** Removes every locally cached survey draft (called on logout). */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
