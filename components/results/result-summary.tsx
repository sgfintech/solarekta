import { CashflowChart } from "@/components/cashflow-chart";
import { Alert, Bolt, Panel, SunIcon } from "@/components/icons";
import { num, peso } from "@/lib/format";
import { EXPORT_CHOICE_LABEL, generationRatio, summarizeResult } from "@/lib/solar/view";
import type { AssessmentResult } from "@/lib/solar/engine";

function paybackText(years: number | null) {
  return years == null ? "Over 25 years" : `${num(years, 1)} years`;
}

/** Status message about how the system was sized. Returns null when nothing needs saying. */
export function SizingNotice({ result, action }: { result: AssessmentResult; action?: React.ReactNode }) {
  const s = summarizeResult(result);
  if (s.status === "energy_led") return null;
  const tone =
    s.status === "insufficient_roof"
      ? "border-[#ebb7a6] bg-[#f9e0d8] text-[#7d2a14]"
      : "border-[#f5d68a] bg-sun-soft text-[#6b4708]";
  const message =
    s.status === "roof_unchecked"
      ? "Preliminary: this size has not been checked against your roof space. Add your roof area before asking for a site-specific proposal."
      : s.status === "insufficient_roof"
        ? `The roof area entered fits less than ${result.sizing?.minimumPracticalKwp ?? 0.5} kWp, so we have not modelled a system. Check the area, or ask an installer about another roof section or a ground mount.`
        : `Your roof space limits the size to about ${num(result.sizing?.roofCapacityKwp ?? result.base.roofCapacityKwp ?? 0, 1)} kWp, so it is smaller than your electricity use alone would suggest.`;
  return (
    <div role="status" className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <p className="flex gap-2">
        <Alert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** The three numbers that matter first, plus one clearly labelled bill comparison. */
export function ResultHeadline({ result }: { result: AssessmentResult }) {
  const s = summarizeResult(result);
  if (!s.hasSystem) return null;
  const remaining = Math.max(0, s.monthlyBillAvgPhp - s.monthlySavingsAvgPhp);

  return (
    <section aria-labelledby="headline-heading" className="overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-soft">
      <h2 id="headline-heading" className="sr-only">Estimate summary</h2>
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Average monthly savings</p>
          <p className="mt-1 font-display text-[2.1rem] font-bold leading-none tracking-tight text-forest-deep">
            {peso(s.monthlySavingsAvgPhp)}
          </p>
          <p className="mt-2 text-xs text-muted">
            Range {peso(s.monthlySavingsRange.low)}–{peso(s.monthlySavingsRange.high)}. First-year average, not a monthly forecast.
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Estimated installation cost</p>
          <p className="mt-1 font-display text-[2.1rem] font-bold leading-none tracking-tight text-ink">{peso(s.capexPhp)}</p>
          <p className="mt-2 text-xs text-muted">For about {num(s.capacityKwp, 1)} kWp. Installer quotes replace this benchmark.</p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Payback</p>
          <p className="mt-1 font-display text-[2.1rem] font-bold leading-none tracking-tight text-ink">{paybackText(s.paybackYears)}</p>
          <p className="mt-2 text-xs text-muted">When savings add up to the installed cost, after upkeep.</p>
        </div>
      </div>
      <div className="grid gap-4 border-t border-line bg-paper/60 p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <p className="text-sm text-ink-soft">
            Average bill today <strong className="text-ink">{peso(s.monthlyBillAvgPhp)}</strong>, about{" "}
            <strong className="text-forest-deep">{peso(remaining)}</strong> with solar in year one.
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sun to-lime"
              style={{ width: `${Math.min(100, Math.round(s.billSavingsRatio * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            About {Math.round(s.billSavingsRatio * 100)}% lower. Based on your total bill ÷ kWh, so fixed charges are treated as
            reducible; the real reduction may be smaller.
          </p>
        </div>
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-forest">
            <Panel className="h-5 w-5" />
          </span>
          <p className="text-sm text-ink-soft">
            A <strong className="text-ink">{num(s.capacityKwp, 1)} kWp</strong> system would generate about{" "}
            <strong className="text-ink">{Math.round(s.generationRatio * 100)}% of your yearly electricity use</strong>{" "}
            ({num(result.base.annualProductionKwh)} kWh a year).
          </p>
        </div>
      </div>
    </section>
  );
}

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="accordion group rounded-2xl border border-line bg-white px-5" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink hover:text-forest">
        {title}
        <span className="accordion-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-lg leading-none text-forest" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/** Supporting detail, all in accessible disclosures so the headline stays clear. */
export function ResultDetails({ result, showCashflow = true }: { result: AssessmentResult; showCashflow?: boolean }) {
  const s = summarizeResult(result);
  const base = result.base;
  const exportInfo = result.exportTreatment;

  return (
    <div className="space-y-3">
      {s.hasSystem ? (
        <Disclosure title="How sure is this estimate?">
          <p className="text-sm text-ink-soft">
            {s.rangeIsSameSize
              ? "All three outcomes use the same system size. They vary only things nobody can know for sure: shading, installed price, how much solar you use directly, and future electricity prices."
              : "This estimate was made with an earlier model, where the three cases also changed the system size. Run a new estimate to see uncertainty for one fixed size."}
          </p>
          <div className="mt-3 table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="table">
              <caption className="sr-only">Estimate range</caption>
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th className="text-right">System</th>
                  <th className="text-right">Avg. monthly savings</th>
                  <th className="text-right">Installed cost</th>
                  <th className="text-right">Payback</th>
                </tr>
              </thead>
              <tbody>
                {result.scenarios.map((scenario) => (
                  <tr key={scenario.name} className={scenario.name === "base" ? "bg-mint/40" : undefined}>
                    <td className={scenario.name === "base" ? "font-semibold text-forest-deep" : undefined}>{scenario.label}</td>
                    <td className="table-num text-right">{num(scenario.capacityKwp, 1)} kWp</td>
                    <td className="table-num text-right">{peso(Math.round(scenario.annualSavingsPhp / 12))}</td>
                    <td className="table-num text-right">{peso(scenario.capexPhp)}</td>
                    <td className="table-num text-right">{paybackText(scenario.paybackYears)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      ) : null}

      {result.sizeOptions && s.hasSystem ? (
        <Disclosure title="Other system sizes">
          <p className="text-sm text-ink-soft">
            Each option uses the most likely assumptions, so only the size changes. Sizes are capped by roof space
            {result.sizing?.roofAreaKnown ? "" : " once you add your roof area"}.
          </p>
          <div className="mt-3 table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="table">
              <caption className="sr-only">System size options</caption>
              <thead>
                <tr>
                  <th>Option</th>
                  <th className="text-right">System</th>
                  <th className="text-right">Solar vs. yearly use</th>
                  <th className="text-right">Avg. monthly savings</th>
                  <th className="text-right">Installed cost</th>
                  <th className="text-right">Payback</th>
                </tr>
              </thead>
              <tbody>
                {result.sizeOptions.map((option) => (
                  <tr key={option.key} className={option.key === "recommended" ? "bg-mint/40" : undefined}>
                    <td className={option.key === "recommended" ? "font-semibold text-forest-deep" : undefined}>
                      {option.label}
                      {option.roofLimited ? <span className="ml-1 text-xs font-normal text-muted">(roof-limited)</span> : null}
                    </td>
                    <td className="table-num text-right">{num(option.capacityKwp, 1)} kWp</td>
                    <td className="table-num text-right">{Math.round(option.generationToUseRatio * 100)}%</td>
                    <td className="table-num text-right">{peso(Math.round(option.annualSavingsPhp / 12))}</td>
                    <td className="table-num text-right">{peso(option.capexPhp)}</td>
                    <td className="table-num text-right">{paybackText(option.paybackYears)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      ) : null}

      <Disclosure title="What happens to extra solar power">
        <p className="text-sm text-ink-soft">
          Your answer: <strong className="text-ink">{EXPORT_CHOICE_LABEL[result.systemType] ?? result.systemType}</strong>.{" "}
          {exportInfo?.note ??
            (result.systemType === "net_metering"
              ? "Exported power was credited at an assumed 55% of the retail rate. Actual crediting depends on your utility."
              : "No credit was counted for exported power.")}
        </p>
        {exportInfo?.netMeteringUpsidePhp ? (
          <p className="mt-2 rounded-xl bg-mint/50 px-3 py-2 text-sm text-forest-deep">
            If net-metering is approved, first-year savings could be about {peso(exportInfo.netMeteringUpsidePhp)} higher
            (about {peso(Math.round(exportInfo.netMeteringUpsidePhp / 12))} a month on average).
          </p>
        ) : null}
        {s.hasSystem ? (
          <p className="mt-2 text-xs text-muted">
            About {Math.round(base.selfConsumptionRatio * 100)}% of the solar power would be used directly at the property.
          </p>
        ) : null}
      </Disclosure>

      {s.hasSystem ? (
        <Disclosure title="Advanced figures">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Net value over 25 years", peso(base.net25yPhp), "Total savings minus installed cost and upkeep, not discounted (future pesos)."],
              ["Net present value (8%)", peso(base.npvPhp), "The same, discounted at 8% a year."],
              ["Levelised cost of solar power", `₱${num(base.lcoePhpPerKwh, 2)}/kWh`, "Discounted lifetime cost ÷ discounted lifetime production."],
              ["Your electricity rate", `₱${num(result.effectiveTariffPhpPerKwh, 2)}/kWh`, "Bill total ÷ kWh used."],
              ["Solar vs. yearly use", `${Math.round(generationRatio(base) * 100)}%`, "Energy generated ÷ energy used. Not a bill percentage."],
              ["CO₂ avoided", `${num(base.co2TonnesPerYear, 1)} t a year`, "Indicative grid average."],
            ].map(([label, value, help]) => (
              <div key={label} className="rounded-xl border border-line-soft bg-paper/50 p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
                <dd className="mt-0.5 text-xs text-muted">{help}</dd>
              </div>
            ))}
          </dl>
          {showCashflow ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-ink">Cumulative cashflow, most likely outcome</p>
              <CashflowChart cashflows={base.cashflows} />
            </div>
          ) : null}
        </Disclosure>
      ) : null}

      <Disclosure title="Assumptions and limits">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <caption className="sr-only">Model assumptions</caption>
            <tbody>
              {result.assumptions.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="text-muted">{row.label}</th>
                  <td className="table-num text-right font-medium text-ink">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-ink-soft">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <Alert className="mt-0.5 h-4 w-4 shrink-0 text-clay" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
          {result.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{result.disclaimer}</p>
      </Disclosure>
    </div>
  );
}

export function NextActionCard({
  title,
  body,
  action,
  tone = "sun",
}: {
  title: string;
  body: string;
  action: React.ReactNode;
  tone?: "sun" | "forest";
}) {
  return (
    <section
      aria-label="Next step"
      className={`flex flex-col gap-4 rounded-[1.5rem] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
        tone === "forest" ? "bg-forest-deep text-white" : "border border-[#f5d68a] bg-sun-soft"
      }`}
    >
      <div className="flex gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === "forest" ? "bg-white/10 text-sun" : "bg-white text-sun-deep"}`}>
          {tone === "forest" ? <Bolt className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
        </span>
        <div>
          <p className={`font-semibold ${tone === "forest" ? "text-white" : "text-ink"}`}>{title}</p>
          <p className={`mt-0.5 text-sm ${tone === "forest" ? "text-[#d6ead0]" : "text-ink-soft"}`}>{body}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}
