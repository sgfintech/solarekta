import { describe, expect, it } from "vitest";
import { assessSolar, SolarInputError, validateInputs, type AssessmentInputs } from "@/lib/solar/engine";
import { assessSolar as assessLegacy } from "@/lib/solar/legacy/engine-2026-1";
import {
  ASSUMPTIONS,
  EXPORT_CONFIG,
  MODEL_VERSION,
  RECOMMENDED_TARGET_SHARE,
  SCENARIO_PARAMS,
} from "@/lib/solar/assumptions";

const golden: AssessmentInputs = {
  city: "Quezon City",
  monthlyKwh: 486,
  monthlyBillPhp: 5832,
  roofAreaM2: 82,
  roofType: "concrete",
  daytimeUsage: "medium",
  systemType: "net_metering",
  installBudgetPhp: 450000,
};

describe("solar engine 2026.2 — golden case", () => {
  const result = assessSolar(golden);

  it("records the new model version and derived consumption", () => {
    expect(MODEL_VERSION).toBe("solar-ph-2026.2");
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(result.annualConsumptionKwh).toBe(5832);
    expect(result.annualBillPhp).toBe(69984);
    expect(result.effectiveTariffPhpPerKwh).toBe(12);
    expect(result.sizing?.status).toBe("energy_led");
  });

  it("sizes to the recommended share of annual use (independently computed)", () => {
    const expected = (5832 * RECOMMENDED_TARGET_SHARE) / 1380;
    expect(result.base.capacityKwp).toBeCloseTo(expected, 2);
    expect(result.sizing?.recommendedKwp).toBeCloseTo(expected, 2);
  });

  it("holds system size constant across uncertainty scenarios", () => {
    const sizes = new Set(result.scenarios.map((s) => s.capacityKwp));
    expect(sizes.size).toBe(1);
    const [low, base, high] = result.scenarios;
    expect(low.annualSavingsPhp).toBeLessThan(base.annualSavingsPhp);
    expect(base.annualSavingsPhp).toBeLessThan(high.annualSavingsPhp);
    expect(low.capexPhp).toBeGreaterThan(high.capexPhp);
  });

  it("reports alternative sizes separately from uncertainty", () => {
    const options = result.sizeOptions ?? [];
    expect(options.map((o) => o.key)).toEqual(["smaller", "recommended", "larger"]);
    expect(options[0].capacityKwp).toBeLessThan(options[1].capacityKwp);
    expect(options[1].capacityKwp).toBeLessThan(options[2].capacityKwp);
    expect(options[1].capacityKwp).toBe(result.base.capacityKwp);
    expect(options[1].annualSavingsPhp).toBe(result.base.annualSavingsPhp);
  });

  it("keeps energy and money ratios distinct and correctly defined", () => {
    const base = result.base;
    expect(base.offsetRatio).toBeUndefined();
    expect(base.generationToUseRatio).toBeCloseTo(base.annualProductionKwh / 5832, 2);
    expect(base.billSavingsRatio).toBeCloseTo(base.annualSavingsPhp / 69984, 2);
  });

  it("computes LCOE as discounted cost over discounted production (independent check)", () => {
    const base = result.base;
    const p = SCENARIO_PARAMS.base;
    const capacity = (5832 * RECOMMENDED_TARGET_SHARE) / 1380;
    const capex = capacity * p.costPerKwpPhp;
    const production = capacity * 1380 * p.shadingFactor;
    let cost = capex;
    let energy = 0;
    for (let t = 1; t <= 25; t += 1) {
      const d = 1.08 ** t;
      const om = t === 1 ? 0 : capex * 0.01;
      const inverter = t === 12 ? capex * 0.12 : 0;
      cost += (om + inverter) / d;
      energy += (production * 0.995 ** (t - 1)) / d;
    }
    expect(base.lcoePhpPerKwh).toBeCloseTo(cost / energy, 1);
    // The 2026.1 formula (undiscounted production) gave a much lower, inconsistent value.
    expect(base.lcoePhpPerKwh).toBeGreaterThan(assessLegacy({ ...golden, roofAreaM2: 82, budgetPhp: null, systemType: "net_metering" }).base.lcoePhpPerKwh);
  });

  it("includes required disclaimers and versioned export configuration", () => {
    expect(result.warnings.join(" ")).toMatch(/licensed installer must verify/i);
    expect(result.disclaimer).toMatch(/not guarantees/i);
    expect(result.exportTreatment?.configVersion).toBe(EXPORT_CONFIG.version);
    expect(result.exportTreatment?.assumed).toBe(true);
    expect(result.sources.join(" ")).toMatch(/Assumed/);
  });

  it("is deterministic", () => {
    expect(assessSolar(golden)).toEqual(assessSolar(golden));
  });
});

