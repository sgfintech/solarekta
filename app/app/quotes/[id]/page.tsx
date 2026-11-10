import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getQuoteRequestForCustomer, getSite } from "@/lib/data";
import { closeQuoteRequestAction } from "@/app/actions/quotes";
import { quoteMetrics } from "@/lib/quotes";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Alert, ArrowRight, Check, Shield } from "@/components/icons";
import { dateTime, num, peso, shortDate, statusTone, titleCase } from "@/lib/format";
import type { AssessmentResult } from "@/lib/solar/engine";
import type { AssessmentRow } from "@/lib/types";
import { QuoteSummaryPanel } from "@/components/ai/quote-summary-panel";
import { buildQuoteComparison, deterministicQuoteSummary, QUOTE_FIELDS } from "@/lib/ai/features";
import { aiStatus } from "@/lib/ai/provider";

export const metadata = { title: "Compare quotes" };

interface QuoteRow {
  id: string;
  status: string;
  capacity_kwp: number;
  price_php: number;
  warranty_years: number;
  workmanship_warranty_years: number;
  timeline_weeks: number;
  expected_annual_kwh: number;
  exclusions: string | null;
  notes: string | null;
  valid_until: string | null;
  panel_model: string | null;
  inverter_model: string | null;
  panel_product_id: string | null;
  inverter_product_id: string | null;
  equipment_supplier: string | null;
  inclusions: string | null;
  business_name: string;
  installer_status: string;
  created_at: string;
}

