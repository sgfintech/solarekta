import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { listVerifiedInstallers } from "@/lib/data";
import { parseServiceAreas } from "@/lib/service-areas";
import { ArrowRight, Check, Shield, SunIcon } from "@/components/icons";

export const metadata = {
  title: "For installers",
  description:
    "Join the SOLARekta installer network: receive opted-in customer leads with a transparent solar assessment attached, and submit itemised quotes.",
};

export default async function InstallersDirectoryPage() {
  const user = await getSessionUser();
  const installers = listVerifiedInstallers();

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-forest text-[#ffffff]">
        <div className="pointer-events-none absolute inset-0 grain opacity-30" aria-hidden="true" />
        <div className="shell relative grid gap-10 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <p className="text-xs font-semibold text-sun">For installers</p>
            <h1 className="display-xl mt-4 text-[#ffffff]">
              Better-qualified leads, with the numbers already on the table.
            </h1>
            <p className="mt-5 max-w-xl text-[#d6ead0]">
              SOLARekta customers arrive with a real electricity bill, a transparent assessment and a clear request. You
              quote on the same fields every other installer uses — no cold outreach, no scraped contact lists.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {user ? (
                <Link href={user.role === "installer" ? "/installer" : "/app"} className="btn btn-sun">
                  Open your dashboard <ArrowRight />
                </Link>
              ) : (
                <>
                  <Link href="/signup?role=installer" className="btn btn-sun">
                    Apply as an installer <ArrowRight />
                  </Link>
                  <Link href="/login" className="btn border-white/40 text-white hover:bg-white/10">
                    Log in
                  </Link>
                </>
              )}
            </div>
            <p className="mt-4 text-xs text-[#b8d9a6]">
              Verification is manual and document-based. Participation does not guarantee lead volume, and SOLARekta does
              not guarantee customer savings.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:content-start">
            {[
              {
                icon: <Shield className="h-5 w-5 text-sun" />,
                title: "Manual verification",
                body: "Business registration, permits and licence details are reviewed by a human admin before leads unlock.",
              },
              {
                icon: <Check className="h-5 w-5 text-sun" />,
                title: "Consent-first contacts",
                body: "Customer contact details appear only when they opt in for a specific request. Bills and full addresses stay private.",
              },
              {
                icon: <SunIcon className="h-5 w-5 text-sun" />,
                title: "Assessment attached",
                body: "Each lead includes the customer's model version, scenarios, tariff and roof facts — plus every assumption.",
              },
              {
                icon: <ArrowRight className="h-5 w-5 text-sun" />,
                title: "Your price stands",
                body: "You set the price, capacity, warranty and exclusions. SOLARekta never edits your quote or invents a savings promise.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-[#3d6b54] bg-[#0f4633] p-5">
                {item.icon}
                <h2 className="mt-3 text-lg text-[#ffffff]">{item.title}</h2>
                <p className="mt-1.5 text-sm text-[#d6ead0]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-14 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Verified network</p>
            <h2 className="display-md mt-2 text-forest-deep">Installers in the pilot</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              These businesses have submitted details for manual review. Listing is not an endorsement of workmanship,
              pricing or savings. Always check licences, insurance and contracts directly.
            </p>
          </div>
          <Link href="/signup?role=installer" className="btn btn-primary btn-sm">
            Join the network
          </Link>
        </div>

        {installers.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-line bg-[#ffffff] px-6 py-10 text-center">
            <h3 className="text-xl text-forest-deep">No verified installers published yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">
              The pilot is onboarding its first installer businesses. Applications are reviewed manually; nothing is
              auto-approved or fabricated.
            </p>
            <Link href="/signup?role=installer" className="btn btn-secondary btn-sm mt-5">
              Apply for review
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {installers.map((installer) => {
              const areas = parseServiceAreas(installer.service_areas_json);
              return (
                <article key={installer.id} className="card card-pad flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg text-forest-deep">{installer.business_name}</h3>
                    <span className="badge badge-good">Verified</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {areas.length > 0 ? areas.slice(0, 4).join(" · ") : "Service areas on request"}
                    {installer.years_experience != null ? ` · ${installer.years_experience} yrs` : ""}
                  </p>
                  {installer.about ? <p className="mt-3 line-clamp-4 text-sm text-ink-soft">{installer.about}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {installer.website ? (
                      <a
                        href={installer.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn btn-secondary btn-sm"
                      >
                        Website
                      </a>
                    ) : null}
                    <Link href={user ? "/app" : "/signup"} className="btn btn-ghost btn-sm">
                      Request a quote <ArrowRight />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-t border-line bg-paper-deep/60">
        <div className="shell grid gap-8 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="display-md text-forest-deep">How the pilot works</h2>
            <ol className="mt-5 space-y-4 text-sm text-ink-soft">
              {[
                ["Apply", "Create an installer account, add your business details and service areas, then upload registration and permit documents."],
                ["Get reviewed", "An admin checks the documents and records a decision with notes. You are notified either way."],
                ["Quote opted-in leads", "When a customer selects you, review the attached assessment and submit an itemised quote."],
                ["Keep it honest", "No invented production figures, no off-platform contact attempts, no savings guarantees. Misleading quotes can be withdrawn."],
              ].map(([title, body], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-semibold text-[#ffffff]">
                    {index + 1}
                  </span>
                  <span>
                    <strong className="text-ink">{title}.</strong> {body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card card-pad">
            <h2 className="text-xl text-forest-deep">What we ask for</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> SEC or DTI registration</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Mayor&apos;s permit for the current year</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Contractor licence or accreditation, where applicable</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Liability insurance details</li>
            </ul>
            <p className="mt-4 text-xs text-muted">
              Requirements may change as the pilot&apos;s legal and engineering review completes. Missing documents will be
              requested instead of assumed.
            </p>
            <Link href="/signup?role=installer" className="btn btn-primary mt-5 w-full">
              Start an application
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
