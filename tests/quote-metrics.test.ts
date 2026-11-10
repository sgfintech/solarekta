import { describe, expect, it } from "vitest";
import { quoteMetrics } from "@/lib/quotes";
import { assessSolar } from "@/lib/solar/engine";
import type { AssessmentResult } from "@/lib/solar/engine";

const assessment = assessSolar({
  city: "Quezon City",
  monthlyKwh: 486,
  monthlyBillPhp: 5832,
  roofAreaM2: 82,
  roofType: "concrete",
  daytimeUsage: "medium",
  systemType: "net_metering",
  installBudgetPhp: null,
});

function fakeAssessment(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return { ...assessment, ...overrides };
}

describe("quote metrics", () => {
  it("normalises a quote against the assessment", () => {
    const metrics = quoteMetrics(
      { pricePhp: 188000, capacityKwp: 3.2, expectedAnnualKwh: 4380 },
      assessment,
    );

    expect(metrics.pricePerKwpPhp).toBe(58750);
    // 2,624 kWh self-consumed + 1,756 kWh exported at 55% of ₱12/kWh.
    expect(metrics.estimatedAnnualSavingsPhp).toBeCloseTo(43077.6, 5);
    expect(metrics.estimatedPaybackYears).toBeCloseTo(188000 / 43077.6, 5);
    expect(metrics.productionVsModelPct).toBeCloseTo(4380 / 3878 - 1, 5);
    expect(metrics.costVsModelPhp).toBe(188000 - 162704);
  });

  it("does not credit exports for a zero-export system", () => {
    const zeroExport = fakeAssessment({
      systemType: "zero_export",
      exportTreatment: { ...assessment.exportTreatment!, choice: "zero_export", creditRatioApplied: 0 },
    });
    const metrics = quoteMetrics({ pricePhp: 188000, capacityKwp: 3.2, expectedAnnualKwh: 4380 }, zeroExport);
    expect(metrics.estimatedAnnualSavingsPhp).toBe(2624 * 12);
  });

  it("uses the export credit stored on the assessment, including 'not sure' (no credit)", () => {
    const unsure = assessSolar({
      city: "Quezon City",
      monthlyKwh: 486,
      monthlyBillPhp: 5832,
      roofAreaM2: 82,
      roofType: "concrete",
      daytimeUsage: "medium",
      systemType: "not_sure",
    });
    const metrics = quoteMetrics({ pricePhp: 188000, capacityKwp: 3.2, expectedAnnualKwh: 4380 }, unsure);
    expect(metrics.estimatedAnnualSavingsPhp).toBe(2624 * 12);
  });

  it("falls back to the legacy 55% credit for 2026.1 results without stored export treatment", () => {
    const legacy = fakeAssessment({ exportTreatment: undefined, systemType: "net_metering" });
    const metrics = quoteMetrics({ pricePhp: 188000, capacityKwp: 3.2, expectedAnnualKwh: 4380 }, legacy);
    expect(metrics.estimatedAnnualSavingsPhp).toBeCloseTo(43077.6, 5);
  });

  it("handles zero capacity without dividing by zero", () => {
    const metrics = quoteMetrics({ pricePhp: 1000, capacityKwp: 0, expectedAnnualKwh: 0 }, assessment);
    expect(metrics.pricePerKwpPhp).toBe(0);
    expect(metrics.estimatedPaybackYears).toBeNull();
  });

  it("returns a null payback when there are no estimated savings", () => {
    const noTariff = fakeAssessment({ effectiveTariffPhpPerKwh: 0 });
    const metrics = quoteMetrics({ pricePhp: 188000, capacityKwp: 3.2, expectedAnnualKwh: 0 }, noTariff);
    expect(metrics.estimatedAnnualSavingsPhp).toBe(0);
    expect(metrics.estimatedPaybackYears).toBeNull();
  });

  it("reports a shorter payback for a cheaper quote at the same production", () => {
    const cheap = quoteMetrics({ pricePhp: 170000, capacityKwp: 3.2, expectedAnnualKwh: 4380 }, assessment);
    const expensive = quoteMetrics({ pricePhp: 220000, capacityKwp: 3.2, expectedAnnualKwh: 4380 }, assessment);
    expect(cheap.estimatedPaybackYears!).toBeLessThan(expensive.estimatedPaybackYears!);
  });
});
