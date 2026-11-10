import Link from "next/link";
import type { Metadata } from "next";
import { listCatalogue, listVerifiedSuppliers } from "@/lib/marketplace-data";
import { CATEGORY_LABEL } from "@/lib/marketplace";
import { ProductCard } from "@/components/marketplace/product-card";
import { Shield } from "@/components/icons";
import type { ProductCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Solar equipment from verified suppliers",
  description: "Panels, inverters and batteries listed by reviewed Philippine suppliers, with warranty and certification details.",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ProductCategory[];

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const query = await searchParams;
  const category = CATEGORIES.includes(query.category as ProductCategory) ? (query.category as ProductCategory) : null;
  const q = (query.q ?? "").trim().slice(0, 60) || null;
  const products = listCatalogue({ category, q });
  const suppliers = listVerifiedSuppliers();

  return (
    <div className="shell py-10 md:py-14">
      <div className="max-w-3xl">
        <p className="eyebrow">Equipment</p>
        <h1 className="display-lg mt-2 text-forest-deep">Know what goes on your roof</h1>
        <p className="mt-3 text-ink-soft">
          Panels, inverters and batteries from suppliers whose business documents we have reviewed. Each listing shows
          who backs the warranty in the Philippines. Order from a supplier directly, or ask your installer to quote with these products.
        </p>
      </div>

      <form className="mt-7 flex flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">Search brand or model</label>
        <input id="q" name="q" defaultValue={q ?? ""} className="input sm:max-w-sm" placeholder="Search brand or model" />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <button type="submit" className="btn btn-secondary">Search</button>
      </form>

      <nav aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
        <Link href={q ? `/equipment?q=${encodeURIComponent(q)}` : "/equipment"} aria-current={!category ? "page" : undefined} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${!category ? "border-forest bg-forest text-white" : "border-line bg-white text-ink-soft hover:border-forest/40"}`}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/equipment?category=${c}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={category === c ? "page" : undefined} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${category === c ? "border-forest bg-forest text-white" : "border-line bg-white text-ink-soft hover:border-forest/40"}`}>
            {CATEGORY_LABEL[c]}
          </Link>
        ))}
      </nav>

      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
          <p className="font-semibold text-ink">No approved products match{q ? ` “${q}”` : ""}.</p>
          <p className="mt-1 text-sm text-ink-soft">Try another category or search. New listings appear after review.</p>
        </div>
      ) : (
        <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="sr-only">Listings</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => <ProductCard key={p.id} product={p} href={`/equipment/${p.id}`} />)}
        </div>
        </section>
      )}

      <section className="mt-14 grid gap-6 rounded-[1.5rem] border border-line bg-white p-6 md:grid-cols-[1fr_1.4fr] md:p-8">
        <div>
          <h2 className="text-2xl text-forest-deep">Verified suppliers</h2>
          <p className="mt-2 text-sm text-ink-soft">“Verified” means an admin reviewed business registration and distributor documents. It is not an endorsement of product quality.</p>
          <Link href="/suppliers" className="btn btn-secondary btn-sm mt-4">All suppliers</Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {suppliers.slice(0, 6).map((s) => (
            <li key={s.id}>
              <Link href={`/suppliers/${s.slug}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-3 text-sm hover:border-forest/40">
                <span className="flex items-center gap-2 font-semibold text-ink"><Shield className="h-4 w-4 text-leaf" /> {s.business_name}</span>
                <span className="text-xs text-muted">{s.product_count} products</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
