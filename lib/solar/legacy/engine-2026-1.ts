/**
 * FROZEN: model solar-ph-2026.1, kept verbatim so assessments stored with this version
 * stay reproducible. Do not edit; new formulas belong in lib/solar/engine.ts.
 */
import {
  ASSUMPTIONS,
  MODEL_SOURCES,
  MODEL_VERSION,
  SCENARIO_PARAMS,
  type ScenarioName,
} from "@/lib/solar/legacy/assumptions-2026-1";
import { NATIONAL_AVERAGE_YIELD, findLocation } from "@/lib/solar/locations";

export type RoofType = "concrete" | "metal" | "tile" | "asbestos" | "unknown";
export type DaytimeUsage = "low" | "medium" | "high";
export type SystemType = "net_metering" | "zero_export";

export interface AssessmentInputs {
  city: string;
  monthlyKwh: number;
  monthlyBillPhp: number;
  roofAreaM2: number;
  roofType: RoofType;
  daytimeUsage: DaytimeUsage;
  systemType: SystemType;
  budgetPhp?: number | null;
}

export interface CashflowYear {
  year: number;
  productionKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  savingsPhp: number;
  costsPhp: number;
  netPhp: number;
  cumulativePhp: number;
}

export interface ScenarioResult {
  name: ScenarioName;
  label: string;
  capacityKwp: number;
  annualProductionKwh: number;
  annualSavingsPhp: number;
  capexPhp: number;
  paybackYears: number | null;
  net25yPhp: number;
  npvPhp: number;
  lcoePhpPerKwh: number;
  selfConsumptionRatio: number;
  offsetRatio: number;
  co2TonnesPerYear: number;
  roofCapacityKwp: number;
  energyLimited: boolean;
  params: {
    targetOffset: number;
    shadingFactor: number;
    costPerKwpPhp: number;
    tariffEscalation: number;
    exportCreditRatio: number;
  };
  cashflows: CashflowYear[];
}

export interface AssessmentResult {
  modelVersion: string;
  location: { city: string; province: string | null; specificYieldKwhPerKwpYear: number; usedFallback: boolean };
  effectiveTariffPhpPerKwh: number;
  annualConsumptionKwh: number;
  daytimeConsumptionKwh: number;
  systemType: SystemType;
  scenarios: ScenarioResult[];
  base: ScenarioResult;
  warnings: string[];
  assumptions: { label: string; value: string }[];
  sources: string[];
  disclaimer: string;
}

export class SolarInputError extends Error {}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new SolarInputError(`${label} must be a number.`);
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function validateInputs(inputs: AssessmentInputs): AssessmentInputs {
  assertFinite(inputs.monthlyKwh, "Monthly kWh");
  assertFinite(inputs.monthlyBillPhp, "Monthly bill");
  assertFinite(inputs.roofAreaM2, "Roof area");
  if (inputs.monthlyKwh < 20 || inputs.monthlyKwh > 200000) {
    throw new SolarInputError("Monthly consumption must be between 20 and 200,000 kWh.");
  }
  if (inputs.monthlyBillPhp < 100 || inputs.monthlyBillPhp > 5000000) {
    throw new SolarInputError("Monthly bill must be between ₱100 and ₱5,000,000.");
  }
  if (inputs.roofAreaM2 < 4 || inputs.roofAreaM2 > 50000) {
    throw new SolarInputError("Roof area must be between 4 and 50,000 m².");
  }
  if (inputs.budgetPhp != null) assertFinite(inputs.budgetPhp, "Budget");
  return inputs;
}

