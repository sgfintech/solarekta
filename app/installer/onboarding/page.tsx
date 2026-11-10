import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { InstallerProfileForm } from "@/components/installer/installer-profile-form";
import { Alert, Check, Shield } from "@/components/icons";

export const metadata = { title: "Installer onboarding" };

export default async function InstallerOnboardingPage() {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);
  if (installer) redirect("/installer/profile");

  return (
    <>
      <PageHeader
        eyebrow="Onboarding"
        title="Apply as a SOLARekta installer"
        description="Tell customers who you are and where you work. An admin reviews your business details and documents before any lead is shared."
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="badge badge-warn">Step 1 · Business details</span>
            <span className="badge">Step 2 · Documents</span>
            <span className="badge">Step 3 · Manual review</span>
          </div>
          <div className="card card-pad">
            <h2 className="text-xl text-forest-deep">Business details</h2>
            <p className="mt-1 text-sm text-ink-soft">
              This information appears to customers when they choose installers. Be specific about the areas you
              actually serve.
            </p>
            <div className="mt-5">
              <InstallerProfileForm />
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-forest" />
              <h2 className="text-lg text-forest-deep">How verification works</h2>
            </div>
            <ol className="mt-3 space-y-3 text-sm text-ink-soft">
              <li className="flex gap-2">
                <span className="font-semibold text-forest">1.</span>
                <span>Submit your business profile. It is saved as <strong>pending</strong>, never auto-approved.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-forest">2.</span>
                <span>Upload your SEC/DTI registration, mayor&apos;s permit, licence and insurance where available.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-forest">3.</span>
                <span>A SOLARekta admin reviews the documents and records a decision with notes.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-forest">4.</span>
                <span>Only verified installers receive opted-in leads and may submit quotes.</span>
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Verification checks document completeness. It is not an endorsement of workmanship, pricing or savings.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-[#ffffff] p-4 text-sm text-ink-soft">
            <p className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              You keep your own pricing. SOLARekta does not set prices, take commissions on quotes, or guarantee lead
              volume during the pilot.
            </p>
          </div>

          <div className="rounded-2xl border border-[#f5d68a] bg-sun-soft/60 p-4 text-xs leading-relaxed text-[#6b4708]">
            <p className="flex gap-2">
              <Alert className="mt-0.5 h-4 w-4 shrink-0" />
              Do not upload real customer bills or unnecessary personal data. Installer documents are stored privately and
              used only for verification.
            </p>
          </div>

          <p className="text-xs text-muted">
            Already submitted? <Link href="/installer/profile" className="font-semibold text-forest underline">Open your profile</Link>.
          </p>
        </aside>
      </div>
    </>
  );
}
