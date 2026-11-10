import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ArrowRight, Roof } from "@/components/icons";
import { peso, shortDate } from "@/lib/format";
import type { AssessmentRow, SiteRow } from "@/lib/types";
import type { AssessmentResult } from "@/lib/solar/engine";

export const metadata = { title: "My properties" };

export default async function SitesPage() {
  const user = await requireUser(["customer"]);
  const sites = db.prepare("SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as SiteRow[];
  const assessments = db
    .prepare("SELECT * FROM assessments WHERE user_id = ? AND status != 'archived' ORDER BY created_at DESC")
    .all(user.id) as AssessmentRow[];

  return (
    <>
      <PageHeader
        eyebrow="Properties"
        title="Your properties"
        description="Each site has its own roof profile, bills and assessment history. Nothing is shared between sites."
        actions={<Link href="/app/sites/new" className="btn btn-primary">Add your home or business</Link>}
      />

      {sites.length === 0 ? (
        <EmptyState
          title="No properties yet"
          body="Add a property to get started. You only need a city, rough roof area and a recent electricity bill."
          action={<Link href="/app/sites/new" className="btn btn-primary">Add your home or business</Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.map((site) => {
            const latest = assessments.find((a) => a.site_id === site.id);
            const result = latest ? (JSON.parse(latest.result_json) as AssessmentResult) : null;
            return (
              <article key={site.id} className="card card-pad flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-forest">
                      <Roof className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-lg text-forest-deep">{site.name}</h2>
                      <p className="text-sm text-muted">{site.city}{site.province ? `, ${site.province}` : ""}</p>
                    </div>
                  </div>
                  <span className="badge">{site.property_type}</span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-paper-deep/50 p-3 text-xs">
                  <div><dt className="text-muted">Roof</dt><dd className="font-semibold text-ink">{site.roof_area_m2} m²</dd></div>
                  <div><dt className="text-muted">Material</dt><dd className="font-semibold capitalize text-ink">{site.roof_type}</dd></div>
                  <div><dt className="text-muted">Daytime use</dt><dd className="font-semibold capitalize text-ink">{site.daytime_usage}</dd></div>
                </dl>

                <p className="mt-4 flex-1 text-sm text-ink-soft">
                  {result
                    ? `Latest estimate: ${result.base.capacityKwp} kWp, about ${peso(Math.round(result.base.annualSavingsPhp / 12))} average monthly savings, ${result.base.paybackYears ? `${result.base.paybackYears}-year payback` : "payback beyond 25 years"}.`
                    : "Add a confirmed electricity bill to run your first assessment."}
                </p>
                {latest ? <p className="mt-1 text-xs text-muted">Updated {shortDate(latest.created_at)} · model {latest.model_version}</p> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/app/sites/${site.id}`} className="btn btn-secondary btn-sm">Open site</Link>
                  {latest ? <Link href={`/app/assessments/${latest.id}`} className="btn btn-ghost btn-sm">Estimate <ArrowRight /></Link> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
