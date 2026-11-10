import { describe, expect, it } from "vitest";
import { assessSolar, SolarInputError, validateInputs, type AssessmentInputs } from "@/lib/solar/legacy/engine-2026-1";
import { ASSUMPTIONS, MODEL_VERSION } from "@/lib/solar/legacy/assumptions-2026-1";
import { NATIONAL_AVERAGE_YIELD } from "@/lib/solar/locations";

const golden: AssessmentInputs = {
  city: "Quezon City",
  monthlyKwh: 486,
  monthlyBillPhp: 5832,
  roofAreaM2: 82,
  roofType: "concrete",
  daytimeUsage: "medium",
  systemType: "net_metering",
  budgetPhp: 450000,
};

describe("solar engine — golden case", () => {
  const result = assessSolar(golden);

  it("records the model version and derived consumption", () => {
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(result.annualConsumptionKwh).toBe(5832);
    expect(result.daytimeConsumptionKwh).toBe(2624);
    expect(result.effectiveTariffPhpPerKwh).toBe(12);
    expect(result.location.city).toBe("Quezon City");
    expect(result.location.usedFallback).toBe(false);
  });

  it("produces the documented low/base/high scenario set", () => {
    expect(result.scenarios.map((s) => s.name)).toEqual(["low", "base", "high"]);
    expect(result.base).toBe(result.scenarios[1]);

    expect(result.scenarios.map((s) => s.capacityKwp)).toEqual([2.11, 2.96, 3.8]);
    expect(result.scenarios.map((s) => s.annualProductionKwh)).toEqual([2508, 3878, 5249]);
    expect(result.scenarios.map((s) => s.annualSavingsPhp)).toEqual([28597, 39768, 50231]);
    expect(result.scenarios.map((s) => s.paybackYears)).toEqual([4.5, 4, 3.6]);
  });

  it("keeps the base-case finance numbers reproducible", () => {
    expect(result.base.capacityKwp).toBe(2.96);
    expect(result.base.capexPhp).toBe(162704);
    expect(result.base.paybackYears).toBe(4);
    expect(result.base.net25yPhp).toBe(1168042);
    expect(result.base.npvPhp).toBe(349404);
    expect(result.base.lcoePhpPerKwh).toBe(2.04);
    expect(result.base.selfConsumptionRatio).toBe(0.677);
    expect(result.base.offsetRatio).toBe(0.665);
    expect(result.base.co2TonnesPerYear).toBe(2.71);
  });

  it("never models more than 90% of annual consumption", () => {
    for (const scenario of result.scenarios) {
      expect(scenario.offsetRatio).toBeLessThanOrEqual(0.9);
      expect(scenario.capacityKwp).toBeGreaterThan(0);
      expect(scenario.annualProductionKwh).toBeGreaterThan(0);
    }
  });

  it("builds a 25-year cashflow with degradation and an inverter replacement", () => {
    expect(result.base.cashflows).toHaveLength(ASSUMPTIONS.horizonYears);
    const [first, second] = result.base.cashflows;
    expect(first.year).toBe(1);
    expect(first.productionKwh).toBe(result.base.annualProductionKwh);
    expect(second.productionKwh).toBeLessThan(first.productionKwh);
    const inverterYear = result.base.cashflows.find((row) => row.year === ASSUMPTIONS.inverterReplacementYear);
    expect(inverterYear?.costsPhp).toBeGreaterThan(result.base.capexPhp * 0.1);
    expect(result.base.cashflows.at(-1)?.year).toBe(25);
  });

  it("includes the required non-negotiable disclaimers", () => {
    const warnings = result.warnings.join(" ");
    expect(warnings).toMatch(/non-binding estimate/i);
    expect(warnings).toMatch(/licensed installer must verify/i);
    expect(result.disclaimer).toMatch(/not an engineering certification body/i);
    expect(result.disclaimer).toMatch(/not guarantees/i);
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

describe("solar engine — scenario sensitivity", () => {
  it("is deterministic for identical inputs", () => {
    expect(assessSolar(golden)).toEqual(assessSolar(golden));
  });

  it("orders capacity and production low < base < high", () => {
    const result = assessSolar(golden);
    expect(result.scenarios[0].capacityKwp).toBeLessThan(result.scenarios[1].capacityKwp);
    expect(result.scenarios[1].capacityKwp).toBeLessThan(result.scenarios[2].capacityKwp);
    expect(result.scenarios[0].annualProductionKwh).toBeLessThan(result.scenarios[1].annualProductionKwh);
  });

  it("credits exports only for net metering", () => {
    const net = assessSolar(golden);
    const zero = assessSolar({ ...golden, systemType: "zero_export" });
    expect(zero.base.params.exportCreditRatio).toBe(0);
    expect(net.base.params.exportCreditRatio).toBe(ASSUMPTIONS.exportCreditRatioOfRetail);
    expect(net.base.annualSavingsPhp).toBeGreaterThan(zero.base.annualSavingsPhp);
  });

  it("caps the system at the usable roof area", () => {
    const roofLimited = assessSolar({ ...golden, roofAreaM2: 12 });
    expect(roofLimited.base.energyLimited).toBe(false);
    expect(roofLimited.base.capacityKwp).toBeLessThan(assessSolar(golden).base.capacityKwp);
    expect(roofLimited.warnings.join(" ")).toMatch(/roof-limited/i);
  });

  it("flags a budget below the modelled installed cost", () => {
    const result = assessSolar({ ...golden, budgetPhp: 10000 });
    expect(result.warnings.join(" ")).toMatch(/below the estimated base-case installed cost/i);
  });

  it("flags asbestos roofing for specialist handling", () => {
    const result = assessSolar({ ...golden, roofType: "asbestos" });
    expect(result.warnings.join(" ")).toMatch(/asbestos/i);
    expect(result.warnings.join(" ")).not.toMatch(/structurally suitable/i);
  });

  it("falls back to the national yield and lowers confidence outside the table", () => {
    const result = assessSolar({ ...golden, city: "Atlantis" });
    expect(result.location.usedFallback).toBe(true);
    expect(result.location.province).toBeNull();
    expect(result.location.specificYieldKwhPerKwpYear).toBe(NATIONAL_AVERAGE_YIELD);
    expect(result.warnings.join(" ")).toMatch(/national average/i);
  });

  it("warns when the implied tariff is outside the expected range", () => {
    const result = assessSolar({ ...golden, monthlyBillPhp: 500 });
    expect(result.warnings.join(" ")).toMatch(/outside the typical residential range/i);
  });
});

describe("solar engine — input validation", () => {
  it("accepts the documented boundaries", () => {
    expect(() => validateInputs({ ...golden, monthlyKwh: 20, monthlyBillPhp: 500, roofAreaM2: 4 })).not.toThrow();
    expect(() => validateInputs({ ...golden, monthlyKwh: 200000, monthlyBillPhp: 100, roofAreaM2: 50000 })).not.toThrow();
  });

  it.each([
    ["zero kWh", { monthlyKwh: 0 }],
    ["kWh too high", { monthlyKwh: 200001 }],
    ["bill too low", { monthlyBillPhp: 99 }],
    ["roof too small", { roofAreaM2: 3 }],
    ["NaN kWh", { monthlyKwh: Number.NaN }],
    ["infinite bill", { monthlyBillPhp: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_label, override) => {
    expect(() => assessSolar({ ...golden, ...override } as AssessmentInputs)).toThrow(SolarInputError);
  });

  it("rejects a non-finite budget", () => {
    expect(() => assessSolar({ ...golden, budgetPhp: Number.NaN })).toThrow(/Budget must be a number/i);
  });
});
