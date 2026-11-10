/**
 * Serializable view models for advisor results, shared by server and client. Pure.
 */
import { CATEGORY_SINGULAR } from "@/lib/marketplace";
import { usableCapacity, type SpecQuery, type UsableEstimate } from "@/lib/advisor/specs";
import { ageInDays, PRICE_BASIS_LABEL, STALE_AFTER_DAYS, type Match, type MatchKind, type PriceBasis, type PriceRecord, type PriceSummary } from "@/lib/advisor/match";
import type { CompatibilityCheck } from "@/lib/advisor/compat";

export interface RecordView {
  ref: string;
  sourceType: "catalogue" | "feed";
  productId: string | null;
  supplierId: string | null;
  supplierSlug: string | null;
  category: string;
  categoryLabel: string;
  brand: string;
  model: string;
  title: string;
  specChips: string[];
  nominalKwh: number | null;
  /** Shown when nominal capacity was calculated: "51.2 V × 300 Ah ÷ 1,000 = 15.36 kWh". */
  nominalCalc: string | null;
  usable: UsableEstimate | null;
  pricePhp: number | null;
  unit: string;
  priceBasis: PriceBasis;
  priceBasisLabel: string;
  pricePerKwh: number | null;
  inclusions: string[];
  exclusions: string[];
  supplierName: string;
  sourceUrl: string;
  external: boolean;
  checkedAt: string;
  ageDays: number;
  stale: boolean;
  sample: boolean;
  stockStatus: string | null;
  warrantyYears: number | null;
}

export interface MatchView {
  record: RecordView;
  kind: MatchKind;
  differences: string[];
  missing: string[];
}

export type AdvisorBlock =
  | {
      type: "price";
      heading: string;
      query: SpecQuery;
      requested: { nominalKwh: number; calc: string } | null;
      exact: MatchView[];
      alternatives: MatchView[];
      summaries: PriceSummary[];
      missingInfo: string[];
      quoteSuppliers: { supplierId: string; supplierName: string; productId: string | null }[];
    }
  | { type: "compare"; items: RecordView[]; rows: { label: string; values: string[] }[]; notes: string[] }
  | {
      type: "compatibility";
      status: "need_models" | "verified" | "unverified" | "conflict";
      message: string;
      battery: RecordView | null;
      inverter: RecordView | null;
      checks: CompatibilityCheck[];
    }
  | {
      type: "quote_contents";
      reviewId: string | null;
      supplierName: string | null;
      items: { description: string; quantity: number; lineTotalPhp: number | null }[];
      installationPhp: number | null;
      totalPhp: number | null;
      inclusions: string[];
      exclusions: string[];
      warranties: { item: string; years: number | null; text: string | null }[];
      missing: string[];
      needsUpload: boolean;
    }
  | { type: "need_info"; message: string; suggestions: string[] };

export interface AdvisorAnswer {
  threadId: string;
  turnId: string;
  question: string;
  intent: string;
  summary: string;
  summarySource: "ai" | "deterministic";
  blocks: AdvisorBlock[];
  notices: string[];
  createdAt: string;
}

const fmt = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

export function specChips(r: PriceRecord): string[] {
  const s = r.specs;
  const out: string[] = [];
  if (r.category === "battery") {
    if (s.nominalVoltageV) out.push(`${fmt(s.nominalVoltageV)} V`);
    if (s.capacityAh) out.push(`${fmt(s.capacityAh)} Ah`);
    if (s.chemistry) out.push(s.chemistry);
    if (s.communication?.length) out.push(s.communication.join(" / "));
  } else if (r.category === "inverter") {
    if (s.ratedKw) out.push(`${fmt(s.ratedKw)} kW`);
    if (s.inverterType) out.push({ grid_tie: "Grid-tie", hybrid: "Hybrid", off_grid: "Off-grid" }[s.inverterType]);
    if (s.phase) out.push(s.phase === "single" ? "Single-phase" : "Three-phase");
    if (s.batteryVoltageV) out.push(`${fmt(s.batteryVoltageV)} V battery input`);
  } else if (r.category === "panel") {
    if (s.ratedPowerW) out.push(`${fmt(s.ratedPowerW)} W`);
    if (s.efficiencyPct) out.push(`${fmt(s.efficiencyPct)}% efficiency`);
  }
  return out;
}

