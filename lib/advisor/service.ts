import "server-only";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { aiExplain, aiExtractQuestion } from "@/lib/advisor/ai";
import { assessCompatibility } from "@/lib/advisor/compat";
import { loadPriceRecords, vocabularyFrom } from "@/lib/advisor/data";
import { findComparables, missingQueryInfo, PRICE_BASIS_LABEL, summarizePrices, type PriceRecord } from "@/lib/advisor/match";
import { analyzeQuote, quoteDataSchema } from "@/lib/advisor/quote";
import { describeQuery, detectIntent, findModels, isFollowUp, nominalKwh, normalizeToken, parseSpecText, type AdvisorIntent, type SpecQuery } from "@/lib/advisor/specs";
import { compareNotes, compareRows, describeSummary, toMatchView, toRecordView, type AdvisorAnswer, type AdvisorBlock } from "@/lib/advisor/view";
import type { QuoteReviewRow } from "@/lib/types";

export const EXAMPLE_QUESTIONS = [
  "How much is a 51.2V 300Ah LiFePO4 battery?",
  "Compare these two batteries.",
  "What is included in this quotation?",
  "Will this battery work with my inverter?",
];

export interface Owner {
  userId: string | null;
  /** sha256 of the guest cookie token, for signed-out visitors. */
  guestKey: string | null;
}

interface ThreadContext {
  lastQuery?: SpecQuery;
  lastRefs?: string[];
  lastExactCount?: number;
  lastIntent?: AdvisorIntent;
  lastQuoteReviewId?: string;
}

interface ThreadRow {
  id: string;
  user_id: string | null;
  guest_key: string | null;
  context_json: string;
}

/* ----------------------------------------------------------------------------
 * Ownership, threads and quotas
 * ------------------------------------------------------------------------- */

/** Returns a thread only if it belongs to the owner (user, or guest key when signed out). */
export function getThread(threadId: string, owner: Owner): ThreadRow | undefined {
  if (owner.userId) return db.prepare("SELECT * FROM advisor_threads WHERE id = ? AND user_id = ?").get(threadId, owner.userId) as ThreadRow | undefined;
  if (owner.guestKey) return db.prepare("SELECT * FROM advisor_threads WHERE id = ? AND user_id IS NULL AND guest_key = ?").get(threadId, owner.guestKey) as ThreadRow | undefined;
  return undefined;
}

