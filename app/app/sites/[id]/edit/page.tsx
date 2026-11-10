import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { SiteForm } from "@/components/forms/site-form";

export const metadata = { title: "Edit site" };

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const site = getSite(id, user.id);
  if (!site) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Edit site"
        title={site.name}
        description="Changes apply to future assessments. Existing assessments keep the inputs and model version that produced them."
        actions={<Link href={`/app/sites/${site.id}`} className="btn btn-ghost">Back to site</Link>}
      />
      <div className="max-w-3xl">
        <SiteForm site={site} />
      </div>
    </>
  );
}
