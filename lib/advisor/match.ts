/**
 * Comparable-product filtering and price summaries. Pure functions.
 *
 * Rules:
 * - A listing is an exact match only when every specification the user gave is present on
 *   the listing and agrees with it. A missing value is never treated as a match.
 * - Nearby alternatives are labelled with the differences.
 * - Prices are summarised per price basis (equipment only, delivered, supply and install);
 *   bases are never mixed. One priced listing gives a single observed price, not a range.
 */
import { normalizeToken, queryKwh, SPEC_LABEL, voltageClass, type EquipmentCategory, type InverterType, type Phase, type SpecQuery } from "@/lib/advisor/specs";

export type PriceBasis = "equipment_only" | "equipment_delivered" | "supply_and_install";

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  equipment_only: "Equipment only",
  equipment_delivered: "Equipment, delivered",
  supply_and_install: "Supplied and installed",
};

export interface RecordSpecs {
  nominalVoltageV?: number;
  capacityAh?: number;
  nominalKwh?: number;
  /** True when nominalKwh was computed from V × Ah rather than stated. */
  nominalKwhDerived?: boolean;
  usableKwh?: number;
  dodPercent?: number;
  chemistry?: string;
  ratedKw?: number;
  ratedPowerW?: number;
  efficiencyPct?: number;
  phase?: Phase;
  inverterType?: InverterType;
  /** Inverter: nominal battery bus voltage. */
  batteryVoltageV?: number;
  communication?: string[];
  /** Models the manufacturer lists as compatible (as entered on a reviewed listing). */
  compatibleModels?: string[];
}

export interface PriceRecord {
  /** "catalogue:<productId>" or "feed:<id>". */
  ref: string;
  sourceType: "catalogue" | "feed";
  productId?: string;
  supplierId?: string;
  supplierSlug?: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  title: string;
  specs: RecordSpecs;
  currency: "PHP";
  pricePhp: number | null;
  unit: string;
  priceBasis: PriceBasis;
  inclusions: string[];
  exclusions: string[];
  supplierName: string;
  /** Internal path (/equipment/<id>) or external https URL. */
  sourceUrl: string;
  /** ISO date the price was last confirmed by its source. */
  checkedAt: string;
  sample: boolean;
  stockStatus?: string;
  warrantyYears?: number | null;
}

export type MatchKind = "exact" | "alternative";

export interface Match {
  record: PriceRecord;
  kind: MatchKind;
  differences: string[];
  missing: string[];
  pricePerKwh: number | null;
}

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * tolerance, 1e-9);
const pct = (a: number, b: number) => Math.abs(a - b) / b;

/** Compares one record with a query. Returns null when it is not comparable at all. */
export function compareRecord(q: SpecQuery, r: PriceRecord): Omit<Match, "pricePerKwh"> | null {
  if (q.category && r.category !== q.category) return null;
  if (!q.category && !q.model) return null;

  if (q.model) {
    if (normalizeToken(r.model) === normalizeToken(q.model) && (!q.brand || normalizeToken(r.brand) === normalizeToken(q.brand))) {
      return { record: r, kind: "exact", differences: [], missing: [] };
    }
    // A named model only has alternatives when the user also gave specs to compare on.
  }

  const differences: string[] = [];
  const missing: string[] = [];
  let nearby = true;
  let checked = 0;

  const numeric = (key: keyof SpecQuery, wanted: number | undefined, actual: number | undefined, exactTol: number, nearTol: number, unit: string) => {
    if (wanted === undefined) return;
    checked += 1;
    if (actual === undefined) {
      missing.push(SPEC_LABEL[key] ?? String(key));
      return;
    }
    if (within(actual, wanted, exactTol)) return;
    differences.push(`${actual} ${unit} instead of ${wanted} ${unit}`);
    if (pct(actual, wanted) > nearTol) nearby = false;
  };

  if (r.category === "battery") {
    if (q.nominalVoltageV !== undefined) {
      checked += 1;
      if (r.specs.nominalVoltageV === undefined) missing.push(SPEC_LABEL.nominalVoltageV);
      else if (!within(r.specs.nominalVoltageV, q.nominalVoltageV, 0.01)) {
        differences.push(`${r.specs.nominalVoltageV} V instead of ${q.nominalVoltageV} V`);
        if (voltageClass(r.specs.nominalVoltageV) !== voltageClass(q.nominalVoltageV)) nearby = false;
      }
    }
    numeric("capacityAh", q.capacityAh, r.specs.capacityAh, 0.01, 0.35, "Ah");
    const wantedKwh = queryKwh(q);
    if (wantedKwh !== undefined && !(q.capacityAh !== undefined && r.specs.capacityAh !== undefined && !q.capacityKwh)) {
      numeric("capacityKwh", wantedKwh, r.specs.nominalKwh, 0.02, 0.35, "kWh");
    }
  }
  if (r.category === "inverter") {
    numeric("ratedKw", q.ratedKw, r.specs.ratedKw, 0.02, 0.4, "kW");
    if (q.phase) {
      checked += 1;
      if (!r.specs.phase) missing.push(SPEC_LABEL.phase);
      else if (r.specs.phase !== q.phase) {
        differences.push(r.specs.phase === "single" ? "single-phase" : "three-phase");
        nearby = false;
      }
    }
    if (q.inverterType) {
      checked += 1;
      if (!r.specs.inverterType) missing.push(SPEC_LABEL.inverterType);
      else if (r.specs.inverterType !== q.inverterType) differences.push({ grid_tie: "grid-tie", hybrid: "hybrid", off_grid: "off-grid" }[r.specs.inverterType]);
    }
  }
  if (r.category === "panel") numeric("ratedPowerW", q.ratedPowerW, r.specs.ratedPowerW, 0.01, 0.15, "W");

  if (q.chemistry && r.category === "battery") {
    checked += 1;
    if (!r.specs.chemistry) missing.push(SPEC_LABEL.chemistry);
    else if (r.specs.chemistry !== q.chemistry) differences.push(r.specs.chemistry);
  }
  if (q.brand && !q.model && normalizeToken(r.brand) !== normalizeToken(q.brand)) differences.push(`brand ${r.brand}`);

  if (q.model && checked === 0) return null;
  if (!nearby) return null;
  // With no specification to check, a listing is only a same-category option, never an exact match.
  const kind: MatchKind = checked > 0 && differences.length === 0 && missing.length === 0 ? "exact" : "alternative";
  return { record: r, kind, differences, missing };
}

