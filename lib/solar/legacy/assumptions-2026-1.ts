/** FROZEN assumptions for solar-ph-2026.1. Do not edit. */
/**
 * Versioned, auditable assumptions for the deterministic assessment engine.
 * Any change to a numeric value or formula requires bumping MODEL_VERSION so that
 * stored assessments remain reproducible alongside the version that produced them.
 */
export const MODEL_VERSION = "solar-ph-2026.1";

export const ASSUMPTIONS = {
  usableRoofFactor: 0.72,
  areaPerKwpM2: 5.5,
  horizonYears: 25,
  degradationPerYear: 0.005,
  maintenanceRateOfCapex: 0.01,
  inverterReplacementYear: 12,
  inverterCostRateOfCapex: 0.12,
  exportCreditRatioOfRetail: 0.55,
  co2KgPerKwh: 0.7,
  discountRate: 0.08,
  tariffBoundsPhpPerKwh: { min: 6, max: 25 },
  benchmarkCostPerKwpPhp: 55000,
  roofTypeUsableFactor: {
    concrete: 1,
    metal: 1,
    tile: 0.85,
    asbestos: 0.75,
    unknown: 0.85,
  } as const,
  daytimeUsageShare: {
    low: 0.3,
    medium: 0.45,
    high: 0.6,
  } as const,
} as const;

export const SCENARIO_PARAMS = {
  low: {
    label: "Conservative",
    targetOffset: 0.5,
    shadingFactor: 0.86,
    costPerKwpPhp: 60000,
    selfConsumptionFactor: 0.85,
    tariffEscalation: 0.02,
  },
  base: {
    label: "Base case",
    targetOffset: 0.7,
    shadingFactor: 0.95,
    costPerKwpPhp: 55000,
    selfConsumptionFactor: 1,
    tariffEscalation: 0.03,
  },
  high: {
    label: "Optimistic",
    targetOffset: 0.9,
    shadingFactor: 1,
    costPerKwpPhp: 48000,
    selfConsumptionFactor: 1.1,
    tariffEscalation: 0.04,
  },
} as const;

export type ScenarioName = keyof typeof SCENARIO_PARAMS;

export const MODEL_SOURCES = [
  "PV yield: indicative long-term Philippine city averages, rounded (validation with PVGIS/SARAH required before precise claims).",
  "Install cost: indicative PHP 48,000–60,000 per kWp installed for small residential systems; installer quotes always supersede this benchmark.",
  "Retail tariff: taken from the customer's own bill when provided; otherwise a placeholder is flagged and must be corrected.",
  "Grid emission factor: 0.7 kg CO2e per kWh, indicative national grid average for communication only.",
  "Net metering: export credited at 55% of the retail rate to approximate the generation component; actual utility rules vary.",
];
