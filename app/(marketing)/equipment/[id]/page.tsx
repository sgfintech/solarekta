import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getPublicProduct } from "@/lib/marketplace-data";
import { CATEGORY_LABEL, CATEGORY_SINGULAR, parseSpecs, specSummary, STOCK_LABEL } from "@/lib/marketplace";
import { CategoryIcon, DemoBadge } from "@/components/marketplace/product-card";
import { ArrowRight, Check, Shield } from "@/components/icons";
import { peso } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getPublicProduct(id);
  return { title: p ? `${p.brand} ${p.model}` : "Product" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getPublicProduct(id);
  if (!product) notFound();
  const user = await getSessionUser();
  const specs = specSummary(product.category, parseSpecs(product.specs_json));

  return (
    <div className="shell max-w-5xl py-10 md:py-14">
      <Link href={`/equipment?category=${product.category}`} className="link-action text-sm">← {CATEGORY_LABEL[product.category]}</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-forest"><CategoryIcon category={product.category} className="h-8 w-8" /></span>
            <div>
              <p className="text-sm font-semibold text-muted">{product.brand} · Model {product.model}</p>
              {product.supplier_is_demo ? <DemoBadge /> : null}
            </div>
          </div>
          <h1 className="display-md mt-4 text-forest-deep">{product.title}</h1>
          {product.description ? <p className="mt-3 text-ink-soft">{product.description}</p> : null}
          {specs.length ? (
            <div className="mt-5 flex flex-wrap gap-2">{specs.map((s) => <span key={s} className="rounded-full bg-paper-deep px-3 py-1 text-sm font-medium text-ink-soft">{s}</span>)}</div>
          ) : null}
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["Product warranty", product.warranty_product_years ? `${product.warranty_product_years} years` : "Not stated"],
              ["Performance warranty", product.warranty_performance_years ? `${product.warranty_performance_years} years` : "Not stated"],
              ["Warranty honoured by", product.warranty_backer || "Not stated — ask the supplier"],
              ["Certifications (as declared)", product.certifications || "Not stated"],
              ["Availability", `${STOCK_LABEL[product.stock_status]}${product.lead_time_days != null ? `, about ${product.lead_time_days} days` : ""}`],
              ["Sold by", product.supplier_name],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-white p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 font-medium text-ink">{value}</dd></div>
            ))}
          </dl>
          {product.datasheet_file_id ? <a href={`/api/files/${product.datasheet_file_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-5">Open datasheet (PDF)</a> : null}
          <p className="mt-5 text-xs text-muted">Listing details come from the supplier and were reviewed by a SOLARekta admin against submitted documents. Always confirm the exact model on your installer’s written quote.</p>
        </div>
        <aside className="space-y-4">
          <div className="card card-pad">
            <p className="text-sm text-muted">Buyer price</p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">{product.price_php != null ? peso(product.price_php) : "On request"}</p>
            {product.price_php != null ? <p className="text-xs text-muted">per {product.unit}, before delivery. The supplier confirms the final total.</p> : null}
            {product.stock_status === "out_of_stock" ? (
              <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">Currently out of stock.</p>
            ) : user?.role === "customer" || !user ? (
              <Link href={`/suppliers/${product.supplier_slug}?add=${product.id}#order`} className="btn btn-primary mt-4 w-full">Order from supplier <ArrowRight /></Link>
            ) : user.role === "installer" ? (
              <Link href={`/installer/equipment/${product.id}`} className="btn btn-primary mt-4 w-full">Request trade price <ArrowRight /></Link>
            ) : null}
            <Link href={`/advisor?product=${product.id}`} className="btn btn-secondary mt-2 w-full">Check this price</Link>
            <ul className="mt-4 space-y-1.5 text-xs text-ink-soft">
              <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> The supplier confirms stock, total and delivery before you pay.</li>
              <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> SOLARekta does not take payments.</li>
              <li className="flex gap-1.5"><Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> Grid-connected systems must be installed by a licensed installer.</li>
            </ul>
          </div>
          <Link href={`/suppliers/${product.supplier_slug}`} className="card card-link block p-4 no-underline">
            <p className="text-xs text-muted">Supplier</p>
            <p className="font-semibold text-forest-deep">{product.supplier_name}</p>
            <p className="text-xs text-forest">See storefront →</p>
          </Link>
        </aside>
      </div>
    </div>
  );
}
