import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCatalogue } from "@/lib/marketplace-data";
import { CATEGORY_LABEL } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/marketplace/product-card";
import type { ProductCategory } from "@/lib/types";

export const metadata = { title: "Equipment catalogue" };
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ProductCategory[];

export default async function InstallerEquipmentPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireUser(["installer"]);
  const query = await searchParams;
  const category = CATEGORIES.includes(query.category as ProductCategory) ? (query.category as ProductCategory) : null;
  const products = listCatalogue({ category });
  return (
    <>
      <PageHeader
        eyebrow="Sourcing"
        title="Equipment catalogue"
        description="Reviewed products from verified suppliers. Request private trade pricing, and link products in your quotes so customers see verified models and warranty backers."
        actions={<Link href="/installer/price-requests" className="btn btn-secondary btn-sm">My price requests</Link>}
      />
      <nav aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
        <Link href="/installer/equipment" className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${!category ? "border-forest bg-forest text-white" : "border-line bg-white text-ink-soft"}`}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/installer/equipment?category=${c}`} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${category === c ? "border-forest bg-forest text-white" : "border-line bg-white text-ink-soft"}`}>{CATEGORY_LABEL[c]}</Link>
        ))}
      </nav>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No approved products in this category yet.</p>
      ) : (
        <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="sr-only">Listings</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => <ProductCard key={p.id} product={p} href={`/installer/equipment/${p.id}`} />)}
        </div>
        </section>
      )}
    </>
  );
}
