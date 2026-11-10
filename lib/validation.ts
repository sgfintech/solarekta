import { z } from "zod";

export const emailSchema = z
  .string({ message: "Enter your email address." })
  .trim()
  .min(1, "Enter your email address.")
  .min(5, "Enter a valid email address, like name@example.com.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["customer", "installer", "supplier"]),
  acceptTerms: z.literal("on", { message: "Please accept the terms and privacy notice." }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});

export const siteSchema = z
  .object({
    name: z.string().trim().min(2, "Give this place a name, for example “Our home”.").max(120),
    address: z.string().trim().max(300).optional().or(z.literal("")),
    city: z.string().trim().min(2, "Choose or type your city or municipality.").max(120),
    province: z.string().trim().max(120).optional().or(z.literal("")),
    propertyType: z.enum(["residential", "commercial", "industrial"]),
    ownership: z.enum(["owner", "tenant", "other"]),
    roofType: z.enum(["concrete", "metal", "tile", "asbestos", "unknown"]),
    roofAreaStatus: z.enum(["known", "unknown"]).default("known"),
    roofAreaM2: z.coerce.number().optional(),
    roofAgeYears: z.coerce.number().min(0).max(100).optional(),
    daytimeUsage: z.enum(["low", "medium", "high"]),
    installBudgetPhp: z.coerce.number().min(0, "Budget cannot be negative.").max(500000000).optional(),
    exportPreference: z.enum(["net_metering", "zero_export", "not_sure"]).default("not_sure"),
    utilityProvider: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.roofAreaStatus === "known") {
      if (data.roofAreaM2 == null || !Number.isFinite(data.roofAreaM2)) {
        ctx.addIssue({ code: "custom", path: ["roofAreaM2"], message: "Enter your roof area, or choose “I don’t know yet”." });
      } else if (data.roofAreaM2 < 4 || data.roofAreaM2 > 50000) {
        ctx.addIssue({ code: "custom", path: ["roofAreaM2"], message: "Roof area must be between 4 and 50,000 m²." });
      }
    }
  });

export const billSchema = z
  .object({
    siteId: z.string().uuid(),
    provider: z.string().trim().min(2, "Enter the utility provider.").max(120),
    periodStart: z.string().optional().or(z.literal("")),
    periodEnd: z.string().optional().or(z.literal("")),
    monthlyKwh: z.coerce.number().min(20, "Enter the kWh reading.").max(200000),
    totalPhp: z.coerce.number().min(100, "Enter the total amount.").max(5000000),
    generationChargePhp: z.coerce.number().min(0).max(5000000).optional(),
    fixedChargesPhp: z.coerce.number().min(0).max(500000).optional(),
  })
  .refine(
    (data) => !data.periodStart || !data.periodEnd || data.periodStart <= data.periodEnd,
    { message: "Billing period end must be after the start.", path: ["periodEnd"] },
  );

export const assessmentSchema = z.object({
  siteId: z.string().uuid(),
  systemType: z.enum(["net_metering", "zero_export", "not_sure"], { message: "Choose what happens to extra solar power." }),
});

export const quoteRequestSchema = z
  .object({
    assessmentId: z.string().uuid(),
    installerIds: z.array(z.string().uuid()).min(1, "Choose at least one installer.").max(5),
    message: z.string().trim().max(1000).optional().or(z.literal("")),
    shareContact: z.literal("on").optional(),
    contactName: z.string().trim().max(120).optional().or(z.literal("")),
    contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
    contactEmail: z.string().trim().email("Enter a valid contact email.").max(254).optional().or(z.literal("")),
  })
  .refine((data) => data.shareContact !== "on" || Boolean(data.contactName && data.contactPhone), {
    message: "Add a contact name and phone number, or choose not to share contact details yet.",
    path: ["contactName"],
  });

const lineItemSchema = z.object({
  description: z.string().trim().min(2).max(200),
  amountPhp: z.coerce.number().min(0).max(100000000),
});