export function toRecordView(r: PriceRecord, now = Date.now()): RecordView {
  const s = r.specs;
  const age = ageInDays(r.checkedAt, now);
  return {
    ref: r.ref,
    sourceType: r.sourceType,
    productId: r.productId ?? null,
    supplierId: r.supplierId ?? null,
    supplierSlug: r.supplierSlug ?? null,
    category: r.category,
    categoryLabel: CATEGORY_SINGULAR[r.category],
    brand: r.brand,
    model: r.model,
    title: r.title,
    specChips: specChips(r),
    nominalKwh: s.nominalKwh ?? null,
    nominalCalc: s.nominalKwhDerived && s.nominalVoltageV && s.capacityAh && s.nominalKwh ? `${fmt(s.nominalVoltageV)} V × ${fmt(s.capacityAh)} Ah ÷ 1,000 = ${fmt(s.nominalKwh)} kWh` : null,
    usable: r.category === "battery" ? usableCapacity({ nominalKwh: s.nominalKwh, usableKwh: s.usableKwh, dodPercent: s.dodPercent }) : null,
    pricePhp: r.pricePhp,
    unit: r.unit,
    priceBasis: r.priceBasis,
    priceBasisLabel: PRICE_BASIS_LABEL[r.priceBasis],
    pricePerKwh: r.category === "battery" && r.pricePhp != null && s.nominalKwh ? Math.round(r.pricePhp / s.nominalKwh) : null,
    inclusions: r.inclusions,
    exclusions: r.exclusions,
    supplierName: r.supplierName,
    sourceUrl: r.sourceUrl,
    external: r.sourceType === "feed",
    checkedAt: r.checkedAt,
    ageDays: age,
    stale: age > STALE_AFTER_DAYS,
    sample: r.sample,
    stockStatus: r.stockStatus ?? null,
    warrantyYears: r.warrantyYears ?? null,
  };
}

export function toMatchView(m: Match, now = Date.now()): MatchView {
  return { record: toRecordView(m.record, now), kind: m.kind, differences: m.differences, missing: m.missing };
}

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

/** One line describing observed prices; never a range from a single listing. */
export function describeSummary(s: PriceSummary): string {
  const basis = PRICE_BASIS_LABEL[s.basis].toLowerCase();
  const unpriced = s.unpriced ? ` ${s.unpriced} more listed as price on request.` : "";
  if (s.kind === "range") return `${peso(s.minPhp)} to ${peso(s.maxPhp)} per ${s.unit} across ${s.count} listings (median ${peso(s.medianPhp)}), ${basis}.${unpriced}`;
  if (s.kind === "single") return `One observed price: ${peso(s.pricePhp)} per ${s.unit}, ${basis}.${unpriced}`;
  return `No listed price, ${basis}.${unpriced}`;
}

/** Compare-table rows for 2–3 records. Missing values are shown as "Not stated". */
export function compareRows(items: RecordView[]): { label: string; values: string[] }[] {
  const ns = "Not stated";
  const rows: { label: string; values: string[] }[] = [
    { label: "Supplier", values: items.map((i) => i.supplierName) },
    { label: "Price", values: items.map((i) => (i.pricePhp != null ? `${peso(i.pricePhp)} / ${i.unit}` : "Price on request")) },
    { label: "Price covers", values: items.map((i) => i.priceBasisLabel) },
    { label: "Specifications", values: items.map((i) => i.specChips.join(", ") || ns) },
  ];
  if (items.some((i) => i.category === "battery")) {
    rows.push({ label: "Nominal capacity", values: items.map((i) => (i.nominalKwh ? `${i.nominalKwh} kWh` : ns)) });
    rows.push({ label: "Usable capacity", values: items.map((i) => (i.usable ? `${i.usable.usableKwh} kWh (${i.usable.basis === "manufacturer" ? "stated" : "from stated depth of discharge"})` : ns)) });
    rows.push({ label: "Price per nominal kWh", values: items.map((i) => (i.pricePerKwh != null ? peso(i.pricePerKwh) : "—")) });
  }
  rows.push({ label: "Product warranty", values: items.map((i) => (i.warrantyYears ? `${i.warrantyYears} years` : ns)) });
  rows.push({ label: "Included", values: items.map((i) => i.inclusions.join(", ") || ns) });
  rows.push({ label: "Price checked", values: items.map((i) => `${i.ageDays === 0 ? "today" : `${i.ageDays} days ago`}${i.stale ? " (may be outdated)" : ""}`) });
  return rows;
}

/** Notes for a comparison: mismatched categories, price bases or missing data. */
export function compareNotes(items: RecordView[]): string[] {
  const notes: string[] = [];
  if (new Set(items.map((i) => i.category)).size > 1) notes.push("These are different kinds of equipment, so prices are not directly comparable.");
  if (new Set(items.map((i) => i.priceBasis)).size > 1) notes.push("The prices cover different things (equipment only vs delivered or installed). Compare like with like before deciding.");
  if (items.some((i) => i.category === "battery" && !i.nominalKwh)) notes.push("Capacity is missing for at least one battery, so price per kWh cannot be compared.");
  if (items.some((i) => i.category === "battery") && items.every((i) => !i.usable)) notes.push("Usable capacity is not stated for these batteries; nominal capacity is shown instead.");
  if (items.some((i) => i.pricePhp == null)) notes.push("At least one listing has no public price. Request a quotation to compare.");
  return notes;
}
