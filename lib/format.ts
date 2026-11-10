export function peso(value: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (opts.compact && Math.abs(value) >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  }
  if (opts.compact && Math.abs(value) >= 100_000) {
    return `₱${Math.round(value / 1000)}k`;
  }
  return `₱${Math.round(value).toLocaleString("en-PH")}`;
}

export function num(value: number | null | undefined, decimals = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (["verified", "approved", "completed", "confirmed", "active", "matched", "quoted", "accepted"].includes(status)) {
    return "good";
  }
  if (["pending", "open", "invited", "suggested", "processing", "viewed", "draft"].includes(status)) return "warn";
  if (["rejected", "suspended", "cancelled", "withdrawn", "failed", "declined"].includes(status)) return "bad";
  return "neutral";
}
