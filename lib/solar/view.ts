import type { AssessmentResult, ScenarioResult, SizingStatus } from "@/lib/solar/engine";

/**
 * Display helpers that read both current (solar-ph-2026.2+) and historical
 * (solar-ph-2026.1) stored results without recalculating them. All derived values
 * are simple, deterministic transformations of stored engine output.
 */

export function isLegacyResult(result: AssessmentResult): boolean {
  return !result.sizing;
}

/** Annual solar generation ÷ annual electricity use. Energy, not money. */
export function generationRatio(scenario: Pick<ScenarioResult, "generationToUseRatio" | "offsetRatio">): number {
  return scenario.generationToUseRatio ?? scenario.offsetRatio ?? 0;
}

export function annualBillPhp(result: AssessmentResult): number {
  return result.annualBillPhp ?? Math.round(result.annualConsumptionKwh * result.effectiveTariffPhpPerKwh);
}

export function sizingStatus(result: AssessmentResult): SizingStatus {
  if (result.sizing) return result.sizing.status;
  return result.base.energyLimited ? "energy_led" : "roof_limited";
}

export interface ResultSummary {
  legacy: boolean;
  status: SizingStatus;
  hasSystem: boolean;
  capacityKwp: number;
  /** Average monthly savings = year-one savings ÷ 12. Not a month-by-month forecast. */
  monthlySavingsAvgPhp: number;
  monthlyBillAvgPhp: number;
  /** Year-one savings ÷ year-one bill at today's rate (same baseline period). */
  billSavingsRatio: number;
  generationRatio: number;
  capexPhp: number;
  paybackYears: number | null;
  monthlySavingsRange: { low: number; high: number };
  /** True when low/high scenarios use the same system size (2026.2+). */
  rangeIsSameSize: boolean;
}

export function summarizeResult(result: AssessmentResult): ResultSummary {
  const base = result.base;
  const bill = annualBillPhp(result);
  const monthly = result.scenarios.map((s) => Math.round(s.annualSavingsPhp / 12));
  return {
    legacy: isLegacyResult(result),
    status: sizingStatus(result),
    hasSystem: base.capacityKwp > 0,
    capacityKwp: base.capacityKwp,
    monthlySavingsAvgPhp: Math.round(base.annualSavingsPhp / 12),
    monthlyBillAvgPhp: Math.round(bill / 12),
    billSavingsRatio: base.billSavingsRatio ?? (bill > 0 ? base.annualSavingsPhp / bill : 0),
    generationRatio: generationRatio(base),
    capexPhp: base.capexPhp,
    paybackYears: base.paybackYears,
    monthlySavingsRange: { low: Math.min(...monthly), high: Math.max(...monthly) },
    rangeIsSameSize: !isLegacyResult(result),
  };
}

export const EXPORT_CHOICE_LABEL: Record<string, string> = {
  net_metering: "Net-metering (credit for extra power)",
  zero_export: "Zero export (no credit)",
  not_sure: "Not sure yet",
};
