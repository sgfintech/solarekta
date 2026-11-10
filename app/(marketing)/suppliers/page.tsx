import Link from "next/link";
import type { Metadata } from "next";
import { listVerifiedSuppliers, parseAreas } from "@/lib/marketplace-data";
import { SUPPLIER_TYPE_LABEL } from "@/lib/marketplace";
import { DemoBadge } from "@/components/marketplace/product-card";
import { ArrowRight, Check, Shield } from "@/components/icons";

export const metadata: Metadata = {
  title: "Solar equipment suppliers",
  description: "Verified Philippine solar equipment suppliers on SOLARekta, and how suppliers can join.",
};

export default function SuppliersPage() {
  const suppliers = listVerifiedSuppliers();
  return (
    <>
      <section className="border-b border-line bg-forest-deep text-white">
        <div className="shell grid gap-8 py-12 md:grid-cols-[1.2fr_1fr] md:py-16">
          <div>
            <p className="text-sm font-semibold text-[#cdeab5]">For suppliers and distributors</p>
            <h1 className="display-lg mt-2">Put your equipment where buying decisions happen</h1>
            <p className="mt-4 max-w-xl text-[#d6ead0]">
              Homeowners compare quotes here and installers source here. List reviewed products, receive order requests
              from buyers, and answer private trade-price requests from verified installers.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup?role=supplier" className="btn btn-sun">Apply as a supplier <ArrowRight /></Link>
              <Link href="/equipment" className="btn border-white/40 text-white hover:bg-white/10">Browse the catalogue</Link>
            </div>
          </div>
          <ul className="space-y-3 self-center text-sm text-[#e4f2d8]">
            {[
              "Company and every product reviewed by an admin before going live",
              "Your buyer prices are public; installer trade prices stay private",
              "You confirm every order and arrange payment directly with the buyer",
              "Warranty backer and certifications shown on every listing",
            ].map((t) => <li key={t} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sun" /> {t}</li>)}
          </ul>
        </div>
      </section>
      <section className="shell py-12">
        <h2 className="text-2xl text-forest-deep">Verified suppliers</h2>
        <p className="mt-1 text-sm text-ink-soft">Verified means business registration and distributor documents were reviewed. It is not an endorsement.</p>
        {suppliers.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-ink-soft">No verified suppliers yet.</p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {suppliers.map((s) => (
              <Link key={s.id} href={`/suppliers/${s.slug}`} className="card card-link p-5 no-underline">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg text-forest-deep">{s.business_name}</h3>
                    <p className="text-sm text-muted">{SUPPLIER_TYPE_LABEL[s.supplier_type]} · {s.product_count} approved product{s.product_count === 1 ? "" : "s"}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-leaf"><Shield className="h-4 w-4" /> Verified</span>
                </div>
                {s.about ? <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{s.about}</p> : null}
                <p className="mt-2 text-xs text-muted">Delivers to {parseAreas(s.delivery_areas_json).slice(0, 5).join(", ")}</p>
                {s.is_demo ? <div className="mt-2"><DemoBadge /></div> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
