import "server-only";
import { db } from "@/lib/db";
import { loadCatalogueRecords, vocabularyFrom } from "@/lib/advisor/data";
import { findComparables, summarizePrices, type PriceSummary } from "@/lib/advisor/match";
import { analyzeQuote, emptyQuote, quoteDataSchema, type QuoteAnalysis, type QuoteData } from "@/lib/advisor/quote";
import { toMatchView, toRecordView, type MatchView, type RecordView } from "@/lib/advisor/view";
import type { QuoteReviewRow, SupplierQuoteRequestRow } from "@/lib/types";

/** Quotation reviews are private to their owner. Every query is scoped by user id. */
export function getQuoteReview(id: string, userId: string): QuoteReviewRow | undefined {
  return db.prepare("SELECT * FROM quote_reviews WHERE id = ? AND user_id = ?").get(id, userId) as QuoteReviewRow | undefined;
}

export function listQuoteReviews(userId: string): QuoteReviewRow[] {
  return db.prepare("SELECT * FROM quote_reviews WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20").all(userId) as QuoteReviewRow[];
}

export function reviewData(row: QuoteReviewRow): QuoteData {
  try {
    const parsed = quoteDataSchema.safeParse(JSON.parse(row.data_json));
    return parsed.success ? parsed.data : emptyQuote();
  } catch {
    return emptyQuote();
  }
}

export interface QuoteItemComparison {
  index: number;
  comparable: boolean;
  reason: string | null;
  quoteUnitPricePhp: number | null;
  catalogue: PriceSummary | null;
  exactListings: RecordView[];
  alternatives: MatchView[];
}

/**
 * Compares each equipment line with equipment-only catalogue prices. A line is compared
 * only when installation is priced separately, so installed and equipment-only prices are
 * never mixed.
 */
export function compareQuote(data: QuoteData): { analysis: QuoteAnalysis; items: QuoteItemComparison[] } {
  const records = loadCatalogueRecords().filter((r) => r.priceBasis === "equipment_only");
  const analysis = analyzeQuote(data, vocabularyFrom(records));
  const items = analysis.items.map((i): QuoteItemComparison => {
    if (!i.category || !["panel", "inverter", "battery"].includes(i.category)) {
      return { index: i.index, comparable: false, reason: null, quoteUnitPricePhp: i.unitPricePhp, catalogue: null, exactListings: [], alternatives: [] };
    }
    const hasSpecs = Object.keys(i.query).some((k) => !["category", "brand"].includes(k));
    if (!hasSpecs) {
      return { index: i.index, comparable: false, reason: "Add a model number or key specs to compare this line.", quoteUnitPricePhp: i.unitPricePhp, catalogue: null, exactListings: [], alternatives: [] };
    }
    const found = findComparables(i.query, records, { maxAlternatives: 2 });
    const summary = summarizePrices(found.exact).find((s) => s.basis === "equipment_only") ?? null;
    return {
      index: i.index,
      comparable: analysis.equipmentLinesComparable,
      reason: analysis.equipmentLinesComparable ? null : "Installation is not priced separately, so this line may include labour and is not compared with equipment-only prices.",
      quoteUnitPricePhp: i.unitPricePhp,
      catalogue: summary,
      exactListings: found.exact.slice(0, 3).map((m) => toRecordView(m.record)),
      alternatives: found.alternatives.map((m) => toMatchView(m)),
    };
  });
  return { analysis, items };
}

/* ----------------------------------------------------------------------------
 * Buyer quotation requests to suppliers
 * ------------------------------------------------------------------------- */

export interface SupplierQuoteRequestView extends SupplierQuoteRequestRow {
  supplier_name: string;
  supplier_slug: string;
}

export function listCustomerQuoteRequests(userId: string): SupplierQuoteRequestView[] {
  return db
    .prepare(
      `SELECT r.*, s.business_name AS supplier_name, s.slug AS supplier_slug FROM supplier_quote_requests r
       JOIN suppliers s ON s.id = r.supplier_id WHERE r.customer_user_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    )
    .all(userId) as SupplierQuoteRequestView[];
}

export interface SupplierInboxRow extends SupplierQuoteRequestRow {
  customer_name: string;
}

/** Contact details are returned only when the buyer chose to share them. */
export function listSupplierQuoteRequests(supplierId: string): SupplierInboxRow[] {
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS customer_name FROM supplier_quote_requests r JOIN users u ON u.id = r.customer_user_id
       WHERE r.supplier_id = ? ORDER BY CASE r.status WHEN 'sent' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`,
    )
    .all(supplierId) as SupplierInboxRow[];
  return rows.map((r) => (r.share_contact ? r : { ...r, customer_name: "Buyer (contact not shared)", contact_name: null, contact_phone: null, contact_email: null }));
}