export default async function QuoteRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const query = await searchParams;
  const request = getQuoteRequestForCustomer(id, user.id);
  if (!request) notFound();
  const site = getSite(request.site_id, user.id);
  const assessment = db.prepare("SELECT * FROM assessments WHERE id = ?").get(request.assessment_id) as AssessmentRow | undefined;
  if (!site || !assessment) notFound();
  const result = JSON.parse(assessment.result_json) as AssessmentResult;

  const quotes = db
    .prepare(
      `SELECT q.*, i.business_name, i.verification_status AS installer_status
       FROM installer_quotes q JOIN installers i ON i.id = q.installer_id
       WHERE q.quote_request_id = ? AND q.status IN ('submitted','revised')
       ORDER BY q.price_php ASC`,
    )
    .all(request.id) as QuoteRow[];

  const invites = db
    .prepare(
      `SELECT qi.status, i.business_name, i.verification_status
       FROM quote_invites qi JOIN installers i ON i.id = qi.installer_id
       WHERE qi.quote_request_id = ? ORDER BY i.business_name`,
    )
    .all(request.id) as { status: string; business_name: string; verification_status: string }[];

  const lineItems = new Map<string, { description: string; amount_php: number }[]>();
  for (const quote of quotes) {
    lineItems.set(
      quote.id,
      db.prepare("SELECT description, amount_php FROM quote_line_items WHERE quote_id = ?").all(quote.id) as {
        description: string;
        amount_php: number;
      }[],
    );
  }

  const events = db
    .prepare("SELECT actor_role, to_status, note, created_at FROM lead_status_events WHERE quote_request_id = ? ORDER BY created_at ASC")
    .all(request.id) as { actor_role: string; to_status: string; note: string | null; created_at: string }[];
  const comparison = buildQuoteComparison(request.id, user.id);
  const initialSummary = comparison ? deterministicQuoteSummary(comparison) : null;
  const ai = aiStatus();

  const lowestPrice = quotes.length > 1 ? Math.min(...quotes.map((q) => q.price_php)) : null;
  const isOpen = request.status === "open" || request.status === "matched";

  // Quote rows use the database's snake_case shape; quoteMetrics exposes a
  // camelCase domain API. Adapt once per quote so the comparisons stay cheap.
  const metrics = new Map(
    quotes.map((quote) => [
      quote.id,
      quoteMetrics(
        {
          pricePhp: quote.price_php,
          capacityKwp: quote.capacity_kwp,
          expectedAnnualKwh: quote.expected_annual_kwh,
        },
        result,
      ),
    ]),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${site.name} · ${site.city}`}
        title="Compare provider quotes"
        description={`Measured against your estimate (${result.base.capacityKwp} kWp, about ${peso(Math.round(result.base.annualSavingsPhp / 12))} average monthly savings in year one).`}
        actions={
          <>
            <PrintButton />
            <Link href={`/app/assessments/${assessment.id}`} className="btn btn-ghost btn-sm no-print">View assessment</Link>
          </>
        }
      />

      {query.closed ? (
        <div className="mb-5 rounded-xl border border-line bg-paper-deep px-4 py-3 text-sm text-ink-soft">
          Request closed. Existing quotes remain visible for your records.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#ffffff] px-4 py-3 text-sm">
        <span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span>
        <span className="text-ink-soft">Requested {shortDate(request.created_at)}</span>
        <span className="text-muted">·</span>
        <span className="flex items-center gap-1.5 text-ink-soft">
          <Shield className="h-3.5 w-3.5" />
          {request.share_contact ? "Contact details shared with invited installers" : "Contact details kept private"}
        </span>
        {isOpen ? (
          <form action={closeQuoteRequestAction} className="ml-auto no-print">
            <input type="hidden" name="quoteRequestId" value={request.id} />
            <button type="submit" className="link-action link-danger text-xs underline">
              Close request
            </button>
          </form>
        ) : null}
      </div>

      {quotes.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="card card-pad">
            <h2 className="text-xl text-forest-deep">Waiting for quotes</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Invited installers can review the assessment and submit an itemised proposal. You will get an in-app
              notification when one arrives.
            </p>
            <ul className="mt-5 space-y-2">
              {invites.map((invite) => (
                <li key={invite.business_name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
                  <span className="text-sm font-medium text-ink">{invite.business_name}</span>
                  <span className={`badge badge-${statusTone(invite.status)}`}>{invite.status}</span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="card card-pad">
            <h2 className="text-lg text-forest-deep">While you wait</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Ask each installer for their own site survey before signing.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Check panel and inverter models, not just capacity.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Read exclusions: permits, net-metering fees, roof repairs and monitoring.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Never pay a deposit without a written contract and verified business details.</li>
            </ul>
            <Link href="/advisor/quote" className="link-action mt-3 text-sm no-print">Got a quotation elsewhere? Check it with Solar AI <ArrowRight /></Link>
          </aside>
        </div>
      ) : (
        <>
          <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="table min-w-[760px]">
              <caption className="sr-only">Side-by-side installer quotes. Figures are installer-submitted except normalised estimates marked accordingly.</caption>
              <thead>
                <tr>
                  <th className="w-44">Comparison</th>
                  {quotes.map((quote) => (
                    <th key={quote.id} className="min-w-[190px]">
                      <span className="block text-sm font-semibold text-ink">{quote.business_name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`badge badge-${statusTone(quote.installer_status)}`}>
                          {quote.installer_status === "verified" ? "Verified" : titleCase(quote.installer_status)}
                        </span>
                        {lowestPrice === quote.price_php ? <span className="badge badge-warn">Lowest price</span> : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-paper-deep/40">
                  <th scope="row" className="text-muted">Total price</th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="table-num font-display font-bold tracking-tight text-xl text-forest-deep">{peso(quote.price_php)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">System capacity</th>
                  {quotes.map((quote) => <td key={quote.id} className="table-num">{quote.capacity_kwp} kWp</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Price per kWp</th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="table-num">{peso(metrics.get(quote.id)!.pricePerKwpPhp)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Expected production</th>
                  {quotes.map((quote) => <td key={quote.id} className="table-num">{num(quote.expected_annual_kwh)} kWh/yr</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">vs. model production</th>
                  {quotes.map((quote) => {
                    const delta = metrics.get(quote.id)!.productionVsModelPct;
                    return (
                      <td key={quote.id} className={`table-num ${delta < -0.15 ? "text-clay" : ""}`}>
                        {delta >= 0 ? "+" : ""}{Math.round(delta * 100)}%
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">
                    Est. year-1 savings <span className="text-xs font-normal text-muted">(normalised)</span>
                  </th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="table-num text-ink-soft">{peso(metrics.get(quote.id)!.estimatedAnnualSavingsPhp)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">
                    Simple payback <span className="text-xs font-normal text-muted">(normalised)</span>
                  </th>
                  {quotes.map((quote) => {
                    const payback = metrics.get(quote.id)!.estimatedPaybackYears;
                    return <td key={quote.id} className="table-num text-ink-soft">{payback != null ? `${payback.toFixed(1)} yrs` : "—"}</td>;
                  })}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Product warranty</th>
                  {quotes.map((quote) => <td key={quote.id}>{quote.warranty_years} yrs</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Workmanship warranty</th>
                  {quotes.map((quote) => <td key={quote.id}>{quote.workmanship_warranty_years} yrs</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Timeline</th>
                  {quotes.map((quote) => <td key={quote.id}>{quote.timeline_weeks} weeks</td>)}
                </tr>
                {(
                  [
                    ["Panel model", "panel_model"],
                    ["Inverter model", "inverter_model"],
                    ["Equipment supplied by", "equipment_supplier"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <th scope="row" className="text-muted">{label}</th>
                    {quotes.map((quote) => (
                      <td key={quote.id} className="text-sm">
                        {quote[key] ? <span className="text-ink">{quote[key]}</span> : <span className="italic text-muted">Not provided</span>}
                        {key === "panel_model" && quote.panel_product_id ? (
                          <a href={`/equipment/${quote.panel_product_id}`} className="mt-0.5 block text-xs font-semibold text-forest underline">Verified listing: warranty and specs</a>
                        ) : null}
                        {key === "inverter_model" && quote.inverter_product_id ? (
                          <a href={`/equipment/${quote.inverter_product_id}`} className="mt-0.5 block text-xs font-semibold text-forest underline">Verified listing: warranty and specs</a>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="text-muted">Installed by</th>
                  {quotes.map((quote) => <td key={quote.id} className="text-sm text-ink">{quote.business_name}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">What the price includes</th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="text-xs text-ink-soft">
                      {quote.inclusions || <span className="italic text-muted">Not provided</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Quote valid until</th>
                  {quotes.map((quote) => <td key={quote.id}>{quote.valid_until ? shortDate(quote.valid_until) : <span className="italic text-muted">Not provided</span>}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Exclusions</th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="text-xs text-ink-soft">{quote.exclusions || <span className="italic text-muted">Not provided</span>}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="text-muted">Installer notes</th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="text-xs text-ink-soft">{quote.notes || "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {quotes.map((quote) => (
              <article key={quote.id} className="card card-pad">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg text-forest-deep">{quote.business_name}</h3>
                  <span className={`badge badge-${statusTone(quote.status)}`}>{quote.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">Submitted {shortDate(quote.created_at)}</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {lineItems.get(quote.id)?.map((item) => (
                    <li key={`${quote.id}-${item.description}`} className="flex justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
                      <span className="text-ink-soft">{item.description}</span>
                      <span className="shrink-0 font-medium text-ink">{peso(item.amount_php)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
                  <span>Total</span><span>{peso(quote.price_php)}</span>
                </p>
              </article>
            ))}
          </div>

          {comparison && initialSummary ? (
            <div className="mt-6">
              <QuoteSummaryPanel requestId={request.id} initial={initialSummary} aiEnabled={ai.enabled} fieldLabels={QUOTE_FIELDS} />
            </div>
          ) : null}

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-sun-soft/50 p-4 text-xs leading-relaxed text-[#6b4708]">
            <Alert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Check before you commit:</strong> quotes are submitted by independent installers. SOLARekta does not
              verify prices, equipment quality or savings. Verify licences and insurance, ask for a site survey, and read
              the contract. Normalised savings and payback use your assessment tariff and are not installer promises.
            </p>
          </div>
        </>
      )}

      <section aria-labelledby="progress-heading" className="card card-pad mt-6">
        <h2 id="progress-heading" className="text-lg text-forest-deep">Request progress</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <ol className="relative space-y-4 border-l-2 border-line pl-5">
            {events.map((event, index) => (
              <li key={`${event.created_at}-${index}`} className="relative">
                <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-lime" aria-hidden="true" />
                <p className="text-sm font-medium text-ink">{event.note || titleCase(event.to_status)}</p>
                <p className="text-xs text-muted">{dateTime(event.created_at)} · {event.actor_role === "customer" ? "You" : titleCase(event.actor_role)}</p>
              </li>
            ))}
          </ol>
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li key={invite.business_name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <span className="text-sm font-medium text-ink">{invite.business_name}</span>
                <span className={`badge badge-${statusTone(invite.status)}`}>{invite.status === "invited" ? "Not opened yet" : invite.status === "viewed" ? "Viewed" : invite.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-xs text-muted">Every step here is recorded when it happens. Nothing is shown that hasn&apos;t happened yet.</p>
      </section>
    </>
  );
}
