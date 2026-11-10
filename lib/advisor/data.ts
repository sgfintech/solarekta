import "server-only";
import { db } from "@/lib/db";
import { parseSpecs } from "@/lib/marketplace";
import { normalizeChemistry, nominalKwh, type CatalogueVocabulary } from "@/lib/advisor/specs";
import { loadFeedRecords } from "@/lib/advisor/feed";
import type { PriceRecord, RecordSpecs } from "@/lib/advisor/match";
import type { CatalogueItem } from "@/lib/marketplace-data";

/**
 * Sample (demo) listings are used only in development, or when ADVISOR_SAMPLE_DATA=on is
 * set explicitly for a local demo. They are always labelled "Sample data" in results.
 */
export function sampleDataAllowed(): boolean {
  const flag = process.env.ADVISOR_SAMPLE_DATA;
  if (flag === "on") return true;
  if (flag === "off") return false;
  return process.env.NODE_ENV !== "production";
}

const splitList = (value: string | null | undefined) =>
  (value ?? "")
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);

/** Converts a reviewed catalogue product into a price record with deterministic capacity. */
export function catalogueRecord(p: CatalogueItem): PriceRecord {
  const s = parseSpecs(p.specs_json);
  const derived = !s.capacityKwh && s.nominalVoltageV && s.capacityAh ? nominalKwh(s.nominalVoltageV, s.capacityAh) : undefined;
  const specs: RecordSpecs = {
    nominalVoltageV: s.nominalVoltageV,
    capacityAh: s.capacityAh,
    nominalKwh: s.capacityKwh ?? derived,
    nominalKwhDerived: derived !== undefined,
    usableKwh: s.usableCapacityKwh,
    dodPercent: s.dodPercent,
    chemistry: normalizeChemistry(s.chemistry),
    ratedKw: s.ratedKw,
    ratedPowerW: s.ratedPowerW,
    efficiencyPct: s.efficiencyPct,
    phase: s.phase,
    inverterType: s.inverterType,
    batteryVoltageV: s.batteryVoltageV,
    communication: Array.isArray(s.communication) ? s.communication : undefined,
    compatibleModels: Array.isArray(s.compatibleModels) ? s.compatibleModels : undefined,
  };
  return {
    ref: `catalogue:${p.id}`,
    sourceType: "catalogue",
    productId: p.id,
    supplierId: p.supplier_id,
    supplierSlug: p.supplier_slug,
    category: p.category,
    brand: p.brand,
    model: p.model,
    title: p.title,
    specs,
    currency: "PHP",
    pricePhp: p.price_php,
    unit: p.unit,
    priceBasis: p.price_basis ?? "equipment_only",
    inclusions: splitList(p.inclusions),
    exclusions: splitList(p.exclusions),
    supplierName: p.supplier_name,
    sourceUrl: `/equipment/${p.id}`,
    checkedAt: p.updated_at,
    sample: Boolean(p.supplier_is_demo),
    stockStatus: p.stock_status,
    warrantyYears: p.warranty_product_years,
  };
}

const PUBLIC = "p.status = 'approved' AND s.verification_status = 'verified'";

function catalogueRows(): CatalogueItem[] {
  const sample = sampleDataAllowed() ? "" : " AND s.is_demo = 0";
  return db
    .prepare(
      `SELECT p.*, s.business_name AS supplier_name, s.slug AS supplier_slug, s.is_demo AS supplier_is_demo
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${PUBLIC}${sample} AND p.stock_status != 'out_of_stock'
       LIMIT 2000`,
    )
    .all() as CatalogueItem[];
}

let memo: { key: string; at: number; records: PriceRecord[] } | null = null;

/** Catalogue version: changes whenever any public listing changes. */
function catalogueVersion(): string {
  const row = db.prepare(`SELECT COUNT(*) AS c, MAX(p.updated_at) AS m FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE ${PUBLIC}`).get() as {
    c: number;
    m: string | null;
  };
  return `${row.c}|${row.m}|${sampleDataAllowed()}`;
}

/** Reviewed catalogue records, cached until a listing changes (or 5 minutes). */
export function loadCatalogueRecords(): PriceRecord[] {
  const key = catalogueVersion();
  if (memo && memo.key === key && Date.now() - memo.at < 5 * 60_000) return memo.records;
  const records = catalogueRows().map(catalogueRecord);
  memo = { key, at: Date.now(), records };
  return records;
}

/** All price records: verified catalogue first (primary source), then the optional feed. */
export async function loadPriceRecords(): Promise<{ records: PriceRecord[]; notices: string[] }> {
  const catalogue = loadCatalogueRecords();
  const feed = await loadFeedRecords();
  return { records: [...catalogue, ...feed.records], notices: feed.notice ? [feed.notice] : [] };
}

export function vocabularyFrom(records: PriceRecord[]): CatalogueVocabulary {
  return {
    brands: [...new Set(records.map((r) => r.brand))],
    models: records.map((r) => ({ model: r.model, brand: r.brand, category: r.category })),
  };
}

export function recordByRef(records: PriceRecord[], ref: string): PriceRecord | undefined {
  return records.find((r) => r.ref === ref);
}
