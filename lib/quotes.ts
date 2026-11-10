import { EXPORT_CONFIG } from "@/lib/solar/assumptions";
import type { AssessmentResult } from "@/lib/solar/engine";

export interface QuoteMetrics {
  pricePerKwpPhp: number;
  estimatedAnnualSavingsPhp: number;
  estimatedPaybackYears: number | null;
  productionVsModelPct: number;
  costVsModelPhp: number;
}

/**
 * Normalises an installer quote against the deterministic assessment so customers can
 * compare bids. This is deliberately a simple, explainable calculation — not a promise
 * of savings from the installer or from SOLARekta.
 */
export function quoteMetrics(
  quote: { pricePhp: number; capacityKwp: number; expectedAnnualKwh: number },
  assessment: Pick<AssessmentResult, "effectiveTariffPhpPerKwh" | "daytimeConsumptionKwh" | "systemType" | "base" | "exportTreatment">,
): QuoteMetrics {
  const tariff = assessment.effectiveTariffPhpPerKwh;
  const selfConsumed = Math.min(quote.expectedAnnualKwh, assessment.daytimeConsumptionKwh);
  const exported = Math.max(0, quote.expectedAnnualKwh - selfConsumed);
  // Use exactly the export credit the assessment applied (stored), so comparisons stay consistent.
  const exportRatio =
    assessment.exportTreatment?.creditRatioApplied ??
    (assessment.systemType === "net_metering" ? EXPORT_CONFIG.netMeteringCreditRatioOfRetail : 0);
  const estimatedAnnualSavingsPhp = selfConsumed * tariff + exported * tariff * exportRatio;
  return {
    pricePerKwpPhp: quote.capacityKwp > 0 ? quote.pricePhp / quote.capacityKwp : 0,
    estimatedAnnualSavingsPhp,
    estimatedPaybackYears:
      estimatedAnnualSavingsPhp > 0 ? quote.pricePhp / estimatedAnnualSavingsPhp : null,
    productionVsModelPct:
      assessment.base.annualProductionKwh > 0
        ? quote.expectedAnnualKwh / assessment.base.annualProductionKwh - 1
        : 0,
    costVsModelPhp: quote.pricePhp - assessment.base.capexPhp,
  };
}
