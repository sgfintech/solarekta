import Link from "next/link";
import type { Metadata } from "next";
import { ASSUMPTIONS, EXPORT_CONFIG, MODEL_VERSION, RECOMMENDED_TARGET_SHARE, SCENARIO_PARAMS, SIZE_OPTIONS } from "@/lib/solar/assumptions";
import { ArrowRight, Battery, Bolt, Check, Inverter, Panel } from "@/components/icons";

export const metadata: Metadata = {
  title: "How the estimate works",
  description:
    "The deterministic solar and finance model behind SOLARekta: sizing, production, self-consumption, tariffs, degradation, maintenance and payback.",
};

export default function HowItWorksPage() {
  return (
    <div className="shell max-w-5xl py-14 md:py-20">
      <p className="eyebrow">Methodology</p>
      <h1 className="display-xl mt-3 max-w-3xl text-forest-deep">The maths behind your estimate.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-soft">
        Every peso and every kWh is produced by a fixed, versioned model. No language model decides your savings. This
        page is the plain-language version; the code and unit tests are the source of truth.
      </p>

      <section aria-labelledby="parts" className="mt-12">
        <h2 id="parts" className="text-2xl text-forest-deep">What a rooftop system is made of</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Four parts matter for the estimate. Installers quote each one separately, so you can compare like for like.
        </p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Panel, title: "Solar panels", body: "Turn sunlight into DC electricity. Size is measured in kWp." },
            { icon: Inverter, title: "Inverter", body: "Converts DC to the AC your appliances use, and manages the system." },
            { icon: Battery, title: "Battery (optional)", body: "Stores daytime surplus for evening use. Not included in our estimate; installers can quote it." },
            { icon: Bolt, title: "Net meter", body: "Measures what you export, where your utility approves net-metering." },
          ].map((part, index) => (
            <li key={part.title} className="reveal relative rounded-2xl border border-line bg-white p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-forest">
                <part.icon className="h-6 w-6" />
              </span>
              {index < 3 ? (
                <span className="absolute -right-3 top-10 hidden h-0.5 w-6 bg-lime lg:block" aria-hidden="true" />
              ) : null}
              <h3 className="mt-4 text-base text-forest-deep">{part.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{part.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="prose-copy mt-12 max-w-3xl">
        <h2>1. We start from your consumption</h2>
        <p>
          Your annual consumption is the monthly kWh from your bill multiplied by twelve. Your effective tariff is the
          total bill divided by the kWh. If the result falls outside ₱6–₱25/kWh, the assessment warns you that the input
          may be wrong instead of pretending to be precise.
        </p>

        <h2>2. We size within physical limits</h2>
        <p>
          We recommend a system that would generate about {Math.round(RECOMMENDED_TARGET_SHARE * 100)}% of your annual
          electricity use, then cap it at what your roof can hold. Usable roof area is{" "}
          {Math.round(ASSUMPTIONS.usableRoofFactor * 100)}% of the area you enter, adjusted for roof material (
          {Math.round(ASSUMPTIONS.roofTypeUsableFactor.tile * 100)}% for tile,{" "}
          {Math.round(ASSUMPTIONS.roofTypeUsableFactor.asbestos * 100)}% for asbestos), at {ASSUMPTIONS.areaPerKwpM2} m² per
          kWp. The final size never exceeds your roof. If the roof supports less than {ASSUMPTIONS.minimumPracticalKwp} kWp,
          we tell you instead of forcing a minimum size. If you don&apos;t know your roof area, we show a preliminary
          estimate that is clearly marked as not checked against roof space.
        </p>

        <h2>3. Production uses a city yield</h2>
        <p>
          We multiply installed capacity by a city-level specific yield (kWh per kWp per year) and a shading factor.
          The table is an indicative planning dataset. It is deliberately rounded and does not replace an on-site
          irradiance or shading study. When a city is missing, we use the national planning average and flag lower
          confidence.
        </p>

        <h2>4. Self-consumption and export</h2>
        <p>
          Not every kWh you generate is a kWh you avoid buying. We estimate the share used on site from your daytime
          usage answer. You tell us what happens to extra solar power. With net-metering we <strong>assume</strong> surplus is
          credited at {Math.round(EXPORT_CONFIG.netMeteringCreditRatioOfRetail * 100)}% of your average retail rate, an
          approximation of the generation charge ({EXPORT_CONFIG.version}). This is not a published utility tariff. With
          zero export, surplus earns nothing. If you choose &ldquo;Not sure&rdquo;, we count no export credit and show
          how much higher savings could be if net-metering is approved.
        </p>

        <h2>5. Twenty-five year cashflow</h2>
        <p>
          Year one savings are self-consumed kWh × tariff plus eligible export credit. Over 25 years we apply{" "}
          {ASSUMPTIONS.degradationPerYear * 100}% annual panel degradation, 2–4% tariff escalation depending on
          scenario,{" "}
          {ASSUMPTIONS.maintenanceRateOfCapex * 100}% annual maintenance from year two, and an inverter replacement in
          year {ASSUMPTIONS.inverterReplacementYear} at{" "}
          {Math.round(ASSUMPTIONS.inverterCostRateOfCapex * 100)}% of installed cost. NPV uses an{" "}
          {ASSUMPTIONS.discountRate * 100}% discount rate. The levelised cost of energy (LCOE) divides discounted lifetime
          costs by discounted lifetime production, so both use the same {ASSUMPTIONS.discountRate * 100}% rate.
        </p>

        <h2>6. Uncertainty and size choices are shown separately</h2>
        <p>
          The lower, most likely and higher outcomes keep the <strong>same system size</strong> and vary only things we
          can&apos;t know for sure: shading, installed price, how much solar you use directly, and future tariff
          increases. Alternative system sizes are shown separately, all at the most likely assumptions.
        </p>
        <div className="not-prose my-5 table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table card">
            <caption className="sr-only">Uncertainty assumptions by outcome</caption>
            <thead>
              <tr className="bg-paper-deep/60">
                <th>Uncertain input</th>
                <th className="text-right">{SCENARIO_PARAMS.low.label}</th>
                <th className="text-right">{SCENARIO_PARAMS.base.label}</th>
                <th className="text-right">{SCENARIO_PARAMS.high.label}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Shading factor</td><td className="text-right">{Math.round(SCENARIO_PARAMS.low.shadingFactor * 100)}%</td><td className="text-right">{Math.round(SCENARIO_PARAMS.base.shadingFactor * 100)}%</td><td className="text-right">{Math.round(SCENARIO_PARAMS.high.shadingFactor * 100)}%</td></tr>
              <tr><td>Installed cost / kWp</td><td className="text-right">₱{SCENARIO_PARAMS.low.costPerKwpPhp.toLocaleString("en-PH")}</td><td className="text-right">₱{SCENARIO_PARAMS.base.costPerKwpPhp.toLocaleString("en-PH")}</td><td className="text-right">₱{SCENARIO_PARAMS.high.costPerKwpPhp.toLocaleString("en-PH")}</td></tr>
              <tr><td>Direct solar use</td><td className="text-right">{Math.round(SCENARIO_PARAMS.low.selfConsumptionFactor * 100)}%</td><td className="text-right">{Math.round(SCENARIO_PARAMS.base.selfConsumptionFactor * 100)}%</td><td className="text-right">{Math.round(SCENARIO_PARAMS.high.selfConsumptionFactor * 100)}%</td></tr>
              <tr><td>Tariff escalation</td><td className="text-right">{Math.round(SCENARIO_PARAMS.low.tariffEscalation * 100)}%/yr</td><td className="text-right">{Math.round(SCENARIO_PARAMS.base.tariffEscalation * 100)}%/yr</td><td className="text-right">{Math.round(SCENARIO_PARAMS.high.tariffEscalation * 100)}%/yr</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Size options: {SIZE_OPTIONS.smaller.label.toLowerCase()} ({Math.round(SIZE_OPTIONS.smaller.targetShare * 100)}% of
          annual use), {SIZE_OPTIONS.recommended.label.toLowerCase()} ({Math.round(SIZE_OPTIONS.recommended.targetShare * 100)}
          %) and {SIZE_OPTIONS.larger.label.toLowerCase()} ({Math.round(SIZE_OPTIONS.larger.targetShare * 100)}%), each capped
          by roof space. Assessments made with an earlier model keep their original figures and are labelled as such.
        </p>

        <h2>7. Where AI is used — and where it is not</h2>
        <p>
          AI may extract text from a bill image and write a short plain-language explanation. Its output is validated
          against a strict schema and shown to you for correction. It cannot set prices, production, payback, installer
          verification or engineering design. If the AI provider is unavailable, the product keeps working with manual
          entry and a deterministic explanation.
        </p>

        <h2>8. What the estimate cannot tell you</h2>
        <ul>
          <li>Whether your roof structure is sound — a licensed engineer or installer must inspect it.</li>
          <li>Your exact future tariff, export credits or net-metering eligibility.</li>
          <li>Final permit, utility interconnection or government approval outcomes.</li>
          <li>The final price — that comes from an installer’s written, itemised quote.</li>
        </ul>

        <div className="not-prose mt-8 rounded-2xl border border-line bg-[#ffffff] p-5">
          <p className="text-sm text-ink-soft">
            <strong>Model version {MODEL_VERSION}.</strong> Stored assessments keep the version that produced them, so
            an older estimate never silently changes. A change to any constant or formula requires a version bump and
            updated tests.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/estimate" className="btn btn-primary">Try it with my bill <ArrowRight /></Link>
            <Link href="/safety" className="btn btn-secondary">Safety &amp; data</Link>
          </div>
        </div>

        <h2>Quality gates</h2>
        <ul>
          <li className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-leaf" /> Unit tests cover the engine, validation, authorization helpers and quote calculations.</li>
          <li className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-leaf" /> Typecheck, lint and production build are part of the release check.</li>
          <li className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-leaf" /> Synthetic demo data only — no real customer bills in fixtures.</li>
        </ul>
      </div>
    </div>
  );
}
