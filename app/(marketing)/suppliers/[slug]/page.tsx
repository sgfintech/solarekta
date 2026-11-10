import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getVerifiedSupplierBySlug, listCatalogue, parseAreas } from "@/lib/marketplace-data";
import { CATEGORY_SINGULAR, SUPPLIER_TYPE_LABEL } from "@/lib/marketplace";
import { DemoBadge, ProductCard } from "@/components/marketplace/product-card";
import { OrderForm } from "@/components/marketplace/order-form";
import { Shield } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = getVerifiedSupplierBySlug(slug);
  return { title: s ? s.business_name : "Supplier" };
}

export default async function SupplierStorefront({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ add?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const supplier = getVerifiedSupplierBySlug(slug);
  if (!supplier) notFound();
  const products = listCatalogue({ supplierId: supplier.id });
  const user = await getSessionUser();
  const installers = db.prepare("SELECT id, business_name AS name FROM installers WHERE verification_status = 'verified' ORDER BY business_name").all() as { id: string; name: string }[];
  const site = user?.role === "customer"
    ? (db.prepare("SELECT city, province FROM sites WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(user.id) as { city: string; province: string | null } | undefined)
    : undefined;
  const initial: Record<string, number> = {};
  if (query.add && products.some((p) => p.id === query.add)) initial[query.add] = 1;

  return (
    <div className="shell py-10 md:py-14">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-leaf"><Shield className="h-4 w-4" /> Verified supplier</p>
          <h1 className="display-lg mt-1 text-forest-deep">{supplier.business_name}</h1>
          <p className="mt-2 text-sm text-muted">{SUPPLIER_TYPE_LABEL[supplier.supplier_type]}{supplier.years_in_business != null ? ` · ${supplier.years_in_business} years in business` : ""} · Delivers to {parseAreas(supplier.delivery_areas_json).join(", ")}</p>
          {supplier.about ? <p className="mt-3 text-ink-soft">{supplier.about}</p> : null}
          {supplier.is_demo ? <div className="mt-3"><DemoBadge /> <span className="text-xs text-muted">Sample company for demonstration. Orders here are not fulfilled.</span></div> : null}
        </div>
        {products.length ? <a href="#order" className="btn btn-primary">Order from this supplier</a> : null}
      </div>

      <section className="mt-8">
        <h2 className="text-xl text-forest-deep">Products</h2>
        {products.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No approved products yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => <ProductCard key={p.id} product={p} href={`/equipment/${p.id}`} />)}
          </div>
        )}
      </section>

      {products.length ? (
        <section id="order" className="mt-12 scroll-mt-24 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[1.5rem] border border-line bg-white p-5 shadow-soft sm:p-7">
            <h2 className="text-2xl text-forest-deep">Request an order</h2>
            <p className="mt-1 text-sm text-ink-soft">The supplier confirms stock, total and delivery before you pay them directly.</p>
            <div className="mt-5">
              {user?.role === "customer" ? (
                <OrderForm
                  supplierId={supplier.id}
                  initial={initial}
                  installers={installers}
                  defaults={{ name: user.name, phone: user.phone ?? "", city: site?.city ?? "", province: site?.province ?? "" }}
                  items={products.map((p) => ({
                    id: p.id,
                    label: `${p.brand} ${p.model}`,
                    sub: CATEGORY_SINGULAR[p.category],
                    pricePhp: p.price_php,
                    unit: p.unit,
                    outOfStock: p.stock_status === "out_of_stock",
                  }))}
                />
              ) : user ? (
                <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">Orders are placed by homeowner and business accounts. {user.role === "installer" ? <>Installers can <Link href="/installer/equipment" className="font-semibold text-forest underline">request trade prices</Link> instead.</> : null}</p>
              ) : (
                <div className="rounded-xl bg-paper px-4 py-4 text-sm text-ink-soft">
                  <p>Log in or create a free account to send an order request. Your selection is not saved yet.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/login?next=${encodeURIComponent(`/suppliers/${supplier.slug}${query.add ? `?add=${query.add}` : ""}#order`)}`} className="btn btn-primary btn-sm">Log in</Link>
                    <Link href="/signup" className="btn btn-secondary btn-sm">Create account</Link>
                  </div>
                </div>
              )}
            </div>
          </div>
          <aside className="space-y-3 text-sm text-ink-soft">
            <div className="card card-pad">
              <h3 className="font-semibold text-ink">How ordering works</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>You send a request with quantities and delivery city.</li>
                <li>The supplier confirms the total, delivery fee and date.</li>
                <li>You pay the supplier directly and get an official receipt.</li>
                <li>The supplier ships; you confirm delivery here.</li>
              </ol>
            </div>
            <p className="rounded-2xl border border-[#f5d68a] bg-sun-soft p-4 text-[#6b4708]">Buying equipment yourself? A licensed installer still has to design, install and sign off a grid-connected system. Not sure what to buy? <Link href="/estimate" className="font-semibold underline">Get an estimate</Link> and compare installer quotes first.</p>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
