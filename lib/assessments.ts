import "server-only";
import { db } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { assessSolar, type AssessmentInputs, type AssessmentResult, type DaytimeUsage, type ExportTreatment, type RoofType } from "@/lib/solar/engine";
import type { SiteRow } from "@/lib/types";

/** Builds engine inputs from a stored site and confirmed bill. The legacy monthly budget is never used. */
export function inputsForSite(
  site: SiteRow,
  bill: { monthly_kwh: number; total_php: number },
  systemType: ExportTreatment,
): AssessmentInputs {
  return {
    city: site.city,
    monthlyKwh: bill.monthly_kwh,
    monthlyBillPhp: bill.total_php,
    roofAreaM2: site.roof_area_status === "unknown" ? null : site.roof_area_m2,
    roofType: site.roof_type as RoofType,
    daytimeUsage: site.daytime_usage as DaytimeUsage,
    systemType,
    installBudgetPhp: site.install_budget_php ?? null,
  };
}

/**
 * Runs the deterministic engine and stores the assessment with its exact inputs and
 * model version. Throws SolarInputError for invalid inputs. Must be called inside a
 * flow that has already verified the caller owns `siteId`.
 */
export function createAssessmentRecord(userId: string, siteId: string, inputs: AssessmentInputs): { id: string; result: AssessmentResult } {
  const result = assessSolar(inputs);
  const id = newId();
  const timestamp = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO assessments (id, site_id, user_id, model_version, inputs_json, result_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
    ).run(id, siteId, userId, result.modelVersion, JSON.stringify(inputs), JSON.stringify(result), timestamp, timestamp);

    const insertScenario = db.prepare(
      `INSERT INTO assessment_scenarios (id, assessment_id, name, capacity_kwp, annual_production_kwh, annual_savings_php,
         payback_years, capex_php, net_25y_php, self_consumption_ratio, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const scenario of result.scenarios) {
      insertScenario.run(
        newId(),
        id,
        scenario.name,
        scenario.capacityKwp,
        scenario.annualProductionKwh,
        scenario.annualSavingsPhp,
        scenario.paybackYears,
        scenario.capexPhp,
        scenario.net25yPhp,
        scenario.selfConsumptionRatio,
        JSON.stringify({ ...scenario, cashflows: undefined }),
      );
    }
  })();

  return { id, result };
}
