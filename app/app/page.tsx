import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { peso, shortDate, statusTone } from "@/lib/format";
import { ArrowRight, Check, Roof, SunIcon } from "@/components/icons";
import type { AssessmentRow, SiteRow } from "@/lib/types";
import type { AssessmentResult } from "@/lib/solar/engine";

export const metadata = { title: "Overview" };

export default async function CustomerHomePage() {
  const user = await requireUser(["customer"]);

  const sites = db
    .prepare("SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC")
    .all(user.id) as SiteRow[];

  const assessments = db
    .prepare("SELECT * FROM assessments WHERE user_id = ? AND status != 'archived' ORDER BY created_at DESC")
    .all(user.id) as AssessmentRow[];

  const latestBySite = new Map<string, AssessmentRow>();
  for (const assessment of assessments) {
    if (!latestBySite.has(assessment.site_id)) latestBySite.set(assessment.site_id, assessment);
  }

  const openQuotes = db
    .prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE customer_user_id = ? AND status IN ('open','matched')")
    .get(user.id) as { count: number };
  const quoteReplies = db
    .prepare(
      `SELECT COUNT(*) AS count FROM installer_quotes q
       JOIN quote_requests r ON r.id = q.quote_request_id
       WHERE r.customer_user_id = ? AND q.status IN ('submitted','revised')`,
    )
    .get(user.id) as { count: number };
  const installerCount = db
    .prepare("SELECT COUNT(*) AS count FROM installers WHERE verification_status = 'verified'")
    .get() as { count: number };

  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 4")
    .all(user.id) as { id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }[];
  const unread = notifications.filter((n) => !n.read_at).length;

  const hasConfirmedBill = Boolean(
    db.prepare("SELECT 1 FROM electricity_bills WHERE user_id = ? AND status = 'confirmed' LIMIT 1").get(user.id),
  );
  const hasAnyEstimate = assessments.length > 0;
  const hasRequest = Boolean(db.prepare("SELECT 1 FROM quote_requests WHERE customer_user_id = ? LIMIT 1").get(user.id));
  const firstSite = sites[0];
  const checklist = [
    { title: "Add your home or business", body: "City, roof and when you use power.", done: sites.length > 0, href: "/app/sites/new", cta: "Add details" },
    { title: "Add a recent bill", body: "Type two numbers or upload a photo.", done: hasConfirmedBill, href: firstSite ? `/app/sites/${firstSite.id}/bills/new` : null, cta: "Add bill" },
    { title: "See your estimate", body: "Savings, cost and payback.", done: hasAnyEstimate, href: firstSite ? `/app/sites/${firstSite.id}` : null, cta: "See estimate" },
    { title: "Compare providers", body: "Ask verified providers in your area.", done: hasRequest, href: null, cta: "" },
  ];

  const potentialSavings = [...latestBySite.values()].reduce((sum, assessment) => {
    const result = JSON.parse(assessment.result_json) as AssessmentResult;
    return sum + result.base.annualSavingsPhp;
  }, 0);

  return (
    <>
      <PageHeader
        eyebrow="Your dashboard"
        title={`Kumusta, ${user.name.split(" ")[0]}.`}
        description="Start with a real bill, see what solar could save, then compare direct quotes from providers in your area."
        actions={
          <Link href="/app/sites/new" className="btn btn-primary">
            Add your home or business <ArrowRight />
          </Link>
        }
      />

      {!hasAnyEstimate ? (
        <section aria-labelledby="checklist-heading" className="card card-pad">
          <h2 id="checklist-heading" className="text-xl text-forest-deep">Your next steps</h2>
          <p className="mt-1 text-sm text-ink-soft">Four short steps from your bill to comparable quotes.</p>
          <ol className="mt-5 grid gap-3 md:grid-cols-4">
            {checklist.map((item, index) => {
              const current = !item.done && checklist.slice(0, index).every((c) => c.done);
              return (
                <li
                  key={item.title}
                  className={`relative rounded-2xl border p-4 ${item.done ? "border-[#bfdcaa] bg-mint/50" : current ? "border-forest bg-white shadow-soft" : "border-line bg-paper/60"}`}
                  aria-current={current ? "step" : undefined}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${item.done ? "bg-forest text-white" : current ? "bg-sun text-forest-deep" : "bg-line text-ink-soft"}`}
                    aria-hidden="true"
                  >
                    {item.done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <p className="mt-3 font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">{item.done ? "Done" : item.body}</p>
                  {current && item.href ? (
                    <Link href={item.href} className="btn btn-primary btn-sm mt-3">{item.cta} <ArrowRight /></Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {sites.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Prefer a quick look first? <Link href="/estimate" className="font-semibold text-forest underline underline-offset-2">Try the 2-minute estimate</Link>; it saves to your account automatically.
            </p>
          ) : null}
        </section>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Properties", value: String(sites.length), sub: "homes or businesses" },
          { label: "Avg. monthly savings", value: potentialSavings ? peso(Math.round(potentialSavings / 12)) : "—", sub: "latest estimates, year one" },
          { label: "Open quote requests", value: String(openQuotes.count), sub: `${quoteReplies.count} quote${quoteReplies.count === 1 ? "" : "s"} received` },
          { label: "Verified providers", value: String(installerCount.count), sub: "documents reviewed" },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-xs font-semibold text-muted">{stat.label}</p>
            <p className="mt-1.5 font-display font-bold tracking-tight text-[1.45rem] sm:text-[1.85rem] leading-none text-forest-deep">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.sub}</p>
          </div>
        ))}
      </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-forest-deep">Your properties</h2>
            <Link href="/app/sites" className="link-action text-sm">
              View all
            </Link>
          </div>

          {sites.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-6 text-sm text-ink-soft">
              Your homes and businesses will appear here once you add one using the steps above.
            </p>
          ) : (
            <div className="space-y-4">
              {sites.slice(0, 4).map((site) => {
                const latest = latestBySite.get(site.id);
                const result = latest ? (JSON.parse(latest.result_json) as AssessmentResult) : null;
                return (
                  <article key={site.id} className="card card-pad">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-mint text-forest">
                          <Roof className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-lg text-forest-deep">{site.name}</h3>
                          <p className="text-sm text-muted">
                            {site.city}{site.province ? `, ${site.province}` : ""} · {site.roof_area_m2} m² {site.roof_type} roof
                          </p>
                        </div>
                      </div>
                      {latest ? (
                        <span className={`badge badge-${statusTone(latest.status)}`}>{latest.status.replace("_", " ")}</span>
                      ) : (
                        <span className="badge badge-warn">Needs a bill</span>
                      )}
                    </div>

                    {result ? (
                      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-paper-deep/50 p-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted">Base system</p>
                          <p className="mt-0.5 font-semibold text-ink">{result.base.capacityKwp} kWp</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Year-1 savings</p>
                          <p className="mt-0.5 font-semibold text-ink">{peso(result.base.annualSavingsPhp)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Payback</p>
                          <p className="mt-0.5 font-semibold text-ink">{result.base.paybackYears ?? "25y+"} {result.base.paybackYears ? "yrs" : ""}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Avg. monthly savings</p>
                          <p className="mt-0.5 font-semibold text-ink">{peso(Math.round(result.base.annualSavingsPhp / 12))}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-ink-soft">
                        Add a recent electricity bill to run your first assessment.
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/app/sites/${site.id}`} className="btn btn-secondary btn-sm">
                        Open site
                      </Link>
                      {latest ? (
                        <Link href={`/app/assessments/${latest.id}`} className="btn btn-ghost btn-sm">
                          View estimate <ArrowRight />
                        </Link>
                      ) : (
                        <Link href={`/app/sites/${site.id}/bills/new`} className="btn btn-ghost btn-sm">
                          Add a bill <ArrowRight />
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="card card-pad bg-forest text-[#ffffff]">
            <SunIcon className="h-6 w-6 text-sun" />
            <h2 className="mt-3 text-xl text-[#ffffff]">Why three scenarios?</h2>
            <p className="mt-2 text-sm text-[#d6ead0]">
              Solar outcomes depend on weather, shading, tariffs and how much you use while the sun is up. We show a
              range and the assumptions — not a single confident number.
            </p>
            <Link href="/how-it-works" className="btn btn-sun btn-sm mt-4">
              See the method
            </Link>
          </div>

          <div className="card card-pad">
            <p className="eyebrow">Ask Solar AI</p>
            <h2 className="mt-1 text-lg text-forest-deep">Check an equipment price</h2>
            <p className="mt-1 text-sm text-ink-soft">Compare a battery, inverter or panel price with verified supplier listings before you buy.</p>
            <form action="/app/advisor" method="get" className="mt-3 flex gap-2" role="search" aria-label="Ask Solar AI">
              <label htmlFor="dash-advisor-q" className="sr-only">Your question</label>
              <input id="dash-advisor-q" name="q" required minLength={3} maxLength={500} className="input flex-1" placeholder="e.g. 51.2V 300Ah battery price" />
              <button type="submit" className="btn btn-primary btn-sm">Ask</button>
            </form>
          </div>

          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Notifications</h2>
              {unread > 0 ? <span className="badge badge-warn">{unread} new</span> : null}
            </div>
            {notifications.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {notifications.map((n) => (
                  <li key={n.id} className="px-5 py-3">
                    <Link href={n.href ?? "/app/notifications"} className="block hover:underline">
                      <p className={`text-sm ${n.read_at ? "text-ink-soft" : "font-semibold text-ink"}`}>{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">{shortDate(n.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-5 py-3">
              <Link href="/app/notifications" className="link-action text-xs">
                View all notifications
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
