import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/marketplace/product-form";

export const metadata = { title: "List a product" };

export default async function NewProductPage() {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  return (
    <>
      <PageHeader eyebrow="Catalogue" title="List a product" description="An admin reviews every listing, including warranty and certification claims, before it goes live." />
      {supplier ? (
        <div className="max-w-3xl"><ProductForm /></div>
      ) : (
        <p className="card card-pad text-sm text-ink-soft">Save your <Link href="/supplier/profile" className="font-semibold text-forest underline">company profile</Link> first.</p>
      )}
    </>
  );
}
