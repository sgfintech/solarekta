import type { OrderStatus, PriceRequestStatus, ProductCategory } from "@/lib/types";

/**
 * Pure marketplace rules shared by server actions and pages. No database access here,
 * so the rules are easy to test and identical everywhere they are enforced.
 */

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  panel: "Solar panels",
  inverter: "Inverters",
  battery: "Batteries",
  mounting: "Mounting & racking",
  accessory: "Cables & accessories",
};

export const CATEGORY_SINGULAR: Record<ProductCategory, string> = {
  panel: "Solar panel",
  inverter: "Inverter",
  battery: "Battery",
  mounting: "Mounting",
  accessory: "Accessory",
};

export const STOCK_LABEL = { in_stock: "In stock", made_to_order: "Made to order", out_of_stock: "Out of stock" } as const;
export const SUPPLIER_TYPE_LABEL = { distributor: "Distributor", manufacturer: "Manufacturer", retailer: "Retailer" } as const;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  requested: "Waiting for supplier",
  confirmed: "Confirmed — arrange payment",
  paid: "Payment received",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  declined: "Declined by supplier",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "good" | "warn" | "bad" | "neutral"> = {
  requested: "warn",
  confirmed: "warn",
  paid: "good",
  shipped: "good",
  delivered: "good",
  cancelled: "neutral",
  declined: "bad",
};

export const INSTALLER_PLAN_LABEL = {
  platform_installer: "A SOLARekta installer",
  own_installer: "My own licensed installer",
  undecided: "Not decided yet",
} as const;

export const PRICE_REQUEST_LABEL: Record<PriceRequestStatus, string> = {
  open: "Waiting for supplier",
  quoted: "Price received",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export interface ProductSpecs {
  ratedPowerW?: number;
  efficiencyPct?: number;
  ratedKw?: number;
  capacityKwh?: number;
  phase?: "single" | "three";
  inverterType?: "grid_tie" | "hybrid" | "off_grid";
  chemistry?: string;
  /** Battery: nominal voltage and amp-hours from the datasheet. */
  nominalVoltageV?: number;
  capacityAh?: number;
  /** Battery: usable capacity or depth of discharge, only when the datasheet states it. */
  usableCapacityKwh?: number;
  dodPercent?: number;
  /** Inverter: nominal battery-input voltage (hybrid / off-grid). */
  batteryVoltageV?: number;
  /** Battery or inverter: BMS communication protocols, e.g. ["CAN", "RS485"]. */
  communication?: string[];
  /** Models the manufacturer lists as compatible. */
  compatibleModels?: string[];
}

export function parseSpecs(json: string | null | undefined): ProductSpecs {
  if (!json) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as ProductSpecs) : {};
  } catch {
    return {};
  }
}

const INVERTER_TYPE = { grid_tie: "Grid-tie", hybrid: "Hybrid", off_grid: "Off-grid" } as const;

/** Short, factual spec chips for cards. Only fields the supplier actually entered. */
export function specSummary(category: ProductCategory, specs: ProductSpecs): string[] {
  const out: string[] = [];
  if (category === "panel") {
    if (specs.ratedPowerW) out.push(`${specs.ratedPowerW} W`);
    if (specs.efficiencyPct) out.push(`${specs.efficiencyPct}% efficiency`);
  } else if (category === "inverter") {
    if (specs.ratedKw) out.push(`${specs.ratedKw} kW`);
    if (specs.inverterType) out.push(INVERTER_TYPE[specs.inverterType]);
    if (specs.phase) out.push(specs.phase === "single" ? "Single-phase" : "Three-phase");
  } else if (category === "battery") {
    if (specs.nominalVoltageV && specs.capacityAh) out.push(`${specs.nominalVoltageV} V ${specs.capacityAh} Ah`);
    if (specs.capacityKwh) out.push(`${specs.capacityKwh} kWh`);
    if (specs.chemistry) out.push(specs.chemistry);
  }
  return out;
}

export type OrderActor = "customer" | "supplier";

/** Allowed order transitions and who may make them. */
export const ORDER_TRANSITIONS: Record<OrderStatus, { to: OrderStatus; by: OrderActor[] }[]> = {
  requested: [
    { to: "confirmed", by: ["supplier"] },
    { to: "declined", by: ["supplier"] },
    { to: "cancelled", by: ["customer"] },
  ],
  confirmed: [
    { to: "paid", by: ["supplier"] },
    { to: "cancelled", by: ["customer", "supplier"] },
  ],
  paid: [{ to: "shipped", by: ["supplier"] }],
  shipped: [{ to: "delivered", by: ["supplier", "customer"] }],
  delivered: [],
  cancelled: [],
  declined: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return ORDER_TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor));
}

export function nextOrderActions(status: OrderStatus, actor: OrderActor): OrderStatus[] {
  return ORDER_TRANSITIONS[status].filter((t) => t.by.includes(actor)).map((t) => t.to);
}

export type PriceActor = "installer" | "supplier";

export const PRICE_REQUEST_TRANSITIONS: Record<PriceRequestStatus, { to: PriceRequestStatus; by: PriceActor[] }[]> = {
  open: [
    { to: "quoted", by: ["supplier"] },
    { to: "declined", by: ["supplier"] },
    { to: "withdrawn", by: ["installer"] },
  ],
  quoted: [
    { to: "quoted", by: ["supplier"] },
    { to: "accepted", by: ["installer"] },
    { to: "withdrawn", by: ["installer"] },
  ],
  accepted: [],
  declined: [],
  withdrawn: [],
};

export function canTransitionPriceRequest(from: PriceRequestStatus, to: PriceRequestStatus, actor: PriceActor): boolean {
  return PRICE_REQUEST_TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor));
}

/** Order subtotal from listed prices. null when any item is "price on request". */
export function orderSubtotal(items: { unitPricePhp: number | null; quantity: number }[]): number | null {
  if (items.some((item) => item.unitPricePhp == null)) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.unitPricePhp as number) * item.quantity, 0) * 100) / 100;
}

/** Fields whose change sends an approved product back to review. Price and stock can change freely. */
export const REVIEWED_PRODUCT_FIELDS = [
  "category",
  "brand",
  "model",
  "title",
  "description",
  "specs_json",
  "warranty_product_years",
  "warranty_performance_years",
  "warranty_backer",
  "certifications",
] as const;
