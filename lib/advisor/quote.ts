/**
 * Quotation review: the validated shape of an extracted (or user-corrected) quotation and
 * deterministic checks on it. Pure; no I/O.
 */
import { z } from "zod";
import { nominalKwh, parseSpecText, type CatalogueVocabulary, type EquipmentCategory, type SpecQuery } from "@/lib/advisor/specs";

const money = z.number().finite().min(0).max(100_000_000).nullable().optional();
const text = (max: number) => z.string().trim().max(max);

export const quoteItemSchema = z.object({
  description: text(200).min(1),
  brand: text(60).nullable().optional(),
  model: text(60).nullable().optional(),
  category: z.enum(["panel", "inverter", "battery", "mounting", "accessory", "other"]).nullable().optional(),
  quantity: z.number().finite().positive().max(100_000),
  unitPricePhp: money,
  lineTotalPhp: money,
});

export const quoteDataSchema = z.object({
  supplierName: text(120).nullable().optional(),
  quoteDate: text(20).nullable().optional(),
  items: z.array(quoteItemSchema).max(40),
  installationPhp: money,
  otherCharges: z.array(z.object({ label: text(80).min(1), amountPhp: z.number().finite().min(0).max(100_000_000) })).max(10).default([]),
  totalPhp: money,
  warranties: z.array(z.object({ item: text(80).min(1), years: z.number().finite().min(0).max(50).nullable().optional(), text: text(200).nullable().optional() })).max(15).default([]),
  inclusions: z.array(text(160).min(1)).max(20).default([]),
  exclusions: z.array(text(160).min(1)).max(20).default([]),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;
export type QuoteData = z.infer<typeof quoteDataSchema>;

export function emptyQuote(): QuoteData {
  return { supplierName: null, quoteDate: null, items: [], installationPhp: null, otherCharges: [], totalPhp: null, warranties: [], inclusions: [], exclusions: [] };
}

/** Line total from the quote, or quantity × unit price when only the unit price is stated. */
export function lineTotal(item: QuoteItem): number | null {
  if (item.lineTotalPhp != null) return item.lineTotalPhp;
  if (item.unitPricePhp != null) return Math.round(item.unitPricePhp * item.quantity * 100) / 100;
  return null;
}

export function unitPrice(item: QuoteItem): number | null {
  if (item.unitPricePhp != null) return item.unitPricePhp;
  if (item.lineTotalPhp != null && item.quantity > 0) return Math.round((item.lineTotalPhp / item.quantity) * 100) / 100;
  return null;
}

export interface QuoteItemAnalysis {
  index: number;
  item: QuoteItem;
  category: EquipmentCategory | null;
  query: SpecQuery;
  lineTotalPhp: number | null;
  unitPricePhp: number | null;
  nominalKwh: number | null;
}

export interface QuoteAnalysis {
  items: QuoteItemAnalysis[];
  itemsSubtotalPhp: number | null;
  computedTotalPhp: number | null;
  statedTotalPhp: number | null;
  totalDifferencePhp: number | null;
  /** Equipment lines are comparable with equipment-only catalogue prices only when installation is priced separately. */
  equipmentLinesComparable: boolean;
  missing: string[];
}

/** Arithmetic checks and missing-information list for a quotation. */
export function analyzeQuote(data: QuoteData, vocabulary?: CatalogueVocabulary): QuoteAnalysis {
  const items = data.items.map((item, index): QuoteItemAnalysis => {
    const query = parseSpecText([item.brand, item.model, item.description].filter(Boolean).join(" "), vocabulary);
    const category = (item.category && item.category !== "other" ? item.category : query.category) ?? null;
    if (category) query.category = category;
    if (item.model) query.model = item.model;
    if (item.brand) query.brand = item.brand;
    let kwh: number | null = null;
    if (category === "battery") {
      kwh = query.capacityKwh ?? (query.nominalVoltageV && query.capacityAh ? nominalKwh(query.nominalVoltageV, query.capacityAh) : null);
    }
    return { index, item, category, query, lineTotalPhp: lineTotal(item), unitPricePhp: unitPrice(item), nominalKwh: kwh };
  });

  const lines = items.map((i) => i.lineTotalPhp);
  const itemsSubtotalPhp = lines.length && lines.every((l) => l != null) ? round2(lines.reduce<number>((s, l) => s + (l ?? 0), 0)) : null;
  const extras = (data.installationPhp ?? 0) + data.otherCharges.reduce((s, c) => s + c.amountPhp, 0);
  const computedTotalPhp = itemsSubtotalPhp == null ? null : round2(itemsSubtotalPhp + extras);
  const statedTotalPhp = data.totalPhp ?? null;
  const totalDifferencePhp = computedTotalPhp != null && statedTotalPhp != null ? round2(statedTotalPhp - computedTotalPhp) : null;

  const mentionsInstall = [...data.inclusions, ...data.items.map((i) => i.description)].some((t) => /install|labor|labour|kabit/i.test(t));
  const equipmentLinesComparable = data.installationPhp != null && data.installationPhp > 0;

  const missing: string[] = [];
  if (!data.items.length) missing.push("No equipment lines were found. Add them so the quotation can be compared.");
  items.forEach((i) => {
    if (i.category && ["panel", "inverter", "battery"].includes(i.category) && !i.item.model) missing.push(`Line ${i.index + 1} (${i.item.description}) has no model number, so it can only be compared by specifications.`);
    if (i.lineTotalPhp == null) missing.push(`Line ${i.index + 1} (${i.item.description}) has no price.`);
  });
  if (statedTotalPhp == null) missing.push("No overall total is stated.");
  if (data.installationPhp == null) {
    missing.push(mentionsInstall ? "Installation is mentioned but not priced separately, so equipment lines may include labour." : "Installation is not mentioned. Ask whether it is included.");
  }
  if (!data.warranties.length) missing.push("No warranty terms are stated. Ask for product and workmanship warranties in writing.");
  if (totalDifferencePhp != null && Math.abs(totalDifferencePhp) >= 1) {
    missing.push(`The stated total differs from the sum of the lines by ₱${Math.abs(totalDifferencePhp).toLocaleString("en-PH")}. Ask the installer to explain (for example VAT, discounts or omitted items).`);
  }
  return { items, itemsSubtotalPhp, computedTotalPhp, statedTotalPhp, totalDifferencePhp, equipmentLinesComparable, missing };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
