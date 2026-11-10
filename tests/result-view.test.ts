import { describe, expect, it } from "vitest";
import { assessSolar } from "@/lib/solar/engine";
import { assessSolar as assessLegacy } from "@/lib/solar/legacy/engine-2026-1";
import { generationRatio, isLegacyResult, summarizeResult } from "@/lib/solar/view";
import type { AssessmentResult } from "@/lib/solar/engine";

const inputs = {
  city: "Quezon City",
  monthlyKwh: 486,
  monthlyBillPhp: 5832,
  roofAreaM2: 82,
  roofType: "concrete" as const,
  daytimeUsage: "medium" as const,
  systemType: "net_metering" as const,
};

describe("result view helpers", () => {
  it("summarises a 2026.2 result with monthly averages derived from annual figures", () => {
    const r = assessSolar(inputs);
    const s = summarizeResult(r);
    expect(s.legacy).toBe(false);
    expect(s.monthlySavingsAvgPhp).toBe(Math.round(r.base.annualSavingsPhp / 12));
    expect(s.monthlyBillAvgPhp).toBe(5832);
    expect(s.rangeIsSameSize).toBe(true);
    expect(s.monthlySavingsRange.low).toBeLessThan(s.monthlySavingsRange.high);
    expect(s.generationRatio).toBe(r.base.generationToUseRatio);
  });

  it("reads stored 2026.1 results without recalculating them", () => {
    const legacy = assessLegacy({ ...inputs, budgetPhp: null }) as unknown as AssessmentResult;
    expect(isLegacyResult(legacy)).toBe(true);
    const s = summarizeResult(legacy);
    expect(s.legacy).toBe(true);
    expect(s.rangeIsSameSize).toBe(false);
    expect(s.capacityKwp).toBe(2.96);
    expect(generationRatio(legacy.base)).toBe(0.665);
    expect(s.status).toBe("energy_led");
  });
});
