export type Role = "customer" | "installer" | "supplier" | "admin";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  role: Role;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export type SessionUser = Pick<UserRow, "id" | "email" | "name" | "phone" | "role" | "status">;

export interface SiteRow {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  city: string;
  province: string | null;
  property_type: "residential" | "commercial" | "industrial";
  ownership: "owner" | "tenant" | "other";
  roof_type: "concrete" | "metal" | "tile" | "asbestos" | "unknown";
  roof_area_m2: number;
  roof_age_years: number | null;
  daytime_usage: "low" | "medium" | "high";
  /** Legacy field: labelled "monthly electricity budget" but used as an installation budget. Not used since 2026.2. */
  monthly_budget_php: number | null;
  /** One-time installation budget in pesos. */
  install_budget_php: number | null;
  roof_area_status: "known" | "unknown";
  export_preference: "net_metering" | "zero_export" | "not_sure" | null;
  utility_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillRow {
  id: string;
  site_id: string;
  user_id: string;
  provider: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  monthly_kwh: number;
  total_php: number;
  generation_charge_php: number | null;
  fixed_charges_php: number | null;
  effective_rate_php: number | null;
  status: "draft" | "confirmed";
  source: "manual" | "ai" | "ai_corrected";
  file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentRow {
  id: string;
  site_id: string;
  user_id: string;
  model_version: string;
  inputs_json: string;
  result_json: string;
  explanation: string | null;
  explanation_source: string | null;
  status: "draft" | "ready" | "quote_requested" | "archived";
  created_at: string;
  updated_at: string;
}

export interface InstallerRow {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  about: string | null;
  website: string | null;
  phone: string | null;
  service_areas_json: string;
  verification_status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  verified_at: string | null;
  license_no: string | null;
  years_experience: number | null;
  is_demo?: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequestRow {
  id: string;
  customer_user_id: string;
  site_id: string;
  assessment_id: string;
  status: "open" | "matched" | "closed" | "cancelled";
  message: string | null;
  share_contact: number;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallerQuoteRow {
  id: string;
  invite_id: string;
  quote_request_id: string;
  installer_id: string;
  status: "submitted" | "revised" | "withdrawn";
  capacity_kwp: number;
  price_php: number;
  warranty_years: number;
  workmanship_warranty_years: number;
  timeline_weeks: number;
  expected_annual_kwh: number;
  exclusions: string | null;
  notes: string | null;
  valid_until: string | null;
  panel_model: string | null;
  inverter_model: string | null;
  panel_product_id: string | null;
  inverter_product_id: string | null;
  equipment_supplier: string | null;
  inclusions: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: string;
  owner_user_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  purpose: string;
  created_at: string;
}

export interface SupplierRow {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  supplier_type: "distributor" | "manufacturer" | "retailer";
  about: string | null;
  website: string | null;
  phone: string | null;
  delivery_areas_json: string;
  registration_no: string | null;
  years_in_business: number | null;
  verification_status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  verified_at: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export type ProductCategory = "panel" | "inverter" | "battery" | "mounting" | "accessory";

export interface ProductRow {
  id: string;
  supplier_id: string;
  category: ProductCategory;
  brand: string;
  model: string;
  title: string;
  description: string | null;
  specs_json: string;
  warranty_product_years: number | null;
  warranty_performance_years: number | null;
  warranty_backer: string | null;
  certifications: string | null;
  datasheet_file_id: string | null;
  price_php: number | null;
  unit: string;
  stock_status: "in_stock" | "made_to_order" | "out_of_stock";
  lead_time_days: number | null;
  price_basis: "equipment_only" | "equipment_delivered" | "supply_and_install";
  inclusions: string | null;
  exclusions: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "archived";
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = "requested" | "confirmed" | "paid" | "shipped" | "delivered" | "cancelled" | "declined";

export interface OrderRow {
  id: string;
  customer_user_id: string;
  supplier_id: string;
  status: OrderStatus;
  delivery_city: string;
  delivery_province: string | null;
  delivery_address: string | null;
  contact_name: string;
  contact_phone: string;
  installer_plan: "platform_installer" | "own_installer" | "undecided";
  installer_id: string | null;
  note: string | null;
  subtotal_php: number | null;
  delivery_fee_php: number | null;
  total_php: number | null;
  eta_date: string | null;
  supplier_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  title: string;
  brand: string;
  model: string;
  quantity: number;
  unit_price_php: number | null;
  line_total_php: number | null;
}

export type PriceRequestStatus = "open" | "quoted" | "accepted" | "declined" | "withdrawn";

export interface PriceRequestRow {
  id: string;
  installer_id: string;
  supplier_id: string;
  product_id: string | null;
  quote_request_id: string | null;
  quantity: number;
  message: string | null;
  status: PriceRequestStatus;
  unit_price_php: number | null;
  total_php: number | null;
  lead_time_days: number | null;
  supplier_note: string | null;
  valid_until: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteReviewRow {
  id: string;
  user_id: string;
  file_id: string | null;
  status: "extracted" | "manual" | "confirmed";
  extraction_source: "ai" | "manual";
  extraction_note: string | null;
  data_json: string;
  created_at: string;
  updated_at: string;
}

export type SupplierQuoteStatus = "sent" | "replied" | "declined" | "closed";

export interface SupplierQuoteRequestRow {
  id: string;
  customer_user_id: string;
  supplier_id: string;
  product_id: string | null;
  product_label: string;
  quantity: number;
  delivery_city: string;
  details: string | null;
  share_contact: number;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: SupplierQuoteStatus;
  reply_price_php: number | null;
  reply_note: string | null;
  reply_valid_until: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}