function buildScenario(
  name: ScenarioName,
  inputs: AssessmentInputs,
  annualConsumptionKwh: number,
  daytimeShareBase: number,
  tariff: number,
  yieldPerKwp: number,
  roofCapacityKwp: number,
): ScenarioResult {
  const params = SCENARIO_PARAMS[name];
  // Energy-led size, capped by usable roof area. We never size above what the roof
  // can physically host, and never target more than 90% of annual consumption.
  const energyCapacityKwp = (annualConsumptionKwh * params.targetOffset) / yieldPerKwp;
  const capacityKwp = Math.max(0.3, Math.min(energyCapacityKwp, roofCapacityKwp));
  const energyLimited = energyCapacityKwp <= roofCapacityKwp;

  const production = capacityKwp * yieldPerKwp * params.shadingFactor;
  const daytimeConsumption = annualConsumptionKwh * Math.min(0.9, daytimeShareBase * params.selfConsumptionFactor);
  const selfConsumed = Math.min(production, daytimeConsumption);
  const exported = Math.max(0, production - selfConsumed);
  const exportRatio = inputs.systemType === "net_metering" ? ASSUMPTIONS.exportCreditRatioOfRetail : 0;
  const yearOneSavings = selfConsumed * tariff + exported * tariff * exportRatio;
  const capex = capacityKwp * params.costPerKwpPhp;

  const cashflows: CashflowYear[] = [];
  let cumulative = -capex;
  let savingsSum = 0;
  let discountedSum = 0;
  let productionSum = 0;
  let discountedCosts = 0;
  let paybackYears: number | null = null;

  for (let year = 1; year <= ASSUMPTIONS.horizonYears; year += 1) {
    const productionKwh = production * (1 - ASSUMPTIONS.degradationPerYear) ** (year - 1);
    const selfKwh = Math.min(productionKwh, daytimeConsumption);
    const exportKwh = Math.max(0, productionKwh - selfKwh);
    const escalatedTariff = tariff * (1 + params.tariffEscalation) ** (year - 1);
    const savings = selfKwh * escalatedTariff + exportKwh * escalatedTariff * exportRatio;
    const maintenance = year === 1 ? 0 : capex * ASSUMPTIONS.maintenanceRateOfCapex;
    const inverter = year === ASSUMPTIONS.inverterReplacementYear ? capex * ASSUMPTIONS.inverterCostRateOfCapex : 0;
    const costs = maintenance + inverter;
    const net = savings - costs;
    const previous = cumulative;
    cumulative += net;

    if (paybackYears == null && previous < 0 && cumulative >= 0 && net > 0) {
      paybackYears = year - 1 + -previous / net;
    }

    cashflows.push({
      year,
      productionKwh: round(productionKwh),
      selfConsumedKwh: round(selfKwh),
      exportedKwh: round(exportKwh),
      savingsPhp: round(savings),
      costsPhp: round(costs),
      netPhp: round(net),
      cumulativePhp: round(cumulative),
    });

    const discount = (1 + ASSUMPTIONS.discountRate) ** year;
    savingsSum += savings;
    productionSum += productionKwh;
    discountedSum += net / discount;
    discountedCosts += costs / discount;
  }

  const npv = -capex + discountedSum;
  const lifetimeCost = capex + discountedCosts;

  return {
    name,
    label: params.label,
    capacityKwp: round(capacityKwp, 2),
    annualProductionKwh: round(production),
    annualSavingsPhp: round(yearOneSavings),
    capexPhp: round(capex),
    paybackYears: paybackYears == null ? null : round(paybackYears, 1),
    net25yPhp: round(cumulative),
    npvPhp: round(npv),
    lcoePhpPerKwh: productionSum > 0 ? round(lifetimeCost / productionSum, 2) : 0,
    selfConsumptionRatio: production > 0 ? round(selfConsumed / production, 3) : 0,
    offsetRatio: round(production / annualConsumptionKwh, 3),
    co2TonnesPerYear: round((production * ASSUMPTIONS.co2KgPerKwh) / 1000, 2),
    roofCapacityKwp: round(roofCapacityKwp, 2),
    energyLimited,
    params: {
      targetOffset: params.targetOffset,
      shadingFactor: params.shadingFactor,
      costPerKwpPhp: params.costPerKwpPhp,
      tariffEscalation: params.tariffEscalation,
      exportCreditRatio: exportRatio,
    },
    cashflows,
  };
}

