/**
 * Versioned, auditable assumptions for the deterministic assessment engine.
 * Any change to a numeric value or formula requires bumping MODEL_VERSION so that
 * stored assessments remain reproducible alongside the version that produced them.
 *
 * solar-ph-2026.2 changes (see docs/SOLARekta_Implementation_Status.md):
 *  - final capacity never exceeds usable roof capacity; no forced minimum size
 *  - unknown roof area is a separate, explicitly unchecked calculation path
 *  - LCOE uses discounted cost / discounted production (both discounted)
 *  - "Not sure" export treatment, modelled conservatively with zero credit
 *  - uncertainty scenarios keep the recommended system size fixed; alternative
 *    sizes are reported separately as size options
 *  - budget compared with installation cost is a one-time installation budget
 */
export const MODEL_VERSION = "solar-ph-2026.2";

export const ASSUMPTIONS = {
  usableRoofFactor: 0.72,
  areaPerKwpM2: 5.5,
  /** Below this, a rooftop system is not modelled; the user gets an actionable message instead. */
  minimumPracticalKwp: 0.5,
  horizonYears: 25,
  degradationPerYear: 0.005,
  maintenanceRateOfCapex: 0.01,
  inverterReplacementYear: 12,
  inverterCostRateOfCapex: 0.12,
  co2KgPerKwh: 0.7,
  discountRate: 0.08,
  tariffBoundsPhpPerKwh: { min: 6, max: 25 },
  /** Daytime self-consumption can never exceed this share of annual use. */
  maxSelfConsumptionShare: 0.9,
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

/**
 * Export treatment is explicit, versioned configuration. The net-metering credit is an
 * approximation of the generation-charge component, NOT a published utility tariff.
 */
export const EXPORT_CONFIG = {
  version: "export-2026.2",
  netMeteringCreditRatioOfRetail: 0.55,
  basis:
    "Assumed: exported solar is credited at about 55% of your average retail rate, approximating the generation charge. Actual crediting depends on your distribution utility and an approved net-metering application.",
} as const;

/** The system size we recommend, as a share of annual consumption (before roof limits). */
export const RECOMMENDED_TARGET_SHARE = 0.7;

/** Alternative sizes shown separately from uncertainty. All use base-case assumptions. */
export const SIZE_OPTIONS = {
  smaller: { label: "Smaller system", targetShare: 0.5 },
  recommended: { label: "Recommended size", targetShare: RECOMMENDED_TARGET_SHARE },
  larger: { label: "Larger system", targetShare: 0.9 },
} as const;
export type SizeOptionKey = keyof typeof SIZE_OPTIONS;

/**
 * Uncertainty scenarios. System size is held constant; only uncertain inputs vary.
 */
export const SCENARIO_PARAMS = {
  low: {
    label: "Lower outcome",
    shadingFactor: 0.86,
    costPerKwpPhp: 60000,
    selfConsumptionFactor: 0.85,
    tariffEscalation: 0.02,
  },
  base: {
    label: "Most likely",
    shadingFactor: 0.95,
    costPerKwpPhp: 55000,
    selfConsumptionFactor: 1,
    tariffEscalation: 0.03,
  },
  high: {
    label: "Higher outcome",
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
  "Retail tariff: your bill total divided by the kWh used. This treats fixed charges as if solar could reduce them, so actual bill reduction may be smaller.",
  "Grid emission factor: 0.7 kg CO2e per kWh, indicative national grid average for communication only.",
  `Exported power (${EXPORT_CONFIG.version}): ${EXPORT_CONFIG.basis}`,
  "Levelised cost (LCOE): discounted lifetime costs divided by discounted lifetime production, both at the same discount rate.",
];
