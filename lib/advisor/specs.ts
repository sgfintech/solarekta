/**
 * Deterministic specification parsing and electrical calculations for the Solar Price
 * Advisor. Pure functions, no I/O. The language model may help extract specs, but every
 * number shown to a user is computed here or copied from a stored record.
 */

export type EquipmentCategory = "panel" | "inverter" | "battery" | "mounting" | "accessory";
export type InverterType = "grid_tie" | "hybrid" | "off_grid";
export type Phase = "single" | "three";

export interface SpecQuery {
  category?: EquipmentCategory;
  brand?: string;
  model?: string;
  nominalVoltageV?: number;
  capacityAh?: number;
  capacityKwh?: number;
  chemistry?: string;
  ratedKw?: number;
  ratedPowerW?: number;
  phase?: Phase;
  inverterType?: InverterType;
}

export type AdvisorIntent = "price" | "compare" | "quote_contents" | "compatibility" | "other";

export const SPEC_LABEL: Record<string, string> = {
  nominalVoltageV: "nominal voltage",
  capacityAh: "capacity (Ah)",
  capacityKwh: "capacity (kWh)",
  chemistry: "chemistry",
  ratedKw: "rated output (kW)",
  ratedPowerW: "rated power (W)",
  phase: "phase",
  inverterType: "inverter type",
};

const round = (value: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
};

/** Nominal energy = volts × amp-hours ÷ 1,000. Example: 51.2 V × 300 Ah = 15.36 kWh. */
export function nominalKwh(voltageV: number, capacityAh: number): number {
  if (!(voltageV > 0) || !(capacityAh > 0)) throw new RangeError("Voltage and amp-hours must be positive.");
  return round((voltageV * capacityAh) / 1000, 2);
}

export interface UsableEstimate {
  usableKwh: number;
  basis: "manufacturer" | "depth_of_discharge";
  assumptions: string[];
}

/**
 * Usable capacity is only estimated when an explicit basis exists: a manufacturer-stated
 * usable figure, or a stated depth of discharge. Never assumed.
 */
export function usableCapacity(input: { nominalKwh?: number | null; usableKwh?: number | null; dodPercent?: number | null }): UsableEstimate | null {
  if (input.usableKwh && input.usableKwh > 0) {
    return { usableKwh: round(input.usableKwh, 2), basis: "manufacturer", assumptions: ["Usable capacity as stated on the listing."] };
  }
  if (input.nominalKwh && input.nominalKwh > 0 && input.dodPercent && input.dodPercent > 0 && input.dodPercent <= 100) {
    return {
      usableKwh: round((input.nominalKwh * input.dodPercent) / 100, 2),
      basis: "depth_of_discharge",
      assumptions: [`Depth of discharge ${input.dodPercent}% as stated on the listing.`, "Excludes inverter and temperature losses."],
    };
  }
  return null;
}

/** Normalised chemistry label, or undefined. */
export function normalizeChemistry(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase().replace(/[\s-]/g, "");
  if (/lifepo4|lifepo|lfp|lithiumironphosphate/.test(v)) return "LiFePO4";
  if (/nmc|nickelmanganese/.test(v)) return "NMC";
  if (/agm/.test(v)) return "AGM lead-acid";
  if (/gel/.test(v)) return "Gel lead-acid";
  if (/leadacid|leadcarbon/.test(v)) return "Lead-acid";
  if (/lithiumion|liion/.test(v)) return "Lithium-ion";
  return value.trim().slice(0, 40);
}

/** Lower-case alphanumerics only; used to compare model numbers and brands. */
export const normalizeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const NUM = "(\\d+(?:[.,]\\d+)?)";
const toNum = (s: string) => Number(s.replace(",", "."));

