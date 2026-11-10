import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { aiStatus } from "@/lib/ai/provider";
import { PageHeader } from "@/components/page-header";
import { BillUploadForm } from "@/components/forms/bill-upload-form";
import { ManualBillForm } from "@/components/forms/manual-bill-form";
import { Shield } from "@/components/icons";

export const metadata = { title: "Add a bill" };

export default async function NewBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const site = getSite(id, user.id);
  if (!site) notFound();
  const ai = aiStatus();

  return (
    <>
      <PageHeader
        eyebrow={site.name}
        title="Add an electricity bill"
        description="Start from a real billing month. Enter values manually or upload a bill for optional AI-assisted extraction — you review everything before it is used."
        actions={<Link href={`/app/sites/${site.id}`} className="btn btn-ghost">Back to site</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="text-xl text-forest-deep">Upload a bill</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Keep the document for your records. AI suggestions are drafts, never confirmed values.
          </p>
          <div className="mt-5">
            <BillUploadForm siteId={site.id} aiEnabled={ai.enabled} aiReason={ai.reason} />
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="text-xl text-forest-deep">Enter values manually</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Works every time, with or without AI. This is the fastest path if you already have the bill in front of you.
          </p>
          <div className="mt-5">
            <ManualBillForm site={site} />
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-[#ffffff] p-4 text-sm text-ink-soft">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
        <p>
          Bill documents are private to your account, kept outside the public web root and served only through an
          authenticated route. Installers see a consumption summary, never the document itself. You can delete a bill
          and its file at any time.
        </p>
      </div>
    </>
  );
}