export const installerQuoteSchema = z.object({
  inviteId: z.string().uuid(),
  capacityKwp: z.coerce.number().min(0.3, "Minimum 0.3 kWp.").max(10000),
  pricePhp: z.coerce.number().min(1000, "Enter the total price.").max(500000000),
  warrantyYears: z.coerce.number().int().min(0).max(40),
  workmanshipWarrantyYears: z.coerce.number().int().min(0).max(40),
  timelineWeeks: z.coerce.number().int().min(1).max(104),
  expectedAnnualKwh: z.coerce.number().min(50).max(50000000),
  exclusions: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  validUntil: z.string().optional().or(z.literal("")),
  panelModel: z.string().trim().max(160).optional().or(z.literal("")),
  inverterModel: z.string().trim().max(160).optional().or(z.literal("")),
  equipmentSupplier: z.string().trim().max(160).optional().or(z.literal("")),
  inclusions: z.string().trim().max(2000).optional().or(z.literal("")),
  panelProductId: z.string().uuid().optional().or(z.literal("")),
  inverterProductId: z.string().uuid().optional().or(z.literal("")),
  lineItems: z.array(lineItemSchema).max(20).default([]),
});

export const installerApplicationSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  about: z.string().trim().min(20, "Write at least 20 characters about your business.").max(2000),
  phone: z.string().trim().min(7).max(40),
  serviceAreas: z.string().trim().min(2, "List at least one service area.").max(600),
  licenseNo: z.string().trim().max(120).optional().or(z.literal("")),
  yearsExperience: z.coerce.number().int().min(0).max(80),
  website: z.string().trim().url("Enter a full URL including https://").max(300).optional().or(z.literal("")),
});

