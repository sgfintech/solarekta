import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SiteForm } from "@/components/forms/site-form";

export const metadata = { title: "Add your home or business" };

export default async function NewSitePage() {
  await requireUser(["customer"]);
  return (
    <>
      <PageHeader
        eyebrow="New site"
        title="Tell us about the property"
        description="Use a realistic usable roof area. We will flag when the roof — not the budget — is the limiting factor."
        actions={<Link href="/app/sites" className="btn btn-ghost">Back to sites</Link>}
      />
      <div className="max-w-3xl">
        <SiteForm />
      </div>
    </>
  );
}
