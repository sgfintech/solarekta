import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { AssessmentCreateForm } from "@/components/forms/assessment-create-form";
import { ArrowRight, Bill } from "@/components/icons";
import { peso, shortDate, statusTone, titleCase } from "@/lib/format";
import type { AssessmentRow, BillRow, QuoteRequestRow } from "@/lib/types";
import type { AssessmentResult } from "@/lib/solar/engine";
import { EXPORT_CHOICE_LABEL } from "@/lib/solar/view";

export const metadata = { title: "Your property" };

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const query = await searchParams;
  const site = getSite(id, user.id);
  if (!site) notFound();

  const bills = db
    .prepare("SELECT * FROM electricity_bills WHERE site_id = ? AND user_id = ? ORDER BY created_at DESC")
    .all(site.id, user.id) as BillRow[];
  const assessments = db
    .prepare("SELECT * FROM assessments WHERE site_id = ? AND user_id = ? AND status != 'archived' ORDER BY created_at DESC")
    .all(site.id, user.id) as AssessmentRow[];
  const requests = db
    .prepare("SELECT * FROM quote_requests WHERE site_id = ? AND customer_user_id = ? ORDER BY created_at DESC")
    .all(site.id, user.id) as QuoteRequestRow[];
  const confirmedBill = bills.find((b) => b.status === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow={site.city}
        title={site.name}
        description={`${site.roof_area_status === "unknown" ? "Roof area not entered" : `${site.roof_area_m2} m²`} ${site.roof_type} roof · ${titleCase(site.property_type)} · ${site.ownership === "owner" ? "Owner-occupied" : titleCase(site.ownership)}`}
        actions={
          <>
            <Link href={`/app/sites/${site.id}/edit`} className="btn btn-secondary btn-sm">Edit details</Link>
            <Link href={`/app/sites/${site.id}/bills/new`} className="btn btn-primary btn-sm">Add a bill</Link>
          </>
        }
      />

      {query.saved === "bill" ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          Bill saved. Choose what happens to extra solar power, then see your estimate.
        </div>
      ) : null}
      {site.roof_area_status === "unknown" ? (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#f5d68a] bg-sun-soft px-4 py-3 text-sm text-[#6b4708] sm:flex-row sm:items-center sm:justify-between">
          <span>Add your roof area so estimates are checked against roof space and you can request quotes.</span>
          <Link href={`/app/sites/${site.id}/edit`} className="btn btn-secondary btn-sm">Add roof area</Link>
        </div>
      ) : null}
      {query.deleted === "bill" ? (
        <div className="mb-5 rounded-xl border border-line bg-paper-deep px-4 py-3 text-sm text-ink-soft">
          Bill and its private file were deleted.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg text-forest-deep">Electricity bills</h2>
                <p className="text-xs text-muted">Only confirmed bills are used for estimates.</p>
              </div>
              <Link href={`/app/sites/${site.id}/bills/new`} className="btn btn-secondary btn-sm">Add bill</Link>
            </div>
            {bills.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-soft">
                No bill yet. Add a recent bill so the estimate starts from your real consumption.
              </p>
            ) : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="table">
                  <caption className="sr-only">Bills for {site.name}</caption>
                  <thead>
                    <tr><th>Provider</th><th>Period</th><th className="text-right">kWh</th><th className="text-right">Total</th><th className="text-right">Rate</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => (
                      <tr key={bill.id}>
                        <td>
                          <p className="font-medium text-ink">{bill.provider}</p>
                          <p className="text-xs text-muted">{titleCase(bill.source)}</p>
                        </td>
                        <td className="text-xs text-ink-soft">
                          {bill.billing_period_start || bill.billing_period_end
                            ? `${shortDate(bill.billing_period_start)} – ${shortDate(bill.billing_period_end)}`
                            : shortDate(bill.created_at)}
                        </td>
                        <td className="table-num text-right">{bill.monthly_kwh.toLocaleString("en-PH")}</td>
                        <td className="table-num text-right">{peso(bill.total_php)}</td>
                        <td className="table-num text-right">{bill.effective_rate_php ? `₱${bill.effective_rate_php.toFixed(2)}` : "—"}</td>
                        <td><span className={`badge badge-${statusTone(bill.status)}`}>{bill.status}</span></td>
                        <td className="text-right">
                          <Link href={`/app/bills/${bill.id}`} className="link-action text-xs">
                            {bill.status === "draft" ? "Review" : "Open"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg text-forest-deep">Estimates</h2>
                <p className="text-xs text-muted">Each estimate keeps the model version and inputs it was made with.</p>
              </div>
            </div>
            {assessments.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-soft">
                No estimates yet. {confirmedBill ? "Use “See my solar estimate” on this page." : "Add and confirm a bill first."}
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {assessments.map((assessment) => {
                  const result = JSON.parse(assessment.result_json) as AssessmentResult;
                  return (
                    <li key={assessment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div>
                        <p className="font-medium text-ink">
                          {result.base.capacityKwp > 0 ? `${result.base.capacityKwp} kWp · about ${peso(Math.round(result.base.annualSavingsPhp / 12))}/month · payback ${result.base.paybackYears != null ? `${result.base.paybackYears} yrs` : "over 25 yrs"}` : "No system modelled (roof too small)"}
                        </p>
                        <p className="text-xs text-muted">{shortDate(assessment.created_at)} · {EXPORT_CHOICE_LABEL[result.systemType] ?? titleCase(result.systemType)}{result.sizing ? "" : " · earlier model"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge badge-${statusTone(assessment.status)}`}>{titleCase(assessment.status)}</span>
                        <Link href={`/app/assessments/${assessment.id}`} className="btn btn-ghost btn-sm">
                          Open <ArrowRight />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Quote requests</h2>
            </div>
            {requests.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-soft">No quote requests yet. Open an estimate to compare providers who serve your area.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {requests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">Requested {shortDate(request.created_at)}</p>
                      <p className="text-xs text-muted">{request.share_contact ? "Contact shared with selected providers" : "Contact details kept private"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span>
                      <Link href={`/app/quotes/${request.id}`} className="btn btn-ghost btn-sm">View</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">See my solar estimate</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {confirmedBill
                ? "Creates a new estimate from your latest confirmed bill. Earlier estimates are kept as they were."
                : "Add an electricity bill first. You can type the numbers or upload a photo."}
            </p>
            <div className="mt-4">
              {confirmedBill ? (
                <AssessmentCreateForm siteId={site.id} defaultExport={site.export_preference ?? "not_sure"} />
              ) : (
                <Link href={`/app/sites/${site.id}/bills/new`} className="btn btn-primary w-full">Add a bill first</Link>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex items-center gap-2 text-forest">
              <Bill className="h-5 w-5" />
              <h2 className="text-lg text-forest-deep">Property facts</h2>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["City", site.city],
                ["Province", site.province || "—"],
                ["Roof material", titleCase(site.roof_type)],
                ["Roof area", site.roof_area_status === "unknown" ? "Not entered yet" : `${site.roof_area_m2} m²`],
                ["Roof age", site.roof_age_years ? `${site.roof_age_years} years` : "—"],
                ["Daytime usage", titleCase(site.daytime_usage)],
                ["Utility", site.utility_provider || "—"],
                ["Installation budget", site.install_budget_php ? peso(site.install_budget_php) : "—"],
                ["Extra solar power", EXPORT_CHOICE_LABEL[site.export_preference ?? "not_sure"]],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl bg-sun-soft/70 p-4 text-xs leading-relaxed text-[#6b4708]">
            <strong>Indicative estimate.</strong> Roof structure, electrical capacity and shading need a licensed
            installer’s site survey. SOLARekta does not certify roof suitability.
          </div>
        </aside>
      </div>
    </>
  );
}
