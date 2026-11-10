import { ASSUMPTIONS } from "@/lib/solar/assumptions";

/**
 * Plausibility checks for bill values, used to guide review of extracted (or typed)
 * values before they are confirmed. These flag; they never change values.
 */
export interface BillCheckInput {
  monthlyKwh: number | null | undefined;
  totalPhp: number | null | undefined;
  generationChargePhp?: number | null;
  fixedChargesPhp?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface BillIssue {
  field: "monthlyKwh" | "totalPhp" | "generationChargePhp" | "fixedChargesPhp" | "periodStart" | "periodEnd";
  level: "missing" | "check";
  message: string;
}

export function billChecks(input: BillCheckInput): BillIssue[] {
  const issues: BillIssue[] = [];
  const kwh = input.monthlyKwh && input.monthlyKwh > 0 ? input.monthlyKwh : null;
  const total = input.totalPhp && input.totalPhp > 0 ? input.totalPhp : null;

  if (!kwh) issues.push({ field: "monthlyKwh", level: "missing", message: "kWh used was not found. Copy it from the bill." });
  if (!total) issues.push({ field: "totalPhp", level: "missing", message: "Total amount due was not found. Copy it from the bill." });

  if (kwh && total) {
    const rate = total / kwh;
    if (rate < ASSUMPTIONS.tariffBoundsPhpPerKwh.min || rate > ASSUMPTIONS.tariffBoundsPhpPerKwh.max) {
      issues.push({
        field: "totalPhp",
        level: "check",
        message: `These values give ₱${rate.toFixed(2)} per kWh, outside the usual ₱${ASSUMPTIONS.tariffBoundsPhpPerKwh.min}–₱${ASSUMPTIONS.tariffBoundsPhpPerKwh.max}. Check the kWh and total.`,
      });
    }
  }
  if (kwh && kwh > 20000) {
    issues.push({ field: "monthlyKwh", level: "check", message: "That is a very high monthly reading for a home. Check that it is kWh, not the meter reading." });
  }
  const parts = (input.generationChargePhp ?? 0) + (input.fixedChargesPhp ?? 0);
  if (total && parts > total * 1.02) {
    issues.push({ field: "generationChargePhp", level: "check", message: "Generation and fixed charges add up to more than the total. One of them may be misread." });
  }
  if (input.periodStart && input.periodEnd) {
    const start = Date.parse(input.periodStart);
    const end = Date.parse(input.periodEnd);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const days = (end - start) / 86400000;
      if (days < 0) issues.push({ field: "periodEnd", level: "check", message: "The billing period ends before it starts." });
      else if (days < 20 || days > 40) {
        issues.push({ field: "periodEnd", level: "check", message: `The billing period is ${Math.round(days)} days. Most bills cover about a month.` });
      }
    }
  }
  return issues;
}
