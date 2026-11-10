import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAssessment, getSite, listVerifiedInstallers } from "@/lib/data";
import { archiveAssessmentAction } from "@/app/actions/sites";
import { eligibleInstallers, MATCH_LABEL, MAX_PROVIDERS_PER_REQUEST } from "@/lib/matching";
import { summarizeResult } from "@/lib/solar/view";
import { PageHeader } from "@/components/page-header";
import { QuoteRequestForm } from "@/components/quote-request-form";
import { PrintButton } from "@/components/print-button";
import { NextActionCard, ResultDetails, ResultHeadline, SizingNotice } from "@/components/results/result-summary";
import { ExplanationPanel } from "@/components/ai/explanation-panel";
import { AssessmentAssistant } from "@/components/ai/assessment-assistant";
import { ArrowRight, Check, Roof } from "@/components/icons";
import { shortDate, statusTone, titleCase } from "@/lib/format";
import { deterministicExplanation, getCachedExplanation } from "@/lib/ai/features";
import { aiStatus } from "@/lib/ai/provider";
import type { AssessmentResult } from "@/lib/solar/engine";

export const metadata = { title: "Your solar estimate" };

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const query = await searchParams;
  const assessment = getAssessment(id, user.id);
  if (!assessment) notFound();
  const site = getSite(assessment.site_id, user.id);
  if (!site) notFound();

  const result = JSON.parse(assessment.result_json) as AssessmentResult;
  const s = summarizeResult(result);
  const request = db
    .prepare(
      "SELECT * FROM quote_requests WHERE assessment_id = ? AND customer_user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(assessment.id, user.id) as { id: string; status: string; created_at: string } | undefined;
  const invites = request
    ? (db
        .prepare(
          `SELECT qi.status, i.business_name FROM quote_invites qi
           JOIN installers i ON i.id = qi.installer_id
           WHERE qi.quote_request_id = ? ORDER BY i.business_name`,
        )
        .all(request.id) as { status: string; business_name: string }[])
    : [];

  const eligible = eligibleInstallers(listVerifiedInstallers(), { city: site.city, province: site.province });
  const roofReady = s.status !== "roof_unchecked" && site.roof_area_status !== "unknown";
  const quotable = s.hasSystem && roofReady && assessment.status !== "archived";
  const activeRequest = request && ["open", "matched"].includes(request.status) ? request : undefined;

  const locale = "en";
  // Show the standard explanation immediately; an AI version replaces it only when generated and verified.
  const cachedEnglish = getCachedExplanation(assessment, "en") ?? { text: deterministicExplanation(result, "en"), source: "deterministic" as const };
  const cachedFilipino = getCachedExplanation(assessment, "fil") ?? { text: deterministicExplanation(result, "fil"), source: "deterministic" as const };
  const ai = aiStatus();

  // One primary action for the current state.
  const next = !s.hasSystem
    ? {
        title: "Check your roof details",
        body: "The roof area entered is too small for a practical system. Correct it if needed, then run a new estimate.",
        action: <Link href={`/app/sites/${site.id}/edit`} className="btn btn-primary">Edit roof details <ArrowRight /></Link>,
      }
    : !roofReady
      ? {
          title: "Complete your roof details",
          body: "Add your roof area so we can check the size against your roof and you can ask providers for quotes.",
          action: <Link href={`/app/sites/${site.id}/edit`} className="btn btn-primary">Add roof area <ArrowRight /></Link>,
        }
      : activeRequest
        ? {
            title: "Your quote request is in progress",
            body: `${invites.filter((i) => i.status === "quoted").length} of ${invites.length} providers have sent a quote so far.`,
            action: <Link href={`/app/quotes/${activeRequest.id}`} className="btn btn-primary">See your quotes <ArrowRight /></Link>,
          }
        : eligible.length > 0
          ? {
              title: "Compare available providers",
              body: `${eligible.length} verified provider${eligible.length === 1 ? "" : "s"} serve${eligible.length === 1 ? "s" : ""} ${site.city}. Ask up to ${MAX_PROVIDERS_PER_REQUEST} for a structured quote.`,
              action: <a href="#providers" className="btn btn-primary">Choose providers <ArrowRight /></a>,
            }
          : {
              title: "No provider covers your area yet",
              body: "Your estimate is saved. We will only list providers whose service areas include your location.",
              action: <a href="#providers" className="btn btn-secondary">See options</a>,
            };

  return (
    <>
      <PageHeader
        eyebrow={`${site.name} · ${result.location.city}`}
        title="Your solar estimate"
        description={`Prepared ${shortDate(assessment.created_at)}. An estimate, not a quotation.`}
        actions={
          <>
            <PrintButton />
            <Link href={`/app/sites/${site.id}`} className="btn btn-ghost btn-sm no-print">Property details</Link>
          </>
        }
      />

      <div className="space-y-5">
        {query.from === "estimate" ? (
          <p role="status" className="flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /> Saved to your account. You can now add details and compare providers.
          </p>
        ) : null}

        {s.legacy ? (
          <p className="rounded-xl border border-line bg-paper-deep px-4 py-3 text-sm text-ink-soft">
            This estimate was made with an earlier model ({assessment.model_version}) and is shown exactly as calculated.
            Its outcomes also changed system size. <Link href={`/app/sites/${site.id}`} className="font-semibold text-forest underline">Run a new estimate</Link>{" "}
            for the updated method.
          </p>
        ) : null}

        <SizingNotice
          result={result}
          action={
            !s.hasSystem || s.status === "roof_unchecked" ? (
              <Link href={`/app/sites/${site.id}/edit`} className="btn btn-secondary btn-sm">Edit roof details</Link>
            ) : undefined
          }
        />
        <ResultHeadline result={result} />
        <NextActionCard title={next.title} body={next.body} action={next.action} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="min-w-0 space-y-6">
          <ExplanationPanel
            assessmentId={assessment.id}
            initialLocale={locale}
            cached={{ en: cachedEnglish, fil: cachedFilipino }}
            aiEnabled={ai.enabled}
          />
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-3 text-xl text-forest-deep">Details behind the numbers</h2>
            <ResultDetails result={result} />
          </section>
          <AssessmentAssistant assessmentId={assessment.id} aiEnabled={ai.enabled} />
        </div>

        <aside className="min-w-0 space-y-5" id="providers">
          {request ? (
            <div className="card card-pad">
              <p className="eyebrow">Quote request</p>
              <h2 className="mt-1 text-xl text-forest-deep">{titleCase(request.status)}</h2>
              <p className="mt-1 text-sm text-ink-soft">Sent {shortDate(request.created_at)}.</p>
              <ul className="mt-4 space-y-2">
                {invites.map((invite) => (
                  <li key={invite.business_name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink">{invite.business_name}</span>
                    <span className={`badge badge-${statusTone(invite.status)}`}>{invite.status}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/app/quotes/${request.id}`} className="btn btn-primary btn-sm mt-4 w-full">Open quote request</Link>
            </div>
          ) : null}

          {!activeRequest ? (
            <div className="card card-pad">
              <div className="flex items-center gap-2">
                <Roof className="h-5 w-5 text-forest" />
                <h2 className="text-xl text-forest-deep">Ask providers for quotes</h2>
              </div>
              <p className="mt-2 rounded-xl bg-mint px-3 py-2 text-sm text-forest-deep">
                Already have a quotation, or want to check equipment prices first?{" "}
                <Link href="/advisor" className="font-semibold underline">Ask Solar AI</Link> or{" "}
                <Link href="/advisor/quote" className="font-semibold underline">review a quotation</Link>.
              </p>
              {quotable ? (
                <>
                  <p className="mt-1 text-sm text-ink-soft">
                    Providers quote directly. They see your city, roof profile and this estimate. Your bill file and street
                    address are never shared.
                  </p>
                  <div className="mt-4">
                    <QuoteRequestForm
                      assessmentId={assessment.id}
                      city={site.city}
                      maxProviders={MAX_PROVIDERS_PER_REQUEST}
                      providers={eligible.map((e) => ({
                        id: e.installer.id,
                        businessName: e.installer.business_name,
                        areas: e.areas,
                        matchLabel: MATCH_LABEL[e.basis],
                        yearsExperience: e.installer.years_experience,
                        about: e.installer.about,
                        slug: e.installer.slug,
                        isDemo: Boolean(e.installer.is_demo),
                      }))}
                      defaultName={user.name}
                      defaultEmail={user.email}
                      defaultPhone={user.phone ?? ""}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  {!s.hasSystem
                    ? "There is no system to quote yet. Check your roof details first."
                    : "Add your roof area and run a new estimate first, so providers can quote for a size that fits your roof."}{" "}
                  {eligible.length > 0
                    ? `${eligible.length} verified provider${eligible.length === 1 ? "" : "s"} serve${eligible.length === 1 ? "s" : ""} ${site.city}.`
                    : `No verified provider covers ${site.city} yet.`}
                </p>
              )}
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-2xl border border-line bg-white p-4 text-xs text-ink-soft">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
            <div>
              <p className="font-semibold text-ink">A quote is not a savings promise</p>
              <p className="mt-0.5">
                Compare capacity, equipment, warranties, exclusions and timeline, not just price. Ask for a site survey and
                a written contract.
              </p>
            </div>
          </div>

          <form action={archiveAssessmentAction} className="no-print">
            <input type="hidden" name="assessmentId" value={assessment.id} />
            <button type="submit" className="min-h-11 text-xs font-semibold text-muted underline underline-offset-2">
              Archive this estimate
            </button>
          </form>
        </aside>
      </div>

      <p className="mt-8 text-xs text-muted">
        Calculated with SOLARekta model {result.modelVersion}. Indicative only: not engineering advice, a quotation, or a
        guarantee of savings or utility approval.{" "}
        <Link href="/how-it-works" className="link-action">How the estimate works</Link>
      </p>
    </>
  );
}