describe("solar engine 2026.2 — roof boundaries", () => {
  it("never exceeds usable roof capacity across a sweep of roofs and usage", () => {
    for (const roofAreaM2 of [4, 5, 6, 8, 12, 20, 40, 80, 200]) {
      for (const monthlyKwh of [20, 150, 486, 2000, 20000]) {
        for (const roofType of ["concrete", "tile", "asbestos"] as const) {
          const r = assessSolar({ ...golden, roofAreaM2, monthlyKwh, monthlyBillPhp: Math.max(100, monthlyKwh * 11), roofType });
          const roofCap = r.sizing?.roofCapacityKwp as number;
          for (const s of r.scenarios) expect(s.capacityKwp).toBeLessThanOrEqual(roofCap + 0.005);
          for (const o of r.sizeOptions ?? []) expect(o.capacityKwp).toBeLessThanOrEqual(roofCap + 0.005);
        }
      }
    }
  });

  it("caps at the roof and says so when the roof is the limit", () => {
    const r = assessSolar({ ...golden, roofAreaM2: 12 });
    const roofCap = (12 * 0.72) / 5.5;
    expect(r.sizing?.status).toBe("roof_limited");
    expect(r.base.capacityKwp).toBeCloseTo(roofCap, 2);
    expect(r.warnings.join(" ")).toMatch(/usable roof area supports about/i);
  });

  it("returns an actionable result instead of forcing a minimum size on a tiny roof", () => {
    const r = assessSolar({ ...golden, roofAreaM2: 4, roofType: "tile" });
    expect(r.sizing?.status).toBe("insufficient_roof");
    expect(r.base.capacityKwp).toBe(0);
    expect(r.base.capexPhp).toBe(0);
    expect(r.base.paybackYears).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/practical minimum/i);
  });

  it("supports an explicit unknown-roof path without fabricating area", () => {
    const r = assessSolar({ ...golden, roofAreaM2: null });
    expect(r.sizing?.status).toBe("roof_unchecked");
    expect(r.sizing?.roofCapacityKwp).toBeNull();
    expect(r.sizing?.roofAreaKnown).toBe(false);
    expect(r.base.roofCapacityKwp).toBeNull();
    expect(r.base.capacityKwp).toBeCloseTo((5832 * 0.7) / 1380, 2);
    expect(r.warnings.join(" ")).toMatch(/not been checked against available roof space/i);
    expect(r.assumptions.find((a) => a.label === "Roof area")?.value).toMatch(/Not provided/);
  });
});

describe("solar engine 2026.2 — export treatment and budget", () => {
  it("credits exports only under net-metering and models 'not sure' conservatively", () => {
    const net = assessSolar(golden);
    const zero = assessSolar({ ...golden, systemType: "zero_export" });
    const unsure = assessSolar({ ...golden, systemType: "not_sure" });
    expect(zero.base.params.exportCreditRatio).toBe(0);
    expect(unsure.base.params.exportCreditRatio).toBe(0);
    expect(net.base.params.exportCreditRatio).toBe(EXPORT_CONFIG.netMeteringCreditRatioOfRetail);
    expect(unsure.base.annualSavingsPhp).toBe(zero.base.annualSavingsPhp);
    expect(unsure.exportTreatment?.netMeteringUpsidePhp).toBe(net.base.annualSavingsPhp - zero.base.annualSavingsPhp);
    expect(net.exportTreatment?.netMeteringUpsidePhp).toBeNull();
  });

  it("compares a one-time installation budget with installed cost", () => {
    const low = assessSolar({ ...golden, installBudgetPhp: 10000 });
    expect(low.budget?.belowBaseCost).toBe(true);
    expect(low.warnings.join(" ")).toMatch(/installation budget/i);
    const none = assessSolar({ ...golden, installBudgetPhp: null });
    expect(none.budget?.belowBaseCost).toBeNull();
  });

  it("validates inputs at the documented boundaries", () => {
    expect(() => validateInputs({ ...golden, monthlyKwh: 20, roofAreaM2: 4 })).not.toThrow();
    expect(() => validateInputs({ ...golden, roofAreaM2: null })).not.toThrow();
    expect(() => assessSolar({ ...golden, roofAreaM2: 3 })).toThrow(SolarInputError);
    expect(() => assessSolar({ ...golden, monthlyKwh: Number.NaN })).toThrow(SolarInputError);
    expect(() => assessSolar({ ...golden, systemType: "bogus" as never })).toThrow(SolarInputError);
    expect(() => assessSolar({ ...golden, installBudgetPhp: Number.NaN })).toThrow(/Budget/);
  });

  it("uses the configured maximum self-consumption share", () => {
    const r = assessSolar({ ...golden, daytimeUsage: "high" });
    expect(r.base.selfConsumptionRatio).toBeLessThanOrEqual(1);
    expect(ASSUMPTIONS.maxSelfConsumptionShare).toBe(0.9);
  });
});
