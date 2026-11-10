import { describe, expect, it } from "vitest";
import { billChecks } from "@/lib/bills";
import { checkGrounding, collectAllowedNumbers, extractNumbers, hasBannedClaim, scrubUntrusted } from "@/lib/ai/grounding";

describe("bill plausibility checks", () => {
  it("flags missing values from an unreadable bill", () => {
    const issues = billChecks({ monthlyKwh: null, totalPhp: null });
    expect(issues.map((i) => [i.field, i.level])).toEqual([["monthlyKwh", "missing"], ["totalPhp", "missing"]]);
  });
  it("accepts a normal bill", () => {
    expect(billChecks({ monthlyKwh: 486, totalPhp: 5832, generationChargePhp: 4210, fixedChargesPhp: 1622, periodStart: "2026-09-01", periodEnd: "2026-09-30" })).toEqual([]);
  });
  it("flags contradictory data", () => {
    const issues = billChecks({ monthlyKwh: 48600, totalPhp: 5832, generationChargePhp: 9000, fixedChargesPhp: 1000, periodStart: "2026-10-01", periodEnd: "2026-09-01" });
    const fields = issues.map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["totalPhp", "monthlyKwh", "generationChargePhp", "periodEnd"]));
  });
});

describe("AI grounding guards", () => {
  it("extracts numbers with thousands separators", () => {
    expect(extractNumbers("₱162,704 for 2.96 kWp, about 66%")).toEqual([162704, 2.96, 66]);
  });
  it("accepts rounded forms of supplied numbers and rejects invented ones", () => {
    const allowed = collectAllowedNumbers({ capex: 162704, kwp: 2.958, payback: 4.03, ratio: 0.665 });
    expect(checkGrounding("About ₱162,704 for 3 kWp, roughly 4 years and 66.5% of use.", allowed).ok).toBe(true);
    expect(checkGrounding("You will save ₱9,999 every month.", allowed).ok).toBe(false);
  });
  it("blocks guarantees and approval claims in English and Filipino", () => {
    expect(hasBannedClaim("These savings are guaranteed.")).toBe(true);
    expect(hasBannedClaim("Garantisado ang tipid mo.")).toBe(true);
    expect(hasBannedClaim("This roof is structurally sound.")).toBe(true);
    expect(hasBannedClaim("Q1 is the best installer.")).toBe(true);
    expect(hasBannedClaim("A licensed installer must check the roof.")).toBe(false);
  });
  it("scrubs contact details and links from untrusted text", () => {
    expect(scrubUntrusted("Call 09171234567 or mail a@b.ph, see https://x.y")).toBe("Call [number removed] or mail [email removed], see [link removed]");
  });
});