export const adminInstallerDecisionSchema = z.object({
  installerId: z.string().uuid(),
  action: z.enum(["approve", "reject", "suspend", "reinstate"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const dataRequestSchema = z.object({
  kind: z.enum(["export", "deletion"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const aiExtractionSchema = z.object({
  provider: z.string().min(1).max(120),
  billingPeriodStart: z.string().nullable(),
  billingPeriodEnd: z.string().nullable(),
  monthlyKwh: z.number().positive().nullable(),
  totalPhp: z.number().positive().nullable(),
  generationChargePhp: z.number().nonnegative().nullable(),
  fixedChargesPhp: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500).nullable(),
});

export type AiExtraction = z.infer<typeof aiExtractionSchema>;

export function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function optionalNumber(formData: FormData, key: string): number | undefined {
  const raw = field(formData, key).trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

const FIELD_LABELS: Record<string, string> = {
  monthlyKwh: "kWh used this month",
  totalPhp: "bill total",
  pricePhp: "price",
  capacityKwp: "system size",
  roofAgeYears: "roof age",
  warrantyYears: "warranty",
  workmanshipWarrantyYears: "workmanship warranty",
  timelineWeeks: "timeline",
  expectedAnnualKwh: "expected yearly generation",
  amountPhp: "amount",
};

/** "generationChargePhp" → "generation charge (₱)". */
function fieldLabel(path: PropertyKey[]): string {
  const key = String(path.filter((p) => typeof p === "string").at(-1) ?? "");
  if (!key) return "this field";
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const php = /Php$/.test(key);
  const words = key.replace(/Php$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().replace(/\bkwh\b/g, "kWh").replace(/\bkwp\b/g, "kWp").replace(/\bkw\b/g, "kW");
  return php ? `${words} (₱)` : words;
}

const LIBRARY_DEFAULT = /^(Too (small|big)|Invalid|Expected|Required)/;

/**
 * Plain-language message for one issue. Custom messages written in a schema are kept;
 * Zod's library defaults ("Too small: expected number to be >=0") are rewritten using the
 * field name.
 */
export function friendlyIssue(issue: z.core.$ZodIssue): string {
  if (issue.message && !LIBRARY_DEFAULT.test(issue.message)) return issue.message;
  const label = fieldLabel(issue.path);
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  const i = issue as unknown as { code: string; origin?: string; minimum?: number | bigint; maximum?: number | bigint; expected?: string; inclusive?: boolean };
  switch (i.code) {
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? `Enter the ${label}.` : `${cap} is too short. Use at least ${i.minimum} characters.`;
      if (i.origin === "array" || i.origin === "set") return `Choose at least ${i.minimum} for ${label}.`;
      return `${cap} must be ${i.inclusive === false ? "more than" : "at least"} ${Number(i.minimum).toLocaleString("en-PH")}.`;
    case "too_big":
      if (i.origin === "string") return `${cap} is too long. Keep it under ${Number(i.maximum).toLocaleString("en-PH")} characters.`;
      if (i.origin === "array" || i.origin === "set") return `Choose up to ${i.maximum} for ${label}.`;
      return `${cap} must be ${Number(i.maximum).toLocaleString("en-PH")} or less.`;
    case "invalid_type":
      return i.expected === "number" ? `Enter a number for ${label}.` : `Enter the ${label}.`;
    case "invalid_format":
      return `Check the format of the ${label}.`;
    case "invalid_value":
      return `Choose one of the options for ${label}.`;
    default:
      return `Check the ${label}.`;
  }
}

export function zodMessage(error: z.ZodError): string {
  const first = error.issues[0];
  return first ? friendlyIssue(first) : "Please check the form and try again.";
}

/** First message per field, keyed by the top-level field name. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = friendlyIssue(issue);
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Guest estimate wizard. Only minimal, non-identifying inputs are collected here:
 * no names, addresses, contact details or bill files.
 * ------------------------------------------------------------------------- */

const kwh = z.coerce
  .number({ message: "Enter the kWh used, shown on your bill." })
  .min(20, "Enter at least 20 kWh. Check the “kWh used” line on your bill.")
  .max(200000, "That is more than 200,000 kWh. Check the reading.");
const billAmount = z.coerce
  .number({ message: "Enter the total amount due." })
  .min(100, "Enter a bill total of at least ₱100.")
  .max(5000000, "That is more than ₱5,000,000. Check the amount.");

export const estimateStepSchemas = {
  1: z.object({
    monthlyKwh: kwh,
    monthlyBillPhp: billAmount,
    utilityProvider: z.string().trim().max(60).optional().or(z.literal("")),
  }),
  2: z.object({
    city: z.string().trim().min(2, "Choose or type your city or municipality.").max(120),
    province: z.string().trim().max(120).optional().or(z.literal("")),
    propertyType: z.enum(["residential", "commercial"], { message: "Choose home or business." }),
    daytimeUsage: z.enum(["low", "medium", "high"], { message: "Choose when you use the most electricity." }),
  }),
  3: z
    .object({
      roofAreaStatus: z.enum(["known", "unknown"], { message: "Tell us if you know your roof area." }),
      roofAreaM2: z.coerce.number().optional(),
      roofType: z.enum(["concrete", "metal", "tile", "asbestos", "unknown"], { message: "Choose your roof type, or “Not sure”." }),
    })
    .superRefine((data, ctx) => {
      if (data.roofAreaStatus !== "known") return;
      if (data.roofAreaM2 == null || !Number.isFinite(data.roofAreaM2)) {
        ctx.addIssue({ code: "custom", path: ["roofAreaM2"], message: "Enter the roof area in square metres, or choose “I don’t know yet”." });
      } else if (data.roofAreaM2 < 4 || data.roofAreaM2 > 50000) {
        ctx.addIssue({ code: "custom", path: ["roofAreaM2"], message: "Roof area must be between 4 and 50,000 m²." });
      }
    }),
  4: z.object({
    systemType: z.enum(["net_metering", "zero_export", "not_sure"], { message: "Choose what should happen to extra solar power." }),
  }),
} as const;

export type EstimateStep = keyof typeof estimateStepSchemas;
export const ESTIMATE_STEPS: EstimateStep[] = [1, 2, 3, 4];

export interface GuestEstimateData {
  monthlyKwh?: number;
  monthlyBillPhp?: number;
  utilityProvider?: string;
  city?: string;
  province?: string;
  propertyType?: "residential" | "commercial";
  daytimeUsage?: "low" | "medium" | "high";
  roofAreaStatus?: "known" | "unknown";
  roofAreaM2?: number;
  roofType?: "concrete" | "metal" | "tile" | "asbestos" | "unknown";
  systemType?: "net_metering" | "zero_export" | "not_sure";
}

/** Validates one wizard step from raw strings. Returns cleaned data or field errors. */
export function validateEstimateStep(step: EstimateStep, raw: Record<string, unknown>):
  | { ok: true; data: Partial<GuestEstimateData> }
  | { ok: false; fieldErrors: Record<string, string> } {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    cleaned[key] = typeof value === "string" && value.trim() === "" ? undefined : value;
  }
  const parsed = estimateStepSchemas[step].safeParse(cleaned);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const data = { ...parsed.data } as Partial<GuestEstimateData>;
  if (step === 3 && data.roofAreaStatus === "unknown") delete data.roofAreaM2;
  return { ok: true, data };
}

/** True when every step validates; used before computing or claiming a draft. */
export function isCompleteEstimate(data: GuestEstimateData): boolean {
  return ESTIMATE_STEPS.every((step) => validateEstimateStep(step, data as Record<string, unknown>).ok);
}


/* ----------------------------------------------------------------------------
 * Supplier marketplace
 * ------------------------------------------------------------------------- */

export const supplierApplicationSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your company name.").max(160),
  supplierType: z.enum(["distributor", "manufacturer", "retailer"], { message: "Choose what kind of supplier you are." }),
  about: z.string().trim().min(20, "Write at least 20 characters about your company.").max(2000),
  phone: z.string().trim().min(7, "Enter a business phone number.").max(40),
  deliveryAreas: z.string().trim().min(2, "List at least one area you deliver to.").max(600),
  registrationNo: z.string().trim().max(120).optional().or(z.literal("")),
  yearsInBusiness: z.coerce.number().int().min(0).max(100),
  website: z.string().trim().url("Enter a full URL including https://").max(300).optional().or(z.literal("")),
});

const optionalPositive = (max: number) => z.coerce.number().min(0).max(max).optional();

export const productSchema = z.object({
  category: z.enum(["panel", "inverter", "battery", "mounting", "accessory"], { message: "Choose a category." }),
  brand: z.string().trim().min(1, "Enter the brand.").max(80),
  model: z.string().trim().min(1, "Enter the model number.").max(120),
  title: z.string().trim().min(3, "Give the listing a short title.").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  ratedPowerW: optionalPositive(100000),
  efficiencyPct: optionalPositive(100),
  ratedKw: optionalPositive(10000),
  capacityKwh: optionalPositive(10000),
  phase: z.enum(["single", "three", ""]).optional(),
  inverterType: z.enum(["grid_tie", "hybrid", "off_grid", ""]).optional(),
  chemistry: z.string().trim().max(60).optional().or(z.literal("")),
  nominalVoltageV: optionalPositive(2000),
  capacityAh: optionalPositive(100000),
  usableCapacityKwh: optionalPositive(10000),
  dodPercent: optionalPositive(100),
  batteryVoltageV: optionalPositive(2000),
  communication: z.string().trim().max(120).optional().or(z.literal("")),
  compatibleModels: z.string().trim().max(1000).optional().or(z.literal("")),
  priceBasis: z.enum(["equipment_only", "equipment_delivered", "supply_and_install"]).default("equipment_only"),
  inclusions: z.string().trim().max(600).optional().or(z.literal("")),
  exclusions: z.string().trim().max(600).optional().or(z.literal("")),
  warrantyProductYears: z.coerce.number().int().min(0).max(40).optional(),
  warrantyPerformanceYears: z.coerce.number().int().min(0).max(40).optional(),
  warrantyBacker: z.string().trim().max(200).optional().or(z.literal("")),
  certifications: z.string().trim().max(400).optional().or(z.literal("")),
  pricePhp: z.coerce.number().min(0).max(50000000).optional(),
  unit: z.enum(["piece", "set", "kit", "meter"]).default("piece"),
  stockStatus: z.enum(["in_stock", "made_to_order", "out_of_stock"]),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
});

export const priceRequestSchema = z.object({
  productId: z.string().uuid("Choose a product."),
  quantity: z.coerce.number().positive("Enter a quantity.").max(100000),
  quoteRequestId: z.string().uuid().optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const priceResponseSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["quote", "decline"]),
  unitPricePhp: z.coerce.number().min(0).max(50000000).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  validUntil: z.string().optional().or(z.literal("")),
  supplierNote: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const orderSchema = z
  .object({
    supplierId: z.string().uuid(),
    items: z
      .array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(10000) }))
      .min(1, "Add at least one item with a quantity.")
      .max(20),
    deliveryCity: z.string().trim().min(2, "Enter the delivery city or municipality.").max(120),
    deliveryProvince: z.string().trim().max(120).optional().or(z.literal("")),
    deliveryAddress: z.string().trim().max(300).optional().or(z.literal("")),
    contactName: z.string().trim().min(2, "Enter a contact name.").max(120),
    contactPhone: z.string().trim().min(7, "Enter a phone number the supplier can call.").max(40),
    installerPlan: z.enum(["platform_installer", "own_installer", "undecided"], { message: "Tell us who will install it." }),
    installerId: z.string().uuid().optional().or(z.literal("")),
    note: z.string().trim().max(1000).optional().or(z.literal("")),
    acknowledge: z.literal("on", { message: "Please confirm you have read how orders and payment work." }),
  })
  .refine((d) => d.installerPlan !== "platform_installer" || Boolean(d.installerId), {
    message: "Choose the SOLARekta installer who will install it, or pick another option.",
    path: ["installerId"],
  });

export const orderUpdateSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum(["confirmed", "declined", "paid", "shipped", "delivered", "cancelled"]),
  deliveryFeePhp: z.coerce.number().min(0).max(5000000).optional(),
  totalPhp: z.coerce.number().min(0).max(500000000).optional(),
  etaDate: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const supplierQuoteRequestSchema = z
  .object({
    productId: z.string().uuid("Choose a product."),
    quantity: z.coerce.number().int("Enter a whole number.").min(1, "Enter a quantity.").max(10000),
    deliveryCity: z.string().trim().min(2, "Enter the delivery city or municipality.").max(120),
    details: z.string().trim().max(1000).optional().or(z.literal("")),
    shareContact: z.enum(["yes", "no"]),
    contactName: z.string().trim().max(120).optional().or(z.literal("")),
    contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
    confirmed: z.literal("yes", { message: "Review the request and confirm before sending." }),
  })
  .superRefine((value, ctx) => {
    if (value.shareContact === "yes") {
      if (!value.contactName || value.contactName.length < 2) ctx.addIssue({ code: "custom", path: ["contactName"], message: "Enter the name the supplier should use." });
      if (!value.contactPhone || value.contactPhone.length < 7) ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Enter a phone number, or choose not to share contact details." });
    }
  });

export const supplierQuoteReplySchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["reply", "decline"]),
  replyPricePhp: z.coerce.number().min(0).max(50000000).optional(),
  replyValidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  replyNote: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const advisorQuestionSchema = z.object({
  question: z.string().trim().min(3, "Type a question.").max(500, "Keep questions under 500 characters."),
  threadId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  quoteReviewId: z.string().uuid().optional().nullable(),
});