export function latestThread(owner: Owner): ThreadRow | undefined {
  if (owner.userId) return db.prepare("SELECT * FROM advisor_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(owner.userId) as ThreadRow | undefined;
  if (owner.guestKey) return db.prepare("SELECT * FROM advisor_threads WHERE user_id IS NULL AND guest_key = ? ORDER BY updated_at DESC LIMIT 1").get(owner.guestKey) as ThreadRow | undefined;
  return undefined;
}

function createThread(owner: Owner): ThreadRow {
  const t = nowIso();
  const row: ThreadRow = { id: newId(), user_id: owner.userId, guest_key: owner.userId ? null : owner.guestKey, context_json: "{}" };
  db.prepare("INSERT INTO advisor_threads (id, user_id, guest_key, context_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.user_id, row.guest_key, row.context_json, t, t);
  // Retention: conversations idle for 30 days are removed.
  db.prepare("DELETE FROM advisor_threads WHERE updated_at < ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString());
  return row;
}

export function threadTurns(thread: ThreadRow): AdvisorAnswer[] {
  const rows = db.prepare("SELECT response_json FROM advisor_turns WHERE thread_id = ? ORDER BY created_at ASC LIMIT 30").all(thread.id) as { response_json: string }[];
  return rows.map((r) => JSON.parse(r.response_json) as AdvisorAnswer);
}

export function deleteThread(threadId: string, owner: Owner): boolean {
  const thread = getThread(threadId, owner);
  if (!thread) return false;
  db.prepare("DELETE FROM advisor_threads WHERE id = ?").run(thread.id);
  return true;
}

export function dailyQuestionLimit(owner: Owner): number {
  const value = Number(owner.userId ? process.env.ADVISOR_DAILY_QUESTIONS : process.env.ADVISOR_GUEST_DAILY_QUESTIONS);
  return Number.isFinite(value) && value > 0 ? value : owner.userId ? 60 : 15;
}

export function questionsToday(owner: Owner): number {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  if (owner.userId) return (db.prepare("SELECT COUNT(*) AS c FROM advisor_turns WHERE user_id = ? AND created_at > ?").get(owner.userId, since) as { c: number }).c;
  if (owner.guestKey) return (db.prepare("SELECT COUNT(*) AS c FROM advisor_turns WHERE guest_key = ? AND created_at > ?").get(owner.guestKey, since) as { c: number }).c;
  return 0;
}

/* ----------------------------------------------------------------------------
 * Question handling
 * ------------------------------------------------------------------------- */

/** Specs to search alternatives for a known product. */
function queryFromRecord(r: PriceRecord): SpecQuery {
  const s = r.specs;
  const q: SpecQuery = { category: r.category };
  if (r.category === "battery") {
    if (s.nominalVoltageV) q.nominalVoltageV = s.nominalVoltageV;
    if (s.capacityAh) q.capacityAh = s.capacityAh;
    else if (s.nominalKwh) q.capacityKwh = s.nominalKwh;
    if (s.chemistry) q.chemistry = s.chemistry;
  } else if (r.category === "inverter") {
    if (s.ratedKw) q.ratedKw = s.ratedKw;
    if (s.phase) q.phase = s.phase;
    if (s.inverterType) q.inverterType = s.inverterType;
  } else if (r.category === "panel" && s.ratedPowerW) q.ratedPowerW = s.ratedPowerW;
  return q;
}

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

function priceBlock(query: SpecQuery, records: PriceRecord[], namedModel: PriceRecord | null): AdvisorBlock & { type: "price" } {
  let exact;
  let alternatives;
  if (namedModel) {
    const same = records.filter((r) => normalizeToken(r.model) === normalizeToken(namedModel.model) && normalizeToken(r.brand) === normalizeToken(namedModel.brand));
    const specQuery = queryFromRecord(namedModel);
    const near = findComparables(specQuery, records.filter((r) => !same.includes(r)));
    exact = findComparables({ category: namedModel.category, model: namedModel.model, brand: namedModel.brand }, same).exact;
    alternatives = [...near.exact.map((m) => ({ ...m, kind: "alternative" as const, differences: [`different model (${m.record.brand} ${m.record.model})`] })), ...near.alternatives].slice(0, 4);
  } else {
    ({ exact, alternatives } = findComparables(query, records));
  }
  const kwh = query.category === "battery" && query.nominalVoltageV && query.capacityAh ? nominalKwh(query.nominalVoltageV, query.capacityAh) : null;
  const priced = exact.filter((m) => m.record.pricePhp != null);
  const suppliers = new Map<string, { supplierId: string; supplierName: string; productId: string | null }>();
  if (priced.length === 0) {
    for (const m of [...exact, ...alternatives]) {
      if (m.record.supplierId && !suppliers.has(m.record.supplierId)) suppliers.set(m.record.supplierId, { supplierId: m.record.supplierId, supplierName: m.record.supplierName, productId: m.record.productId ?? null });
    }
    if (suppliers.size === 0 && query.category) {
      for (const r of records) {
        if (r.category === query.category && r.supplierId && !suppliers.has(r.supplierId)) suppliers.set(r.supplierId, { supplierId: r.supplierId, supplierName: r.supplierName, productId: null });
      }
    }
  }
  return {
    type: "price",
    heading: namedModel ? `${namedModel.brand} ${namedModel.model}` : describeQuery(query),
    query: namedModel ? { ...queryFromRecord(namedModel), brand: namedModel.brand, model: namedModel.model } : query,
    requested: kwh ? { nominalKwh: kwh, calc: `${query.nominalVoltageV} V × ${query.capacityAh} Ah ÷ 1,000 = ${kwh} kWh nominal` } : null,
    exact: exact.map((m) => toMatchView(m)),
    alternatives: alternatives.map((m) => toMatchView(m)),
    summaries: summarizePrices(exact),
    missingInfo: namedModel ? [] : missingQueryInfo(query),
    quoteSuppliers: [...suppliers.values()].slice(0, 4),
  };
}

function priceSummaryText(block: AdvisorBlock & { type: "price" }): string {
  const what = block.heading;
  const capacity = block.requested ? ` (${block.requested.nominalKwh} kWh nominal)` : "";
  if (block.exact.length) {
    const first = block.summaries[0];
    const line = first ? describeSummary(first) : "";
    const rest = block.summaries.slice(1).map((s) => {
      const n = s.count + s.unpriced;
      return `${n} ${PRICE_BASIS_LABEL[s.basis].toLowerCase()} ${n === 1 ? "listing is" : "listings are"}`;
    });
    const others = rest.length ? ` ${rest.join(" and ")} shown separately, not mixed into this range.` : "";
    return `Found ${block.exact.length} exact ${block.exact.length === 1 ? "match" : "matches"} for ${what}${capacity}. ${line}${others}`.trim();
  }
  if (block.alternatives.length && block.missingInfo.length && !block.exact.length && block.alternatives.every((a) => !a.differences.length && !a.missing.length)) {
    return `Here are ${block.alternatives.length} listed options. Add ${block.missingInfo.join(" and ")} to find exact matches and a price range.`;
  }
  if (block.alternatives.length) return `No exact matches for ${what}${capacity}. Showing ${block.alternatives.length} nearby ${block.alternatives.length === 1 ? "alternative" : "alternatives"}. Check the differences before comparing prices.`;
  return `We don't have reliable price data for ${what}${capacity} yet. You can request a quotation from a verified supplier.`;
}

function explanationFacts(block: AdvisorBlock & { type: "price" }) {
  return {
    equipment: block.heading,
    requestedNominalKwh: block.requested?.nominalKwh ?? null,
    exactMatches: block.exact.length,
    alternatives: block.alternatives.length,
    observedPrices: block.summaries.map((s) =>
      s.kind === "range" ? { basis: s.basis, listings: s.count, minPhp: s.minPhp, maxPhp: s.maxPhp, medianPhp: s.medianPhp, unit: s.unit } : s.kind === "single" ? { basis: s.basis, listings: 1, pricePhp: s.pricePhp, unit: s.unit } : { basis: s.basis, listings: 0 },
    ),
    missingInfo: block.missingInfo,
  };
}

/** Model numbers the user typed that are not in the catalogue (for "not found" messages). */
function unknownModelTokens(question: string, known: string[]): string[] {
  const tokens = question.match(/\b[A-Za-z]{1,6}[-\s]?\d[\w.-]*\b/g) ?? [];
  return tokens
    .filter((t) => !/^\d+(\.\d+)?\s*(v|vdc|ah|kwh|kw|kva|w|wp)$/i.test(t.replace(/^[a-z]+\s?/i, "")) && !/^(v|ah|kw|kwh)\d/i.test(t))
    .filter((t) => /\d/.test(t) && /[a-z]/i.test(t) && !/^\d/.test(t))
    .filter((t) => !known.some((k) => normalizeToken(k) === normalizeToken(t)))
    .slice(0, 3);
}

function latestQuoteReview(userId: string, preferredId?: string): QuoteReviewRow | undefined {
  if (preferredId) {
    const row = db.prepare("SELECT * FROM quote_reviews WHERE id = ? AND user_id = ?").get(preferredId, userId) as QuoteReviewRow | undefined;
    if (row) return row;
  }
  return db.prepare("SELECT * FROM quote_reviews WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(userId) as QuoteReviewRow | undefined;
}

export interface AskInput {
  question: string;
  threadId?: string | null;
  productId?: string | null;
  quoteReviewId?: string | null;
}

/**
 * Answers one advisor question for an owner. Prices, sources and calculations come from
 * stored records and deterministic code; the model may only extract specs from the
 * question and phrase a validated summary. Callers must apply rate limits first.
 */
export async function askAdvisor(owner: Owner, input: AskInput): Promise<AdvisorAnswer> {
  const thread = (input.threadId && getThread(input.threadId, owner)) || createThread(owner);
  const context: ThreadContext = JSON.parse(thread.context_json || "{}");
  if (input.quoteReviewId) context.lastQuoteReviewId = input.quoteReviewId;
  const { records, notices } = await loadPriceRecords();
  const vocabulary = vocabularyFrom(records);
  const question = input.question.trim();

  let query = parseSpecText(question, vocabulary);
  let intent = detectIntent(question);
  const modelNames = findModels(question, vocabulary).map((m) => m.model);
  let aiUsed = false;

  const ai = await aiExtractQuestion(question, owner.userId);
  if (ai) {
    aiUsed = true;
    if (intent === "other") intent = ai.intent;
    query = { ...ai.query, ...query };
    for (const m of ai.models) {
      const known = vocabulary.models.find((v) => normalizeToken(v.model) === normalizeToken(m));
      if (known && !modelNames.includes(known.model)) modelNames.push(known.model);
    }
  }

  let namedRecords = modelNames.map((m) => records.find((r) => normalizeToken(r.model) === normalizeToken(m))).filter((r): r is PriceRecord => Boolean(r));
  if (input.productId) {
    const product = records.find((r) => r.productId === input.productId);
    if (product) {
      namedRecords = [product];
      intent = "price";
    }
  }
  const followUp = isFollowUp(question, query) || (namedRecords.length === 0 && Object.keys(query).filter((k) => k !== "category").length === 0 && (intent === "compare" || intent === "compatibility"));
  const contextRecords = (context.lastRefs ?? []).map((ref) => records.find((r) => r.ref === ref)).filter((r): r is PriceRecord => Boolean(r));

  const blocks: AdvisorBlock[] = [];
  let summary = "";
  let refs: string[] = context.lastRefs ?? [];
  let lastQuery = context.lastQuery;
  let exactCount = context.lastExactCount ?? 0;

  if (intent === "compatibility") {
    const pool = [...namedRecords, ...(followUp || namedRecords.length < 2 ? contextRecords : [])];
    const battery = pool.find((r) => r.category === "battery") ?? null;
    const inverter = pool.find((r) => r.category === "inverter") ?? null;
    const outcome = assessCompatibility({ battery, inverter, notFound: unknownModelTokens(question, vocabulary.models.map((m) => m.model)) });
    if (outcome.status === "need_models") {
      blocks.push({ type: "compatibility", status: "need_models", message: outcome.message, battery: battery ? toRecordView(battery) : null, inverter: inverter ? toRecordView(inverter) : null, checks: [] });
      summary = outcome.message;
    } else {
      blocks.push({ type: "compatibility", status: outcome.status, message: outcome.verdict, battery: toRecordView(outcome.battery), inverter: toRecordView(outcome.inverter), checks: outcome.checks });
      summary = outcome.verdict;
      refs = [outcome.battery.ref, outcome.inverter.ref];
      exactCount = 0;
    }
  } else if (intent === "compare") {
    let items = namedRecords.length >= 2 ? namedRecords : followUp || namedRecords.length === 0 ? [...namedRecords, ...contextRecords.filter((r) => !namedRecords.includes(r))] : namedRecords;
    if (items.length < 2 && Object.keys(query).length) {
      const found = findComparables(query, records);
      items = [...items, ...[...found.exact, ...found.alternatives].map((m) => m.record).filter((r) => !items.includes(r))];
    }
    const wantTwo = /\b(two|both|2|dalawa)\b/i.test(question);
    const priorExact = context.lastExactCount ?? 0;
    items = items.slice(0, wantTwo ? 2 : priorExact >= 2 && namedRecords.length === 0 ? Math.min(priorExact, 3) : 3);
    if (items.length < 2) {
      const message = "Tell me which products to compare: name two exact models, or first ask about a product type (for example “51.2V 300Ah LiFePO4 battery”) and then ask to compare.";
      blocks.push({ type: "need_info", message, suggestions: ["How much is a 51.2V 300Ah LiFePO4 battery?", "Show 5 kW hybrid inverters"] });
      summary = message;
    } else {
      const views = items.map((r) => toRecordView(r));
      blocks.push({ type: "compare", items: views, rows: compareRows(views), notes: compareNotes(views) });
      const priced = views.filter((v) => v.pricePhp != null);
      const cheapest = priced.length >= 2 ? priced.reduce((a, b) => ((a.pricePhp ?? 0) <= (b.pricePhp ?? 0) ? a : b)) : null;
      summary = `Comparing ${views.map((v) => `${v.brand} ${v.model}`).join(" and ")}.${cheapest && new Set(views.map((v) => v.priceBasis)).size === 1 ? ` The lowest listed price is ${peso(cheapest.pricePhp!)} (${cheapest.brand} ${cheapest.model}).` : ""}`;
      refs = items.map((r) => r.ref);
      exactCount = refs.length;
    }
  } else if (intent === "quote_contents") {
    const review = owner.userId ? latestQuoteReview(owner.userId, context.lastQuoteReviewId) : undefined;
    if (!review) {
      const message = owner.userId ? "Upload your quotation (PDF or photo) and I’ll list what it includes, excludes and leaves unclear." : "Log in and upload your quotation (PDF or photo) to review what it includes. Quotations stay private to your account.";
      blocks.push({ type: "quote_contents", reviewId: null, supplierName: null, items: [], installationPhp: null, totalPhp: null, inclusions: [], exclusions: [], warranties: [], missing: [], needsUpload: true });
      summary = message;
    } else {
      const data = quoteDataSchema.parse(JSON.parse(review.data_json));
      const analysis = analyzeQuote(data, vocabulary);
      blocks.push({
        type: "quote_contents",
        reviewId: review.id,
        supplierName: data.supplierName ?? null,
        items: analysis.items.map((i) => ({ description: i.item.description, quantity: i.item.quantity, lineTotalPhp: i.lineTotalPhp })),
        installationPhp: data.installationPhp ?? null,
        totalPhp: data.totalPhp ?? null,
        inclusions: data.inclusions,
        exclusions: data.exclusions,
        warranties: data.warranties.map((w) => ({ item: w.item, years: w.years ?? null, text: w.text ?? null })),
        missing: analysis.missing,
        needsUpload: false,
      });
      context.lastQuoteReviewId = review.id;
      summary = `Your quotation lists ${data.items.length} ${data.items.length === 1 ? "line" : "lines"}${data.inclusions.length ? ` and states ${data.inclusions.length} inclusions` : ", with no inclusions stated explicitly"}. ${analysis.missing.length ? `${analysis.missing.length} points need clarifying.` : ""}`.trim();
    }
  } else {
    const named = namedRecords[0] ?? null;
    if (!named && followUp && context.lastQuery) query = { ...context.lastQuery, ...query };
    const hasSpecs = Object.keys(query).some((k) => k !== "category" && k !== "brand") || (query.category && (query.brand || intent === "price"));
    if (!named && !hasSpecs) {
      const message = "Tell me the equipment and its key specs, for example “51.2V 300Ah LiFePO4 battery”, “5 kW hybrid inverter” or “550 W panel”, or an exact model number.";
      blocks.push({ type: "need_info", message, suggestions: EXAMPLE_QUESTIONS.slice(0, 1).concat(["Price of a 5 kW hybrid inverter", "550W solar panel price"]) });
      summary = message;
    } else {
      const block = priceBlock(query, records, named);
      blocks.push(block);
      summary = priceSummaryText(block);
      refs = [...block.exact, ...block.alternatives].map((m) => m.record.ref).slice(0, 6);
      exactCount = block.exact.length;
      lastQuery = block.query;
      const explained = await aiExplain(explanationFacts(block), owner.userId);
      if (explained) {
        summary = explained;
        aiUsed = true;
      }
    }
  }

  const answer: AdvisorAnswer = {
    threadId: thread.id,
    turnId: newId(),
    question: question.slice(0, 500),
    intent,
    summary,
    summarySource: aiUsed && blocks[0]?.type === "price" && summary !== priceSummaryText(blocks[0]) ? "ai" : "deterministic",
    blocks,
    notices,
    createdAt: nowIso(),
  };
  const t = answer.createdAt;
  db.transaction(() => {
    db.prepare("INSERT INTO advisor_turns (id, thread_id, user_id, guest_key, question, intent, response_json, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      answer.turnId,
      thread.id,
      owner.userId,
      owner.userId ? null : owner.guestKey,
      answer.question,
      intent,
      JSON.stringify(answer),
      aiUsed ? 1 : 0,
      t,
    );
    const nextContext: ThreadContext = { lastQuery, lastRefs: refs, lastExactCount: exactCount, lastIntent: intent, lastQuoteReviewId: context.lastQuoteReviewId };
    db.prepare("UPDATE advisor_threads SET context_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(nextContext), t, thread.id);
  })();
  return answer;
}

