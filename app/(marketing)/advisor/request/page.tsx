import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getPublicProduct } from "@/lib/marketplace-data";
import { catalogueRecord } from "@/lib/advisor/data";
import { toRecordView } from "@/lib/advisor/view";
import { RecordCard } from "@/components/advisor/result-cards";
import { RequestQuoteForm } from "@/components/advisor/request-quote-form";

export const metadata: Metadata = { title: "Request a supplier quotation" };

export default async function RequestQuotePage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: productId = "" } = await searchParams;
  const product = /^[0-9a-f-]{36}$/i.test(productId) ? getPublicProduct(productId) : undefined;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/advisor/request?product=${productId}`)}`);

  return (
    <div className="shell max-w-3xl py-8 md:py-12">
      <Link href="/advisor" className="link-action text-sm">← Ask Solar AI</Link>
      <h1 className="display-md mt-3 text-forest-deep">Request a supplier quotation</h1>
      {!product ? (
        <p className="card card-pad mt-6 text-ink-soft">This product is not available. <Link href="/equipment" className="text-forest underline">Browse equipment</Link></p>
      ) : user.role !== "customer" ? (
        <div className="card card-pad mt-6 text-ink-soft">
          {user.role === "installer" ? (
            <p>Installers request trade prices privately. <Link href={`/installer/equipment/${product.id}`} className="text-forest underline">Request a trade price</Link></p>
          ) : (
            <p>Quotation requests are for homeowner and business accounts.</p>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <RecordCard record={toRecordView(catalogueRecord(product))} />
          {product.supplier_is_demo ? (
            <p className="rounded-xl border border-[#f1d28a] bg-[#fdf3d7] px-4 py-2 text-sm text-[#5f4300]">This is a sample supplier for demonstration. Requests are recorded but not answered by a real business.</p>
          ) : null}
          <RequestQuoteForm productId={product.id} productLabel={`${product.brand} ${product.model} — ${product.title}`} supplierName={product.supplier_name} defaultName={user.name} defaultPhone={user.phone ?? ""} email={user.email} />
        </div>
      )}
    </div>
  );
}
