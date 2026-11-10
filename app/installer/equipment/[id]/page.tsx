import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { getPublicProduct } from "@/lib/marketplace-data";
import { CATEGORY_SINGULAR, parseSpecs, specSummary, STOCK_LABEL } from "@/lib/marketplace";
import { createPriceRequestAction } from "@/app/actions/marketplace";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { DemoBadge } from "@/components/marketplace/product-card";
import { peso } from "@/lib/format";

export const metadata = { title: "Product" };

export default async function InstallerProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);
  const { id } = await params;
  const product = getPublicProduct(id);
  if (!product) notFound();
  const leads = installer
    ? (db.prepare(
        `SELECT qr.id, s.city, qr.created_at FROM quote_invites qi JOIN quote_requests qr ON qr.id = qi.quote_request_id JOIN sites s ON s.id = qr.site_id
         WHERE qi.installer_id = ? AND qr.status IN ('open','matched') ORDER BY qr.created_at DESC LIMIT 20`,
      ).all(installer.id) as { id: string; city: string; created_at: string }[])
    : [];
  const verified = installer?.verification_status === "verified";

  return (
    <>
      <PageHeader
        eyebrow={`${CATEGORY_SINGULAR[product.category]} · ${product.supplier_name}`}
        title={`${product.brand} ${product.model}`}
        description={product.title}
        actions={<Link href="/installer/equipment" className="btn btn-ghost btn-sm">Catalogue</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card card-pad">
          {product.supplier_is_demo ? <DemoBadge /> : null}
          <dl className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Specs", specSummary(product.category, parseSpecs(product.specs_json)).join(", ") || "See datasheet"],
              ["Product / performance warranty", `${product.warranty_product_years ?? "—"} / ${product.warranty_performance_years ?? "—"} years`],
              ["Warranty honoured by", product.warranty_backer || "Not stated"],
              ["Certifications (declared)", product.certifications || "Not stated"],
              ["Availability", `${STOCK_LABEL[product.stock_status]}${product.lead_time_days != null ? `, ${product.lead_time_days} days` : ""}`],
              ["Public buyer price", product.price_php != null ? peso(product.price_php) : "On request"],
            ].map(([label, value]) => (
              <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>
            ))}
          </dl>
          {product.datasheet_file_id ? <a href={`/api/files/${product.datasheet_file_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-4">Datasheet (PDF)</a> : null}
          <p className="mt-4 text-xs text-muted">Link this product in a quote using the equipment fields on the lead page.</p>
        </section>
        <section className="card card-pad">
          <h2 className="text-xl text-forest-deep">Request a trade price</h2>
          <p className="mt-1 text-sm text-ink-soft">Only you and the supplier see the price they send. Customers never see trade pricing.</p>
          {verified ? (
            <div className="mt-4">
              <ActionForm action={createPriceRequestAction} submitLabel="Send price request" pendingLabel="Sending…">
                <input type="hidden" name="productId" value={product.id} />
                <div><label htmlFor="quantity" className="label">Quantity ({product.unit})</label><input id="quantity" name="quantity" type="number" min={1} className="input" required /></div>
                <div>
                  <label htmlFor="quoteRequestId" className="label">For a lead <span className="font-normal text-muted">(optional)</span></label>
                  <select id="quoteRequestId" name="quoteRequestId" className="select" defaultValue="">
                    <option value="">Not for a specific lead</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.city} lead</option>)}
                  </select>
                  <p className="help">Customer names and contact details are never shared with suppliers.</p>
                </div>
                <div><label htmlFor="message" className="label">Message <span className="font-normal text-muted">(optional)</span></label><textarea id="message" name="message" className="textarea" style={{ minHeight: "4.5rem" }} placeholder="Delivery area, timing, pallet quantities…" /></div>
              </ActionForm>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">Price requests open once your installer account is verified.</p>
          )}
        </section>
      </div>
    </>
  );
}
