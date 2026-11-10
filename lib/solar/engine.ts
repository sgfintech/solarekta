import {
  ASSUMPTIONS,
  EXPORT_CONFIG,
  MODEL_SOURCES,
  MODEL_VERSION,
  RECOMMENDED_TARGET_SHARE,
  SCENARIO_PARAMS,
  SIZE_OPTIONS,
  type ScenarioName,
  type SizeOptionKey,
} from "@/lib/solar/assumptions";
import { NATIONAL_AVERAGE_YIELD, findLocation } from "@/lib/solar/locations";

export type RoofType = "concrete" | "metal" | "tile" | "asbestos" | "unknown";
export type DaytimeUsage = "low" | "medium" | "high";
/** What happens to solar power the property does not use at that moment. */
export type ExportTreatment = "net_metering" | "zero_export" | "not_sure";
/** Kept as an alias: stored inputs and forms use the `systemType` field name. */
export type SystemType = ExportTreatment;
export type SizingStatus = "energy_led" | "roof_limited" | "insufficient_roof" | "roof_unchecked";

export interface AssessmentInputs {
  city: string;
  monthlyKwh: number;
  monthlyBillPhp: number;
  /** null means the customer does not know the roof area; sizing is then not roof-checked. */
  roofAreaM2: number | null;
  roofType: RoofType;
  daytimeUsage: DaytimeUsage;
  systemType: ExportTreatment;
  /** One-time installation budget in pesos (never a monthly bill budget). */
  installBudgetPhp?: number | null;
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
  /** Year-one savings in pesos. */
  annualSavingsPhp: number;
  capexPhp: number;
  paybackYears: number | null;
  net25yPhp: number;
  npvPhp: number;
  lcoePhpPerKwh: number;
  selfConsumptionRatio: number;
  /** Annual solar generation divided by annual electricity use (energy, not money). */
  generationToUseRatio: number;
  /** Year-one savings divided by twelve times the monthly bill (money, same baseline period). */
  billSavingsRatio: number;
  /** Legacy (solar-ph-2026.1) field: same meaning as generationToUseRatio. Absent in 2026.2. */
  offsetRatio?: number;
  co2TonnesPerYear: number;
  roofCapacityKwp: number | null;
  energyLimited: boolean;
  params: {
    shadingFactor: number;
    costPerKwpPhp: number;
    tariffEscalation: number;
    selfConsumptionFactor: number;
    exportCreditRatio: number;
    targetOffset?: number;
  };
  cashflows: CashflowYear[];
}

export interface SizeOptionResult {
  key: SizeOptionKey;
  label: string;
  targetShare: number;
  capacityKwp: number;
  roofLimited: boolean;
  annualProductionKwh: number;
  annualSavingsPhp: number;
  capexPhp: number;
  paybackYears: number | null;
  generationToUseRatio: number;
}

export interface AssessmentResult {
  modelVersion: string;
  location: { city: string; province: string | null; specificYieldKwhPerKwpYear: number; usedFallback: boolean };
  effectiveTariffPhpPerKwh: number;
  annualConsumptionKwh: number;
  annualBillPhp?: number;
  daytimeConsumptionKwh: number;
  systemType: ExportTreatment;
  sizing?: {
    status: SizingStatus;
    recommendedKwp: number;
    energyCapacityKwp: number;
    roofCapacityKwp: number | null;
    minimumPracticalKwp: number;
    roofAreaKnown: boolean;
  };
  exportTreatment?: {
    choice: ExportTreatment;
    creditRatioApplied: number;
    configVersion: string;
    assumed: boolean;
    note: string;
    /** For "not sure": extra year-one savings if net-metering were approved (base case). */
    netMeteringUpsidePhp: number | null;
  };
  budget?: { installBudgetPhp: number | null; belowBaseCost: boolean | null };
  scenarios: ScenarioResult[];
  base: ScenarioResult;
  sizeOptions?: SizeOptionResult[];
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
  if (inputs.monthlyKwh < 20 || inputs.monthlyKwh > 200000) {
    throw new SolarInputError("Monthly consumption must be between 20 and 200,000 kWh.");
  }
  if (inputs.monthlyBillPhp < 100 || inputs.monthlyBillPhp > 5000000) {
    throw new SolarInputError("Monthly bill must be between ₱100 and ₱5,000,000.");
  }
  if (inputs.roofAreaM2 != null) {
    assertFinite(inputs.roofAreaM2, "Roof area");
    if (inputs.roofAreaM2 < 4 || inputs.roofAreaM2 > 50000) {
      throw new SolarInputError("Roof area must be between 4 and 50,000 m².");
    }
  }
  if (!["net_metering", "zero_export", "not_sure"].includes(inputs.systemType)) {
    throw new SolarInputError("Choose what happens to extra solar power.");
  }
  if (inputs.installBudgetPhp != null) assertFinite(inputs.installBudgetPhp, "Budget");
  return inputs;
}

