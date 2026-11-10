import "server-only";
import { db } from "@/lib/db";
import type { OrderItemRow, OrderRow, PriceRequestRow, ProductCategory, ProductRow, SupplierRow } from "@/lib/types";

/**
 * Ownership-scoped marketplace queries. Public catalogue queries only ever return
 * approved products from verified suppliers; private queries always include the
 * owner predicate.
 */

export interface CatalogueItem extends ProductRow {
  supplier_name: string;
  supplier_slug: string;
  supplier_is_demo: number;
}

const PUBLIC = "p.status = 'approved' AND s.verification_status = 'verified'";

export function getSupplierByUserId(userId: string): SupplierRow | undefined {
  return db.prepare("SELECT * FROM suppliers WHERE user_id = ?").get(userId) as SupplierRow | undefined;
}

export function getVerifiedSupplierBySlug(slug: string): SupplierRow | undefined {
  return db.prepare("SELECT * FROM suppliers WHERE slug = ? AND verification_status = 'verified'").get(slug) as SupplierRow | undefined;
}

export function listVerifiedSuppliers(): (SupplierRow & { product_count: number })[] {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'approved') AS product_count
       FROM suppliers s WHERE s.verification_status = 'verified' ORDER BY s.is_demo ASC, s.business_name`,
    )
    .all() as (SupplierRow & { product_count: number })[];
}

export function listCatalogue(filter: { category?: ProductCategory | null; q?: string | null; supplierId?: string | null } = {}): CatalogueItem[] {
  const where = [PUBLIC];
  const args: unknown[] = [];
  if (filter.category) {
    where.push("p.category = ?");
    args.push(filter.category);
  }
  if (filter.supplierId) {
    where.push("p.supplier_id = ?");
    args.push(filter.supplierId);
  }
  if (filter.q) {
    where.push("(p.brand LIKE ? OR p.model LIKE ? OR p.title LIKE ?)");
    const like = `%${filter.q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like);
  }
  return db
    .prepare(
      `SELECT p.*, s.business_name AS supplier_name, s.slug AS supplier_slug, s.is_demo AS supplier_is_demo
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.is_demo ASC, p.category, p.brand, p.model LIMIT 200`,
    )
    .all(...args) as CatalogueItem[];
}

export function getPublicProduct(id: string): CatalogueItem | undefined {
  return db
    .prepare(
      `SELECT p.*, s.business_name AS supplier_name, s.slug AS supplier_slug, s.is_demo AS supplier_is_demo
       FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ? AND ${PUBLIC}`,
    )
    .get(id) as CatalogueItem | undefined;
}

export function getSupplierProduct(id: string, supplierId: string): ProductRow | undefined {
  return db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(id, supplierId) as ProductRow | undefined;
}

export function getOrderForCustomer(id: string, userId: string): OrderRow | undefined {
  return db.prepare("SELECT * FROM orders WHERE id = ? AND customer_user_id = ?").get(id, userId) as OrderRow | undefined;
}

export function getOrderForSupplier(id: string, supplierId: string): OrderRow | undefined {
  return db.prepare("SELECT * FROM orders WHERE id = ? AND supplier_id = ?").get(id, supplierId) as OrderRow | undefined;
}

export function orderItems(orderId: string): OrderItemRow[] {
  return db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY title").all(orderId) as OrderItemRow[];
}

export function orderEvents(orderId: string) {
  return db
    .prepare("SELECT actor_role, from_status, to_status, note, created_at FROM order_events WHERE order_id = ? ORDER BY created_at ASC")
    .all(orderId) as { actor_role: string; from_status: string | null; to_status: string; note: string | null; created_at: string }[];
}

export function getPriceRequestForInstaller(id: string, installerId: string): PriceRequestRow | undefined {
  return db.prepare("SELECT * FROM price_requests WHERE id = ? AND installer_id = ?").get(id, installerId) as PriceRequestRow | undefined;
}

export function getPriceRequestForSupplier(id: string, supplierId: string): PriceRequestRow | undefined {
  return db.prepare("SELECT * FROM price_requests WHERE id = ? AND supplier_id = ?").get(id, supplierId) as PriceRequestRow | undefined;
}

export function parseAreas(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}
