import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  aiExtractionSchema,
  billSchema,
  emailSchema,
  field,
  installerApplicationSchema,
  installerQuoteSchema,
  loginSchema,
  optionalNumber,
  passwordSchema,
  quoteRequestSchema,
  signupSchema,
  siteSchema,
  zodMessage,
} from "@/lib/validation";

const uuid = randomUUID();

describe("account validation", () => {
  it("normalises email addresses", () => {
    expect(emailSchema.parse("  Maria@Example.PH ")).toBe("maria@example.ph");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("enforces a minimum-strength password", () => {
    expect(passwordSchema.safeParse("Solarekta2026!").success).toBe(true);
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletters").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(false);
  });

  it("requires explicit terms acceptance for signup", () => {
    const valid = {
      name: "Maria Santos",
      email: "maria@example.ph",
      password: "Solarekta2026!",
      role: "customer",
      acceptTerms: "on",
    };
    expect(signupSchema.safeParse(valid).success).toBe(true);
    expect(signupSchema.safeParse({ ...valid, acceptTerms: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });

  it("accepts login without a next path", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("site and bill validation", () => {
  const site = {
    name: "Casa Santos",
    address: "",
    city: "Quezon City",
    province: "",
    propertyType: "residential",
    ownership: "owner",
    roofType: "concrete",
    roofAreaM2: "82",
    roofAgeYears: "12",
    daytimeUsage: "medium",
    installBudgetPhp: "450000",
    exportPreference: "not_sure",
    utilityProvider: "Meralco",
  };

  it("coerces numeric site fields from form strings", () => {
    const parsed = siteSchema.parse(site);
    expect(parsed.roofAreaM2).toBe(82);
    expect(parsed.roofAgeYears).toBe(12);
    expect(parsed.installBudgetPhp).toBe(450000);
    expect(parsed.roofAreaStatus).toBe("known");
  });

  it("supports an explicit unknown roof area but requires area when known", () => {
    const unknown = siteSchema.safeParse({ ...site, roofAreaM2: "", roofAreaStatus: "unknown" });
    expect(unknown.success).toBe(true);
    const missing = siteSchema.safeParse({ ...site, roofAreaM2: undefined, roofAreaStatus: "known" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(["roofAreaM2"]);
  });

  it("accepts a 'not sure' export preference", () => {
    expect(siteSchema.safeParse({ ...site, exportPreference: "not_sure" }).success).toBe(true);
    expect(siteSchema.safeParse({ ...site, exportPreference: "maybe" }).success).toBe(false);
  });

  it("rejects impossible roof areas and enum values", () => {
    expect(siteSchema.safeParse({ ...site, roofAreaM2: "3" }).success).toBe(false);
    expect(siteSchema.safeParse({ ...site, roofType: "thatch" }).success).toBe(false);
  });

  it("accepts a complete bill and computes no derived values in the schema", () => {
    const parsed = billSchema.parse({
      siteId: uuid,
      provider: "Meralco",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      monthlyKwh: "486",
      totalPhp: "5832",
      generationChargePhp: "4210",
      fixedChargesPhp: "1622",
    });
    expect(parsed.monthlyKwh).toBe(486);
    expect(parsed.totalPhp).toBe(5832);
  });

  it("rejects a reversed billing period", () => {
    const result = billSchema.safeParse({
      siteId: uuid,
      provider: "Meralco",
      periodStart: "2026-10-01",
      periodEnd: "2026-09-01",
      monthlyKwh: 486,
      totalPhp: 5832,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodMessage(result.error)).toMatch(/billing period/i);
  });

  it("requires a UUID site id", () => {
    expect(billSchema.safeParse({ siteId: "not-a-uuid", provider: "Meralco", monthlyKwh: 100, totalPhp: 1000 }).success).toBe(false);
  });
});

describe("quote validation", () => {
  it("requires contact details when contact sharing is enabled", () => {
    const base = {
      assessmentId: uuid,
      installerIds: [uuid],
      message: "",
      shareContact: "on" as const,
      contactPhone: "",
      contactEmail: "",
    };
    expect(quoteRequestSchema.safeParse({ ...base, contactName: "Maria", contactPhone: "+63 917 555 0101" }).success).toBe(true);
    expect(quoteRequestSchema.safeParse({ ...base, contactName: "" }).success).toBe(false);
  });

  it("limits a request to five installers", () => {
    const result = quoteRequestSchema.safeParse({
      assessmentId: uuid,
      installerIds: [uuid, uuid, uuid, uuid, uuid, uuid],
    });
    expect(result.success).toBe(false);
  });

  it("defaults line items to an empty list", () => {
    const parsed = installerQuoteSchema.parse({
      inviteId: uuid,
      capacityKwp: "3.2",
      pricePhp: "188000",
      warrantyYears: "12",
      workmanshipWarrantyYears: "5",
      timelineWeeks: "8",
      expectedAnnualKwh: "4380",
    });
    expect(parsed.lineItems).toEqual([]);
  });

  it("rejects fractional warranties and zero-week timelines", () => {
    const base = {
      inviteId: uuid,
      capacityKwp: 3.2,
      pricePhp: 188000,
      warrantyYears: 12.5,
      workmanshipWarrantyYears: 5,
      timelineWeeks: 0,
      expectedAnnualKwh: 4380,
    };
    expect(installerQuoteSchema.safeParse(base).success).toBe(false);
  });
});

describe("installer application validation", () => {
  it("requires a substantive business description and a valid website", () => {
    const base = {
      businessName: "Bayanihan Solar",
      about: "We install rooftop solar and explain every line item clearly.",
      phone: "+63 917 555 0201",
      serviceAreas: "Quezon City, Manila",
      licenseNo: "",
      yearsExperience: "9",
      website: "https://example.com",
    };
    expect(installerApplicationSchema.safeParse(base).success).toBe(true);
    expect(installerApplicationSchema.safeParse({ ...base, about: "Too short" }).success).toBe(false);
    expect(installerApplicationSchema.safeParse({ ...base, website: "example.com" }).success).toBe(false);
  });
});

describe("AI output validation", () => {
  it("accepts a well-formed extraction with nullable fields", () => {
    const parsed = aiExtractionSchema.parse({
      provider: "Meralco",
      billingPeriodStart: null,
      billingPeriodEnd: null,
      monthlyKwh: 486,
      totalPhp: 5832,
      generationChargePhp: null,
      fixedChargesPhp: null,
      confidence: 0.82,
      notes: null,
    });
    expect(parsed.monthlyKwh).toBe(486);
  });

  it("rejects impossible confidence, negative kWh and unexpected types", () => {
    const base = {
      provider: "Meralco",
      billingPeriodStart: null,
      billingPeriodEnd: null,
      monthlyKwh: 486,
      totalPhp: 5832,
      generationChargePhp: null,
      fixedChargesPhp: null,
      confidence: 0.8,
      notes: null,
    };
    expect(aiExtractionSchema.safeParse({ ...base, confidence: 1.2 }).success).toBe(false);
    expect(aiExtractionSchema.safeParse({ ...base, monthlyKwh: -1 }).success).toBe(false);
    expect(aiExtractionSchema.safeParse({ ...base, provider: "" }).success).toBe(false);
  });
});

describe("form helpers", () => {
  it("reads text fields and optional numbers safely", () => {
    const data = new FormData();
    data.set("name", "Casa Santos");
    data.set("budget", "450,000");
    data.set("broken", "not a number");
    expect(field(data, "name")).toBe("Casa Santos");
    expect(field(data, "missing")).toBe("");
    expect(optionalNumber(data, "budget")).toBe(450000);
    expect(optionalNumber(data, "broken")).toBeUndefined();
    expect(optionalNumber(data, "missing")).toBeUndefined();
  });
});