/** Peso per nominal kWh, only when both price and nominal capacity are known. */
export function pricePerKwh(r: PriceRecord): number | null {
  if (r.category !== "battery" || r.pricePhp == null || !r.specs.nominalKwh) return null;
  return Math.round(r.pricePhp / r.specs.nominalKwh);
}

export interface MatchResult {
  exact: Match[];
  alternatives: Match[];
}

/** Filters records into exact matches and nearby alternatives, priced listings first. */
export function findComparables(q: SpecQuery, records: PriceRecord[], options: { maxAlternatives?: number } = {}): MatchResult {
  const exact: Match[] = [];
  const alternatives: Match[] = [];
  for (const record of records) {
    const m = compareRecord(q, record);
    if (!m) continue;
    const full = { ...m, pricePerKwh: pricePerKwh(record) };
    (m.kind === "exact" ? exact : alternatives).push(full);
  }
  const byPrice = (a: Match, b: Match) => (a.record.pricePhp ?? Infinity) - (b.record.pricePhp ?? Infinity) || Number(a.record.sample) - Number(b.record.sample);
  const wanted = queryKwh(q);
  const closeness = (m: Match) =>
    m.differences.length * 10 + m.missing.length * 5 + (wanted && m.record.specs.nominalKwh ? Math.abs(m.record.specs.nominalKwh - wanted) / wanted : 0);
  exact.sort(byPrice);
  alternatives.sort((a, b) => closeness(a) - closeness(b) || byPrice(a, b));
  return { exact, alternatives: alternatives.slice(0, options.maxAlternatives ?? 4) };
}

export type PriceSummary =
  | { basis: PriceBasis; kind: "range"; count: number; minPhp: number; maxPhp: number; medianPhp: number; unit: string; unpriced: number }
  | { basis: PriceBasis; kind: "single"; count: 1; pricePhp: number; unit: string; unpriced: number }
  | { basis: PriceBasis; kind: "none"; count: 0; unit: string; unpriced: number };

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Observed prices for a set of exact matches, one summary per (price basis, unit) pair so
 * equipment-only and installed prices are never combined.
 */
export function summarizePrices(matches: Match[]): PriceSummary[] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = `${m.record.priceBasis}|${m.record.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const order: PriceBasis[] = ["equipment_only", "equipment_delivered", "supply_and_install"];
  return [...groups.entries()]
    .map(([key, group]): PriceSummary => {
      const [basis, unit] = key.split("|") as [PriceBasis, string];
      const prices = group.map((m) => m.record.pricePhp).filter((p): p is number => p != null && p > 0);
      const unpriced = group.length - prices.length;
      if (prices.length === 0) return { basis, kind: "none", count: 0, unit, unpriced };
      if (prices.length === 1) return { basis, kind: "single", count: 1, pricePhp: prices[0], unit, unpriced };
      return { basis, kind: "range", count: prices.length, minPhp: Math.min(...prices), maxPhp: Math.max(...prices), medianPhp: median(prices), unit, unpriced };
    })
    .sort((a, b) => order.indexOf(a.basis) - order.indexOf(b.basis));
}

/** Specs the user should add to narrow the search, given the category. */
export function missingQueryInfo(q: SpecQuery): string[] {
  const out: string[] = [];
  if (!q.category && !q.model) out.push("the type of equipment (battery, inverter or panel) or an exact model");
  if (q.category === "battery" && !q.model) {
    if (!queryKwh(q)) out.push("capacity (kWh, or voltage and amp-hours)");
    if (!q.chemistry) out.push("chemistry (for example LiFePO4)");
  }
  if (q.category === "inverter" && !q.model) {
    if (!q.ratedKw) out.push("rated output in kW");
    if (!q.inverterType) out.push("type (grid-tie, hybrid or off-grid)");
  }
  if (q.category === "panel" && !q.model && !q.ratedPowerW) out.push("panel wattage");
  return out;
}

/** Days since a source last confirmed the price. */
export function ageInDays(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

export const STALE_AFTER_DAYS = 90;
