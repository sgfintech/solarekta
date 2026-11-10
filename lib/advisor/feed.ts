import "server-only";
import { z } from "zod";
import { scrubUntrusted } from "@/lib/ai/grounding";
import { normalizeChemistry, nominalKwh, type EquipmentCategory } from "@/lib/advisor/specs";
import type { PriceRecord } from "@/lib/advisor/match";

/**
 * Optional external price feed — the "approved web-search integration" slot.
 *
 * Off unless PRICE_FEED_URL is set. The endpoint must return JSON
 * `{ "records": [...] }` where each record carries a source URL, supplier, price in PHP,
 * price basis and the date checked. Records missing any of these are dropped. Feed content
 * is untrusted: strings are scrubbed and capped, and nothing in a record can change
 * application behaviour. Results are cached in memory for PRICE_FEED_CACHE_MINUTES.
 */

const feedRecordSchema = z.object({
  id: z.string().min(1).max(120),
  category: z.enum(["panel", "inverter", "battery", "mounting", "accessory"]),
  brand: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  supplierName: z.string().min(1).max(160),
  sourceUrl: z.string().url().max(500).refine((u) => u.startsWith("https://"), "https only"),
  currency: z.literal("PHP"),
  pricePhp: z.number().positive().max(50_000_000),
  unit: z.enum(["piece", "set", "kit", "meter"]).default("piece"),
  priceBasis: z.enum(["equipment_only", "equipment_delivered", "supply_and_install"]),
  checkedAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "date"),
  inclusions: z.array(z.string().max(160)).max(20).default([]),
  exclusions: z.array(z.string().max(160)).max(20).default([]),
  specs: z
    .object({
      nominalVoltageV: z.number().positive().max(2000).optional(),
      capacityAh: z.number().positive().max(100000).optional(),
      capacityKwh: z.number().positive().max(10000).optional(),
      chemistry: z.string().max(40).optional(),
      ratedKw: z.number().positive().max(10000).optional(),
      ratedPowerW: z.number().positive().max(100000).optional(),
      phase: z.enum(["single", "three"]).optional(),
      inverterType: z.enum(["grid_tie", "hybrid", "off_grid"]).optional(),
    })
    .default({}),
});

export function feedStatus() {
  const url = process.env.PRICE_FEED_URL;
  return { enabled: Boolean(url && url.startsWith("https://")), maxAgeDays: Number(process.env.PRICE_FEED_MAX_AGE_DAYS) || 30 };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (input, init) => fetch(input, init);
let cache: { at: number; records: PriceRecord[] } | null = null;

/** Test seam. */
export function __setFeedTestHooks(hooks: { fetch?: FetchLike; reset?: boolean }) {
  if (hooks.fetch) fetchImpl = hooks.fetch;
  if (hooks.reset) cache = null;
}

/** Validates and normalises raw feed JSON. Exported for tests. */
export function parseFeed(raw: unknown, now = Date.now(), maxAgeDays = 30): PriceRecord[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { records?: unknown }).records) ? (raw as { records: unknown[] }).records : [];
  const out: PriceRecord[] = [];
  for (const item of list.slice(0, 500)) {
    const parsed = feedRecordSchema.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    const checked = Date.parse(r.checkedAt);
    if (checked > now + 86_400_000 || now - checked > maxAgeDays * 86_400_000) continue;
    const s = r.specs;
    const derived = !s.capacityKwh && s.nominalVoltageV && s.capacityAh;
    out.push({
      ref: `feed:${scrubUntrusted(r.id, 120)}`,
      sourceType: "feed",
      category: r.category as EquipmentCategory,
      brand: scrubUntrusted(r.brand, 80),
      model: scrubUntrusted(r.model, 120),
      title: scrubUntrusted(r.title, 200),
      specs: {
        nominalVoltageV: s.nominalVoltageV,
        capacityAh: s.capacityAh,
        nominalKwh: s.capacityKwh ?? (derived ? nominalKwh(s.nominalVoltageV!, s.capacityAh!) : undefined),
        nominalKwhDerived: Boolean(derived),
        chemistry: normalizeChemistry(s.chemistry),
        ratedKw: s.ratedKw,
        ratedPowerW: s.ratedPowerW,
        phase: s.phase,
        inverterType: s.inverterType,
      },
      currency: "PHP",
      pricePhp: r.pricePhp,
      unit: r.unit,
      priceBasis: r.priceBasis,
      inclusions: r.inclusions.map((t) => scrubUntrusted(t, 160)).filter(Boolean),
      exclusions: r.exclusions.map((t) => scrubUntrusted(t, 160)).filter(Boolean),
      supplierName: scrubUntrusted(r.supplierName, 160),
      sourceUrl: r.sourceUrl,
      checkedAt: new Date(checked).toISOString(),
      sample: false,
    });
  }
  return out;
}

/** Feed records, or an empty list with a notice when the feed is off or failing. Never throws. */
export async function loadFeedRecords(): Promise<{ records: PriceRecord[]; notice: string | null }> {
  const status = feedStatus();
  if (!status.enabled) return { records: [], notice: null };
  const ttl = (Number(process.env.PRICE_FEED_CACHE_MINUTES) || 360) * 60_000;
  if (cache && Date.now() - cache.at < ttl) return { records: cache.records, notice: null };
  try {
    const response = await fetchImpl(process.env.PRICE_FEED_URL!, {
      headers: { Accept: "application/json", ...(process.env.PRICE_FEED_TOKEN ? { Authorization: `Bearer ${process.env.PRICE_FEED_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(Number(process.env.PRICE_FEED_TIMEOUT_MS) || 8000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const records = parseFeed(await response.json(), Date.now(), status.maxAgeDays);
    cache = { at: Date.now(), records };
    return { records, notice: null };
  } catch {
    return { records: cache?.records ?? [], notice: "The external price feed is unavailable right now, so only the SOLARekta catalogue is shown." };
  }
}
