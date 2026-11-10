import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { archiveProductAction } from "@/app/actions/supplier";
import { CATEGORY_SINGULAR, STOCK_LABEL } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { ArrowRight, Check } from "@/components/icons";
import { peso, shortDate } from "@/lib/format";
import type { ProductRow } from "@/lib/types";

export const metadata = { title: "Products" };

const STATUS = {
  approved: ["Live", "good"],
  pending: ["In review", "warn"],
  rejected: ["Needs changes", "bad"],
  draft: ["Draft", "neutral"],
  archived: ["Archived", "neutral"],
} as const;

export default async function SupplierProductsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  const query = await searchParams;
  const products = supplier
    ? (db.prepare("SELECT * FROM products WHERE supplier_id = ? ORDER BY CASE status WHEN 'rejected' THEN 0 WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, updated_at DESC").all(supplier.id) as ProductRow[])
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Your products"
        description="Every listing is reviewed before buyers and installers see it. Keep stock and prices current."
        actions={supplier ? <Link href="/supplier/products/new" className="btn btn-primary">List a product <ArrowRight /></Link> : <Link href="/supplier/profile" className="btn btn-primary">Set up your profile</Link>}
      />
      {query.saved ? (
        <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> {query.saved === "live" ? "Saved. The product stays live." : "Saved and sent for review. We’ll notify you when it’s decided."}
        </p>
      ) : null}
      {products.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
          <h2 className="text-xl text-forest-deep">No products yet</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">List the panels, inverters and batteries you supply. Include warranty details and certifications so buyers can trust the listing.</p>
          {supplier ? <Link href="/supplier/products/new" className="btn btn-primary mt-5">List your first product</Link> : null}
        </div>
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <thead><tr><th>Product</th><th>Status</th><th>Availability</th><th className="text-right">Buyer price</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-semibold text-ink">{p.brand} {p.model}</p>
                    <p className="text-xs text-muted">{CATEGORY_SINGULAR[p.category]} · {p.title}</p>
                    {p.status === "rejected" && p.review_notes ? <p className="mt-1 text-xs text-clay">Reviewer: {p.review_notes}</p> : null}
                  </td>
                  <td><span className={`badge badge-${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span></td>
                  <td className="text-sm">{STOCK_LABEL[p.stock_status]}</td>
                  <td className="table-num text-right">{p.price_php != null ? peso(p.price_php) : <span className="text-muted">On request</span>}</td>
                  <td className="text-sm text-muted">{shortDate(p.updated_at)}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/supplier/products/${p.id}`} className="link-action mr-3 text-sm">Edit</Link>
                    <form action={archiveProductAction} className="inline">
                      <input type="hidden" name="productId" value={p.id} />
                      {p.status === "archived" ? <input type="hidden" name="restore" value="1" /> : null}
                      <button type="submit" className="link-action link-muted text-sm">{p.status === "archived" ? "Restore" : "Archive"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