interface SimContext {
  annualConsumptionKwh: number;
  annualBillPhp: number;
  daytimeShare: number;
  tariff: number;
  yieldPerKwp: number;
  exportCreditRatio: number;
}

interface SimParams {
  shadingFactor: number;
  costPerKwpPhp: number;
  selfConsumptionFactor: number;
  tariffEscalation: number;
}

/** Simulates one system size under one set of assumptions. Pure and deterministic. */
export function simulate(capacityKwp: number, params: SimParams, ctx: SimContext) {
  const production = capacityKwp * ctx.yieldPerKwp * params.shadingFactor;
  const daytimeConsumption =
    ctx.annualConsumptionKwh * Math.min(ASSUMPTIONS.maxSelfConsumptionShare, ctx.daytimeShare * params.selfConsumptionFactor);
  const selfConsumed = Math.min(production, daytimeConsumption);
  const exported = Math.max(0, production - selfConsumed);
  const yearOneSavings = selfConsumed * ctx.tariff + exported * ctx.tariff * ctx.exportCreditRatio;
  const capex = capacityKwp * params.costPerKwpPhp;

  const cashflows: CashflowYear[] = [];
  let cumulative = -capex;
  let discountedNet = 0;
  let discountedCosts = 0;
  let discountedProduction = 0;
  let paybackYears: number | null = null;

  for (let year = 1; year <= ASSUMPTIONS.horizonYears; year += 1) {
    const productionKwh = production * (1 - ASSUMPTIONS.degradationPerYear) ** (year - 1);
    const selfKwh = Math.min(productionKwh, daytimeConsumption);
    const exportKwh = Math.max(0, productionKwh - selfKwh);
    const escalatedTariff = ctx.tariff * (1 + params.tariffEscalation) ** (year - 1);
    const savings = selfKwh * escalatedTariff + exportKwh * escalatedTariff * ctx.exportCreditRatio;
    const maintenance = year === 1 ? 0 : capex * ASSUMPTIONS.maintenanceRateOfCapex;
    const inverter = year === ASSUMPTIONS.inverterReplacementYear ? capex * ASSUMPTIONS.inverterCostRateOfCapex : 0;
    const costs = maintenance + inverter;
    const net = savings - costs;
    const previous = cumulative;
    cumulative += net;

    if (paybackYears == null && capex > 0 && previous < 0 && cumulative >= 0 && net > 0) {
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
    discountedNet += net / discount;
    discountedCosts += costs / discount;
    discountedProduction += productionKwh / discount;
  }

  return {
    capacityKwp: round(capacityKwp, 2),
    annualProductionKwh: round(production),
    annualSavingsPhp: round(yearOneSavings),
    capexPhp: round(capex),
    paybackYears: paybackYears == null ? null : round(paybackYears, 1),
    net25yPhp: round(cumulative),
    npvPhp: round(-capex + discountedNet),
    // Both numerator and denominator are discounted at the same rate.
    lcoePhpPerKwh: discountedProduction > 0 ? round((capex + discountedCosts) / discountedProduction, 2) : 0,
    selfConsumptionRatio: production > 0 ? round(selfConsumed / production, 3) : 0,
    generationToUseRatio: round(production / ctx.annualConsumptionKwh, 3),
    billSavingsRatio: round(yearOneSavings / ctx.annualBillPhp, 3),
    co2TonnesPerYear: round((production * ASSUMPTIONS.co2KgPerKwh) / 1000, 2),
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
      `“${inputs.city}” is not in our solar yield table yet, so we used a national average of ${NATIONAL_AVERAGE_YIELD} kWh per kWp per year. This makes the estimate less certain.`,
    );
  }

  const annualConsumptionKwh = inputs.monthlyKwh * 12;
  const annualBillPhp = inputs.monthlyBillPhp * 12;
  const tariff = inputs.monthlyBillPhp / inputs.monthlyKwh;
  if (tariff < ASSUMPTIONS.tariffBoundsPhpPerKwh.min || tariff > ASSUMPTIONS.tariffBoundsPhpPerKwh.max) {
    warnings.push(
      `Your bill works out to ₱${tariff.toFixed(2)} per kWh, which is outside the usual residential range. Please check the bill amount and kWh reading.`,
    );
  }

  const roofAreaKnown = inputs.roofAreaM2 != null;
  const roofFactor = ASSUMPTIONS.roofTypeUsableFactor[inputs.roofType];
  const roofCapacityKwp = roofAreaKnown
    ? ((inputs.roofAreaM2 as number) * ASSUMPTIONS.usableRoofFactor * roofFactor) / ASSUMPTIONS.areaPerKwpM2
    : null;
  const daytimeShare = ASSUMPTIONS.daytimeUsageShare[inputs.daytimeUsage];

  const exportCreditRatio = inputs.systemType === "net_metering" ? EXPORT_CONFIG.netMeteringCreditRatioOfRetail : 0;
  const ctx: SimContext = { annualConsumptionKwh, annualBillPhp, daytimeShare, tariff, yieldPerKwp, exportCreditRatio };

  const energyCapacityFor = (share: number) => (annualConsumptionKwh * share) / yieldPerKwp;
  const energyCapacityKwp = energyCapacityFor(RECOMMENDED_TARGET_SHARE);
  const insufficientRoof = roofCapacityKwp != null && roofCapacityKwp < ASSUMPTIONS.minimumPracticalKwp;

  /** Final capacity never exceeds usable roof capacity; never forced up to a minimum. */
  const sizeFor = (share: number) => {
    if (insufficientRoof) return { capacity: 0, roofLimited: true };
    const energy = energyCapacityFor(share);
    if (roofCapacityKwp == null) return { capacity: energy, roofLimited: false };
    return { capacity: Math.min(energy, roofCapacityKwp), roofLimited: energy > roofCapacityKwp };
  };

  const recommended = sizeFor(RECOMMENDED_TARGET_SHARE);
  const status: SizingStatus = insufficientRoof
    ? "insufficient_roof"
    : roofCapacityKwp == null
      ? "roof_unchecked"
      : recommended.roofLimited
        ? "roof_limited"
        : "energy_led";

  const scenarios: ScenarioResult[] = (Object.keys(SCENARIO_PARAMS) as ScenarioName[]).map((name) => {
    const params = SCENARIO_PARAMS[name];
    const sim = simulate(recommended.capacity, params, ctx);
    return {
      name,
      label: params.label,
      ...sim,
      roofCapacityKwp: roofCapacityKwp == null ? null : round(roofCapacityKwp, 2),
      energyLimited: !recommended.roofLimited,
      params: {
        shadingFactor: params.shadingFactor,
        costPerKwpPhp: params.costPerKwpPhp,
        tariffEscalation: params.tariffEscalation,
        selfConsumptionFactor: params.selfConsumptionFactor,
        exportCreditRatio,
      },
    };
  });
  const base = scenarios.find((s) => s.name === "base") ?? scenarios[0];

  const sizeOptions: SizeOptionResult[] = (Object.keys(SIZE_OPTIONS) as SizeOptionKey[]).map((key) => {
    const option = SIZE_OPTIONS[key];
    const size = sizeFor(option.targetShare);
    const sim = simulate(size.capacity, SCENARIO_PARAMS.base, ctx);
    return {
      key,
      label: option.label,
      targetShare: option.targetShare,
      capacityKwp: sim.capacityKwp,
      roofLimited: size.roofLimited,
      annualProductionKwh: sim.annualProductionKwh,
      annualSavingsPhp: sim.annualSavingsPhp,
      capexPhp: sim.capexPhp,
      paybackYears: sim.paybackYears,
      generationToUseRatio: sim.generationToUseRatio,
    };
  });

  let netMeteringUpsidePhp: number | null = null;
  if (inputs.systemType === "not_sure" && !insufficientRoof) {
    const withCredit = simulate(recommended.capacity, SCENARIO_PARAMS.base, {
      ...ctx,
      exportCreditRatio: EXPORT_CONFIG.netMeteringCreditRatioOfRetail,
    });
    netMeteringUpsidePhp = Math.max(0, withCredit.annualSavingsPhp - base.annualSavingsPhp);
  }

  if (insufficientRoof) {
    warnings.push(
      `The usable roof area you entered supports only about ${round(roofCapacityKwp as number, 2)} kWp, below the ${ASSUMPTIONS.minimumPracticalKwp} kWp we treat as a practical minimum. Check the roof area, or ask an installer whether another roof section or a ground mount is possible.`,
    );
  } else if (status === "roof_unchecked") {
    warnings.push(
      "You did not enter a roof area, so this size has not been checked against available roof space. Add your roof area before requesting a site-specific proposal.",
    );
  } else if (status === "roof_limited") {
    warnings.push(
      `Your usable roof area supports about ${round(roofCapacityKwp as number, 1)} kWp, so we modelled a smaller system than your electricity use alone would suggest.`,
    );
  }

  if (inputs.roofType === "asbestos") {
    warnings.push(
      "Asbestos roofing needs licensed specialist handling before any installation. This estimate does not assess roof safety.",
    );
  }

  const installBudget = inputs.installBudgetPhp && inputs.installBudgetPhp > 0 ? inputs.installBudgetPhp : null;
  const belowBaseCost = installBudget == null || insufficientRoof ? null : installBudget < base.capexPhp;
  if (belowBaseCost) {
    warnings.push(
      `Your installation budget of ₱${(installBudget as number).toLocaleString("en-PH")} is below the estimated installed cost of ₱${base.capexPhp.toLocaleString("en-PH")}. Consider the smaller system option or a staged installation.`,
    );
  }

  const exportNote =
    inputs.systemType === "net_metering"
      ? EXPORT_CONFIG.basis
      : inputs.systemType === "zero_export"
        ? "No credit is counted for exported power. Solar you do not use at that moment is assumed to be limited or wasted."
        : "You chose “Not sure”, so we counted no credit for exported power. If your utility approves net-metering, savings could be higher.";

  warnings.push(
    "This is a preliminary, non-binding estimate. A licensed installer must verify roof structure, shading, electrical capacity, permits and utility interconnection before any work.",
  );
  warnings.push(
    "Estimates exclude structural reinforcement, permit and net-metering fees, panel cleaning access equipment, and any utility upgrade charges.",
  );

  const exportLabel =
    inputs.systemType === "net_metering"
      ? `${Math.round(EXPORT_CONFIG.netMeteringCreditRatioOfRetail * 100)}% of retail rate (assumed, net-metering)`
      : inputs.systemType === "zero_export"
        ? "None (zero export)"
        : "None counted (not sure yet)";

  return {
    modelVersion: MODEL_VERSION,
    location: {
      city: location?.city ?? inputs.city,
      province: location?.province ?? null,
      specificYieldKwhPerKwpYear: yieldPerKwp,
      usedFallback: !location,
    },
    effectiveTariffPhpPerKwh: round(tariff, 2),
    annualConsumptionKwh: round(annualConsumptionKwh),
    annualBillPhp: round(annualBillPhp),
    daytimeConsumptionKwh: round(annualConsumptionKwh * daytimeShare),
    systemType: inputs.systemType,
    sizing: {
      status,
      recommendedKwp: round(recommended.capacity, 2),
      energyCapacityKwp: round(energyCapacityKwp, 2),
      roofCapacityKwp: roofCapacityKwp == null ? null : round(roofCapacityKwp, 2),
      minimumPracticalKwp: ASSUMPTIONS.minimumPracticalKwp,
      roofAreaKnown,
    },
    exportTreatment: {
      choice: inputs.systemType,
      creditRatioApplied: exportCreditRatio,
      configVersion: EXPORT_CONFIG.version,
      assumed: inputs.systemType !== "zero_export",
      note: exportNote,
      netMeteringUpsidePhp,
    },
    budget: { installBudgetPhp: installBudget, belowBaseCost },
    scenarios,
    base,
    sizeOptions,
    warnings,
    assumptions: [
      { label: "Model version", value: MODEL_VERSION },
      { label: "Specific yield", value: `${yieldPerKwp.toLocaleString("en-PH")} kWh/kWp/year` },
      {
        label: "Roof area",
        value: roofAreaKnown ? `${inputs.roofAreaM2} m² entered` : "Not provided — size not roof-checked",
      },
      { label: "Usable roof factor", value: `${Math.round(ASSUMPTIONS.usableRoofFactor * 100)}% (then ${Math.round(roofFactor * 100)}% for roof type)` },
      { label: "Roof area per kWp", value: `${ASSUMPTIONS.areaPerKwpM2} m²/kWp` },
      { label: "Recommended size target", value: `${Math.round(RECOMMENDED_TARGET_SHARE * 100)}% of annual use, capped by roof` },
      { label: "Daytime consumption share", value: `${Math.round(daytimeShare * 100)}%` },
      { label: "Panel degradation", value: `${ASSUMPTIONS.degradationPerYear * 100}% per year` },
      { label: "Annual maintenance", value: `${ASSUMPTIONS.maintenanceRateOfCapex * 100}% of installed cost from year 2` },
      { label: "Inverter replacement", value: `Year ${ASSUMPTIONS.inverterReplacementYear} at ${ASSUMPTIONS.inverterCostRateOfCapex * 100}% of installed cost` },
      { label: "Export credit", value: exportLabel },
      { label: "Analysis horizon", value: `${ASSUMPTIONS.horizonYears} years at ${ASSUMPTIONS.discountRate * 100}% discount rate` },
      { label: "Grid emission factor", value: `${ASSUMPTIONS.co2KgPerKwh} kg CO2e/kWh (indicative)` },
    ],
    sources: MODEL_SOURCES,
    disclaimer:
      "SOLARekta is not an engineering certification body. Production, savings and payback are scenarios, not guarantees, and are not structural or electrical approvals.",
  };
}