export function assessSolar(rawInputs: AssessmentInputs): AssessmentResult {
  const inputs = validateInputs(rawInputs);
  const location = findLocation(inputs.city);
  const yieldPerKwp = location?.specificYieldKwhPerKwpYear ?? NATIONAL_AVERAGE_YIELD;
  const warnings: string[] = [];

  if (!location) {
    warnings.push(
      `“${inputs.city}” is not in the yield table yet. A national average of ${NATIONAL_AVERAGE_YIELD} kWh/kWp/year was used, which lowers confidence.`,
    );
  }

  const annualConsumption = inputs.monthlyKwh * 12;
  const tariff = inputs.monthlyBillPhp / inputs.monthlyKwh;
  if (tariff < ASSUMPTIONS.tariffBoundsPhpPerKwh.min || tariff > ASSUMPTIONS.tariffBoundsPhpPerKwh.max) {
    warnings.push(
      `The implied electricity rate of ₱${tariff.toFixed(2)}/kWh is outside the typical residential range. Check the bill amount and kWh reading.`,
    );
  }

  const roofFactor = ASSUMPTIONS.roofTypeUsableFactor[inputs.roofType];
  const usableRoof = inputs.roofAreaM2 * ASSUMPTIONS.usableRoofFactor * roofFactor;
  const roofCapacityKwp = usableRoof / ASSUMPTIONS.areaPerKwpM2;
  const daytimeShare = ASSUMPTIONS.daytimeUsageShare[inputs.daytimeUsage];

  if (inputs.roofType === "asbestos") {
    warnings.push(
      "Asbestos roofing needs licensed specialist handling before any installation. This estimate does not assess roof safety.",
    );
  }

  const scenarios = (Object.keys(SCENARIO_PARAMS) as ScenarioName[]).map((name) =>
    buildScenario(name, inputs, annualConsumption, daytimeShare, tariff, yieldPerKwp, roofCapacityKwp),
  );
  const base = scenarios.find((s) => s.name === "base") ?? scenarios[0];
  const energyCapacityBase = (annualConsumption * SCENARIO_PARAMS.base.targetOffset) / yieldPerKwp;

  if (roofCapacityKwp < energyCapacityBase) {
    warnings.push(
      `Roof-limited design: usable roof area supports about ${round(roofCapacityKwp, 1)} kWp. A smaller system is modelled for the base and optimistic cases.`,
    );
  }
  if (inputs.budgetPhp && inputs.budgetPhp > 0 && inputs.budgetPhp < base.capexPhp) {
    warnings.push(
      `The stated budget of ₱${inputs.budgetPhp.toLocaleString("en-PH")} is below the estimated base-case installed cost of ₱${base.capexPhp.toLocaleString("en-PH")}. Consider a smaller system or staged installation.`,
    );
  }
  warnings.push(
    "This is a preliminary, non-binding estimate. A licensed installer must verify roof structure, shading, electrical capacity, permits and utility interconnection before any work.",
  );
  warnings.push(
    "Estimates exclude structural reinforcement, permit and net-metering fees, panel cleaning access equipment, and any utility upgrade charges.",
  );

  return {
    modelVersion: MODEL_VERSION,
    location: {
      city: location?.city ?? inputs.city,
      province: location?.province ?? null,
      specificYieldKwhPerKwpYear: yieldPerKwp,
      usedFallback: !location,
    },
    effectiveTariffPhpPerKwh: round(tariff, 2),
    annualConsumptionKwh: round(annualConsumption),
    daytimeConsumptionKwh: round(annualConsumption * daytimeShare),
    systemType: inputs.systemType,
    scenarios,
    base,
    warnings,
    assumptions: [
      { label: "Model version", value: MODEL_VERSION },
      { label: "Specific yield", value: `${yieldPerKwp.toLocaleString("en-PH")} kWh/kWp/year` },
      { label: "Usable roof factor", value: `${Math.round(ASSUMPTIONS.usableRoofFactor * 100)}% (then ${Math.round(roofFactor * 100)}% for roof type)` },
      { label: "Roof area per kWp", value: `${ASSUMPTIONS.areaPerKwpM2} m²/kWp` },
      { label: "Daytime consumption share", value: `${Math.round(daytimeShare * 100)}%` },
      { label: "Panel degradation", value: `${ASSUMPTIONS.degradationPerYear * 100}% per year` },
      { label: "Annual maintenance", value: `${ASSUMPTIONS.maintenanceRateOfCapex * 100}% of capex from year 2` },
      { label: "Inverter replacement", value: `Year ${ASSUMPTIONS.inverterReplacementYear} at ${ASSUMPTIONS.inverterCostRateOfCapex * 100}% of capex` },
      { label: "Export credit", value: inputs.systemType === "net_metering" ? "55% of retail tariff (net metering)" : "None (zero export)" },
      { label: "Analysis horizon", value: `${ASSUMPTIONS.horizonYears} years at ${ASSUMPTIONS.discountRate * 100}% discount rate` },
      { label: "Grid emission factor", value: `${ASSUMPTIONS.co2KgPerKwh} kg CO2e/kWh (indicative)` },
    ],
    sources: MODEL_SOURCES,
    disclaimer:
      "SOLARekta is not an engineering certification body. Production, savings and payback are scenarios, not guarantees, and are not structural or electrical approvals.",
  };
}
