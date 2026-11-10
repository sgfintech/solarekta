import Link from "next/link";
import { Battery, Bolt, Inverter, Panel, Shield } from "@/components/icons";
import { CATEGORY_SINGULAR, parseSpecs, specSummary, STOCK_LABEL } from "@/lib/marketplace";
import { peso } from "@/lib/format";
import type { ProductCategory } from "@/lib/types";

export function CategoryIcon({ category, className = "h-6 w-6" }: { category: ProductCategory; className?: string }) {
  if (category === "panel") return <Panel className={className} />;
  if (category === "inverter") return <Inverter className={className} />;
  if (category === "battery") return <Battery className={className} />;
  return <Bolt className={className} />;
}

export function DemoBadge() {
  return (
    <span className="badge badge-neutral" title="Sample listing for demonstration; not a real company or offer">
      Demo listing
    </span>
  );
}

export interface ProductCardData {
  id: string;
  category: ProductCategory;
  brand: string;
  model: string;
  title: string;
  specs_json: string;
  warranty_product_years: number | null;
  warranty_performance_years: number | null;
  warranty_backer: string | null;
  price_php: number | null;
  unit: string;
  stock_status: "in_stock" | "made_to_order" | "out_of_stock";
  supplier_name: string;
  supplier_is_demo: number;
}

export function ProductCard({ product, href, showPrice = true }: { product: ProductCardData; href: string; showPrice?: boolean }) {
  const chips = specSummary(product.category, parseSpecs(product.specs_json));
  return (
    <Link href={href} className="card card-link flex h-full flex-col p-5 no-underline">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint text-forest">
          <CategoryIcon category={product.category} />
        </span>
        <span className={`badge ${product.stock_status === "in_stock" ? "badge-good" : product.stock_status === "out_of_stock" ? "badge-bad" : "badge-warn"}`}>
          {STOCK_LABEL[product.stock_status]}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold text-muted">{CATEGORY_SINGULAR[product.category]} · {product.brand}</p>
      <h3 className="mt-0.5 text-lg leading-snug text-forest-deep">{product.title}</h3>
      <p className="text-xs text-muted">Model {product.model}</p>
      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">{chip}</span>
          ))}
        </div>
      ) : null}
      {product.warranty_product_years ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
          <Shield className="h-3.5 w-3.5 text-leaf" />
          {product.warranty_product_years}-yr product warranty
          {product.warranty_performance_years ? `, ${product.warranty_performance_years}-yr performance` : ""}
        </p>
      ) : null}
      <div className="flex-1" />
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-line-soft pt-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{product.supplier_name}</p>
          {product.supplier_is_demo ? <DemoBadge /> : null}
        </div>
        {showPrice ? (
          <p className="shrink-0 text-right font-semibold text-ink">
            {product.price_php != null ? (
              <>
                {peso(product.price_php)} <span className="text-xs font-normal text-muted">/ {product.unit}</span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted">Price on request</span>
            )}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
