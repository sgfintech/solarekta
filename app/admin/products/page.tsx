import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORY_SINGULAR, parseSpecs, specSummary, STOCK_LABEL } from "@/lib/marketplace";
import { decideProductAction } from "@/app/actions/admin";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { Check } from "@/components/icons";
import { peso, shortDate } from "@/lib/format";
import type { ProductRow } from "@/lib/types";

export const metadata = { title: "Product review" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ done?: string; all?: string }> }) {
  await requireUser(["admin"]);
  const query = await searchParams;
  const rows = db
    .prepare(
      `SELECT p.*, s.business_name, s.verification_status AS supplier_status FROM products p JOIN suppliers s ON s.id = p.supplier_id
       ${query.all ? "" : "WHERE p.status = 'pending'"} ORDER BY p.updated_at ASC LIMIT 100`,
    )
    .all() as (ProductRow & { business_name: string; supplier_status: string })[];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Product review"
        description="Check specifications, warranty claims and certificates against the datasheet before a product goes live."
        actions={<a href={query.all ? "/admin/products" : "/admin/products?all=1"} className="btn btn-ghost btn-sm">{query.all ? "Show pending only" : "Show all products"}</a>}
      />
      {query.done ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Decision recorded.</p> : null}
      {rows.length === 0 ? <p className="card card-pad text-sm text-muted">No products waiting for review.</p> : null}
      <div className="space-y-4">
        {rows.map((p) => (
          <article key={p.id} className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg text-forest-deep">{p.brand} {p.model}</h2>
                <p className="text-sm text-muted">{CATEGORY_SINGULAR[p.category]} · {p.business_name} ({p.supplier_status}) · {shortDate(p.updated_at)}</p>
              </div>
              <span className="badge">{p.status}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Title</dt><dd>{p.title}</dd></div>
              <div><dt className="text-xs text-muted">Specs</dt><dd>{specSummary(p.category, parseSpecs(p.specs_json)).join(", ") || "None entered"}</dd></div>
              <div><dt className="text-xs text-muted">Warranty</dt><dd>{p.warranty_product_years ?? "—"} yr product / {p.warranty_performance_years ?? "—"} yr performance · backer: {p.warranty_backer || "not stated"}</dd></div>
              <div><dt className="text-xs text-muted">Certifications claimed</dt><dd>{p.certifications || "None"}</dd></div>
              <div><dt className="text-xs text-muted">Price / stock</dt><dd>{p.price_php != null ? peso(p.price_php) : "On request"} · {STOCK_LABEL[p.stock_status]}</dd></div>
              <div><dt className="text-xs text-muted">Datasheet</dt><dd>{p.datasheet_file_id ? <a href={`/api/files/${p.datasheet_file_id}`} target="_blank" rel="noreferrer" className="text-forest underline">Open PDF</a> : "Not uploaded"}</dd></div>
            </dl>
            {p.supplier_status !== "verified" ? <p className="mt-3 text-xs text-[#6b4708]">The supplier is not verified yet, so this product stays hidden even if approved.</p> : null}
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm action={decideProductAction} submitLabel="Record decision" className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <input type="hidden" name="productId" value={p.id} />
                <div>
                  <label htmlFor={`a-${p.id}`} className="label">Decision</label>
                  <select id={`a-${p.id}`} name="action" className="select"><option value="approve">Approve</option><option value="reject">Request changes</option></select>
                </div>
                <div>
                  <label htmlFor={`n-${p.id}`} className="label">Note to supplier</label>
                  <input id={`n-${p.id}`} name="notes" className="input" placeholder="Required when requesting changes" />
                </div>
              </ActionForm>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