function firstNumber(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern);
  if (!m) return undefined;
  const n = toNum(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface CatalogueVocabulary {
  brands: string[];
  models: { model: string; brand: string; category: EquipmentCategory }[];
}

/** Every model number mentioned in the text that exists in the vocabulary (in order). */
export function findModels(text: string, vocabulary: CatalogueVocabulary): { model: string; brand: string; category: EquipmentCategory }[] {
  const haystack = normalizeToken(text);
  const found = vocabulary.models
    .filter((m) => normalizeToken(m.model).length >= 3 && haystack.includes(normalizeToken(m.model)))
    .map((m) => ({ ...m, at: haystack.indexOf(normalizeToken(m.model)) }));
  // Prefer the longest overlapping match ("KG-10K" over "KG-1").
  const unique = found.filter((m) => !found.some((o) => o !== m && normalizeToken(o.model).includes(normalizeToken(m.model)) && o.model.length > m.model.length));
  return unique.sort((a, b) => a.at - b.at).map(({ at: _at, ...m }) => m);
}

/**
 * Deterministic extraction of specs from a free-text question. Recognises volts, Ah, kWh,
 * kW, W, chemistry, phase, inverter type and category words (English and common Filipino).
 */
export function parseSpecText(text: string, vocabulary?: CatalogueVocabulary): SpecQuery {
  const t = ` ${text.toLowerCase()} `;
  const q: SpecQuery = {};

  q.capacityKwh = firstNumber(t, new RegExp(`${NUM}\\s*kwh\\b`));
  q.capacityAh = firstNumber(t, new RegExp(`${NUM}\\s*(?:ah|a\\s?h|amp[-\\s]?hours?)\\b`));
  q.nominalVoltageV = firstNumber(t, new RegExp(`${NUM}\\s*(?:v|vdc|volts?)\\b`));
  q.ratedKw = firstNumber(t, new RegExp(`${NUM}\\s*(?:kw|kva)\\b(?!h)`));
  const watts = firstNumber(t, new RegExp(`\\b${NUM}\\s*(?:w|wp|watts?)\\b`));
  if (watts && watts >= 50 && watts <= 1000) q.ratedPowerW = watts;

  const chem = t.match(/lifepo4|lifepo|\blfp\b|lithium iron phosphate|\bnmc\b|lead[-\s]?acid|\bagm\b|\bgel\b|lithium[-\s]?ion|li[-\s]?ion/);
  if (chem) q.chemistry = normalizeChemistry(chem[0]);

  if (/single[-\s]?phase|1[-\s]?phase/.test(t)) q.phase = "single";
  else if (/three[-\s]?phase|3[-\s]?phase/.test(t)) q.phase = "three";
  if (/hybrid/.test(t)) q.inverterType = "hybrid";
  else if (/grid[-\s]?tie|on[-\s]?grid/.test(t)) q.inverterType = "grid_tie";
  else if (/off[-\s]?grid/.test(t)) q.inverterType = "off_grid";

  if (/batter(y|ies)|baterya|\bbms\b/.test(t) || q.capacityAh || q.capacityKwh || q.chemistry) q.category = "battery";
  else if (/inverter/.test(t) || q.inverterType || q.phase) q.category = "inverter";
  else if (/panel|module|\bpv\b|solar panel/.test(t) || q.ratedPowerW) q.category = "panel";
  else if (/rail|mount|racking|clamp/.test(t)) q.category = "mounting";
  else if (/cable|wire|connector|mc4|breaker/.test(t)) q.category = "accessory";

  // A kW figure on a battery question is a power rating we do not match on.
  if (q.category === "battery") q.ratedKw = undefined;
  if (q.category === "inverter") q.ratedPowerW = undefined;

  if (vocabulary) {
    const models = findModels(text, vocabulary);
    if (models[0]) {
      q.model = models[0].model;
      q.brand = models[0].brand;
      // A named model is more specific than a category word elsewhere in the question.
      q.category = models[0].category;
    } else {
      const brand = vocabulary.brands.find((b) => normalizeToken(b).length >= 3 && new RegExp(`\\b${b.toLowerCase().replace(/[^a-z0-9]/g, ".?")}\\b`).test(t));
      if (brand) q.brand = brand;
    }
  }
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as SpecQuery;
}

/** Deterministic intent detection. */
export function detectIntent(text: string): AdvisorIntent {
  const t = text.toLowerCase();
  if (/compat|work with|works with|gagana|pair with|connect(ed)? to|kasya/.test(t)) return "compatibility";
  if (/compar|versus|\bvs\.?\b|difference|which is better|alin ang mas/.test(t)) return "compare";
  if (/(quot|quotation|proposal|resibo).*(includ|kasama|exclud|cover|what is in)|(includ|kasama|exclud).*(quot|quotation|proposal)/.test(t)) return "quote_contents";
  if (/how much|price|cost|magkano|presyo|halaga|range|cheap|mura|expensive|per kwh/.test(t)) return "price";
  return "other";
}

/** True when the question points back to earlier results instead of naming equipment. */
export function isFollowUp(text: string, parsed: SpecQuery): boolean {
  const hasSpecs = Object.keys(parsed).some((k) => k !== "category");
  if (hasSpecs) return false;
  return /\b(these|those|them|this|that|it|both|they|ito|iyan|yan|yung|the two|the first|the second|cheaper|cheapest|which one)\b/i.test(text);
}

/** Voltage class used to judge "nearby" batteries. Not a compatibility test. */
export function voltageClass(v: number | undefined): string | undefined {
  if (!v) return undefined;
  if (v >= 10 && v <= 15) return "12V";
  if (v >= 20 && v <= 30) return "24V";
  if (v >= 40 && v <= 60) return "48V";
  if (v > 100) return "high-voltage";
  return undefined;
}

/** The battery energy a query asks for, from kWh or from V × Ah. */
export function queryKwh(q: SpecQuery): number | undefined {
  if (q.capacityKwh) return q.capacityKwh;
  if (q.nominalVoltageV && q.capacityAh) return nominalKwh(q.nominalVoltageV, q.capacityAh);
  return undefined;
}

/** Human description of a query for headings: "51.2 V 300 Ah LiFePO4 battery". */
export function describeQuery(q: SpecQuery): string {
  const parts: string[] = [];
  if (q.brand) parts.push(q.brand);
  if (q.model) parts.push(q.model);
  if (q.nominalVoltageV) parts.push(`${q.nominalVoltageV} V`);
  if (q.capacityAh) parts.push(`${q.capacityAh} Ah`);
  if (q.capacityKwh) parts.push(`${q.capacityKwh} kWh`);
  if (q.ratedKw) parts.push(`${q.ratedKw} kW`);
  if (q.ratedPowerW) parts.push(`${q.ratedPowerW} W`);
  if (q.chemistry) parts.push(q.chemistry);
  if (q.phase) parts.push(q.phase === "single" ? "single-phase" : "three-phase");
  if (q.inverterType) parts.push({ grid_tie: "grid-tie", hybrid: "hybrid", off_grid: "off-grid" }[q.inverterType]);
  const noun = q.category ? { panel: "solar panel", inverter: "inverter", battery: "battery", mounting: "mounting kit", accessory: "accessory" }[q.category] : "equipment";
  if (q.model) return parts.join(" ");
  return [...parts, noun].join(" ");
}
