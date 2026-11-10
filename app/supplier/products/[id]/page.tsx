import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId, getSupplierProduct } from "@/lib/marketplace-data";
import { parseSpecs } from "@/lib/marketplace";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/marketplace/product-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  if (!supplier) notFound();
  const { id } = await params;
  const product = getSupplierProduct(id, supplier.id);
  if (!product) notFound();
  return (
    <>
      <PageHeader eyebrow="Catalogue" title={`${product.brand} ${product.model}`} description={product.status === "rejected" && product.review_notes ? `Reviewer note: ${product.review_notes}` : "Update the listing. Price, stock and lead time changes keep it live."} />
      <div className="max-w-3xl"><ProductForm product={product} specs={parseSpecs(product.specs_json)} /></div>
    </>
  );
}
