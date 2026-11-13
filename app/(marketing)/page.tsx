import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bill, Bolt, Check, Roof, Shield, SunIcon, XMark } from "@/components/icons";
import { EnergyFlowIllustration } from "@/components/illustrations/energy-flow";
import { LogoMark } from "@/components/logo";
import { listCatalogue } from "@/lib/marketplace-data";
import { ProductCard } from "@/components/marketplace/product-card";
import { Battery, Inverter, Panel } from "@/components/icons";

export const metadata: Metadata = {
  title: "Solar estimates you can actually understand",
};

const steps = [
  {
    title: "Start with your real bill",
    body: "Upload a bill or type the kWh and amount yourself. We use your actual consumption, not a national average.",
    icon: Bill,
  },
  {
    title: "See the numbers behind the number",
    body: "A deterministic engine models low, base and high cases for production, savings and payback, with every assumption listed.",
    icon: SunIcon,
  },
  {
    title: "Compare installer bids",
    body: "Send your assessment to verified installers and compare capacity, price, warranty, exclusions and timeline side by side.",
    icon: Roof,
  },
];

const neverDo = [
  "Guarantee savings or payback",
  "Claim a roof is structurally sound from a photo",
  "Invent installer verification badges",
  "Promise DOE, ERC or utility approval",
  "Share your number with every installer",
  "Hide the assumptions behind a score",
];

const faqs = [
  {
    q: "Is the estimate a quotation?",
    a: "No. It is a planning scenario built from your bill, roof area and a versioned yield table. Only a licensed installer’s site survey and written quotation can price your actual system.",
  },
  {
    q: "Can AI change my savings figure?",
    a: "No. AI may read a bill or explain a result, but production, cost and savings come from fixed, tested formulas. Every AI extraction is shown for you to correct before it is used.",
  },
  {
    q: "How are installers verified?",
    a: "We manually review business registration, a mayor’s permit or equivalent, and the credentials supplied for review. Verification is not an endorsement, warranty or engineering certification.",
  },
  {
    q: "When do installers see my contact details?",
    a: "Only when you tick the consent box on a quote request. Until then they see the site profile and assessment without your name, email or phone number.",
  },
  {
    q: "What if I have a PDF bill?",
    a: "You can upload it privately for your records and type the kWh and total yourself. Everything works without AI or a PDF reader.",
  },
];

/** Featured products are a nice-to-have: if the catalogue can't be read, the home page still renders. */
function featuredProducts() {
  try {
    return listCatalogue()
      .filter((p) => p.category === "panel" || p.category === "inverter" || p.category === "battery")
      .slice(0, 3);
  } catch (error) {
    console.error("[home] Could not load featured equipment; rendering without it.", error);
    return [];
  }
}

export default function HomePage() {
  const featured = featuredProducts();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 sun-arc" aria-hidden="true" />
        <div className="shell relative grid items-center gap-10 py-12 md:grid-cols-[1fr_1.05fr] md:py-20 lg:gap-14 lg:py-24">
          <div className="intro">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#f5d68a] bg-sun-soft px-3 py-1 text-sm font-semibold text-[#6b4708]">
              <SunIcon className="h-4 w-4 text-sun-deep" /> Philippine rooftop solar pilot
            </p>
            <h1 className="display-xl mt-5 text-forest-deep">Your bill in. A clear solar plan out.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
              SOLARekta reads your electricity bill, models what a rooftop system could realistically save, and connects
              you directly with verified installers. Rekta sa punto, walang paligoy-ligoy.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/estimate" className="btn btn-primary">
                Get my free estimate <ArrowRight />
              </Link>
              <Link href="/how-it-works" className="btn btn-secondary">
                See how the maths works
              </Link>
            </div>
            <ul className="mt-8 grid gap-2.5 text-sm text-ink-soft sm:grid-cols-2">
              {[
                "No savings guarantees, ever",
                "Bills stay private and access-logged",
                "Every assumption is visible",
                "Contact details shared only with consent",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-mint text-leaf">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <figure className="relative">
            <div className="rounded-[1.75rem] border border-line bg-white/80 p-3 shadow-lift sm:p-5">
              <EnergyFlowIllustration className="h-auto w-full" />
            </div>
            <figcaption className="mt-3 px-2 text-center text-xs text-muted">
              How a rooftop system powers your home. Export to the grid depends on your utility approving net-metering.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-line bg-white">
        <div className="shell grid gap-6 py-8 sm:grid-cols-3">
          {[
            { icon: Bolt, title: "Deterministic engine", body: "Versioned formulas and unit-tested assumptions." },
            { icon: Shield, title: "Consent-based sharing", body: "Installers see your contact only when you say so." },
            { icon: Roof, title: "Direct to installers", body: "Quotes come straight from the installer, in the same format." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-forest">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">{item.title}</p>
                <p className="text-sm text-muted">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Steps: a real sequence, so numbered */}
      <section className="shell py-16 md:py-24" id="how">
        <div className="max-w-2xl">
          <h2 className="display-lg text-forest-deep">From your bill to comparable bids, in three steps.</h2>
          <p className="mt-4 text-ink-soft">
            AI can help read a bill and explain the result. It never sets prices, production figures or engineering
            design. Those come from a deterministic engine you can inspect.
          </p>
        </div>
        <ol className="relative mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
          <div
            className="pointer-events-none absolute left-6 right-6 top-6 hidden h-0.5 bg-gradient-to-r from-sun via-lime to-forest md:block"
            aria-hidden="true"
          />
          {steps.map((step, index) => (
            <li key={step.title} className="reveal relative">
              <div className="flex items-center gap-3">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-white text-forest shadow-soft">
                  <step.icon className="h-6 w-6" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-sun text-xs font-bold text-forest-deep">
                    {index + 1}
                  </span>
                </span>
              </div>
              <h3 className="mt-5 text-xl text-forest-deep">{step.title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/estimate" className="btn btn-primary mt-10">
          Start with my bill <ArrowRight />
        </Link>
      </section>

      {/* Scenarios */}
      <section className="border-y border-line bg-paper-deep/70">
        <div className="shell grid gap-10 py-16 md:grid-cols-[0.9fr_1.1fr] md:items-center md:py-20">
          <div>
            <h2 className="display-lg text-forest-deep">Solar is a range, not a single promise.</h2>
            <p className="mt-4 text-ink-soft">
              We show a conservative, base and optimistic case side by side, including panel degradation, maintenance
              and inverter replacement over 25 years.
            </p>
            <Link href="/how-it-works" className="btn btn-secondary mt-6">
              Read the methodology <ArrowRight />
            </Link>
          </div>
          <div className="reveal card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-sm font-semibold text-ink">Example scenarios</p>
              <span className="badge badge-warn">Illustrative</span>
            </div>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
              <table className="table">
                <caption className="sr-only">Illustrative comparison of solar scenarios</caption>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th className="hidden text-right sm:table-cell">System</th>
                    <th className="text-right"><span className="sm:hidden">Year 1</span><span className="hidden sm:inline">Year-one savings</span></th>
                    <th className="text-right">Payback</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Conservative<span className="block text-xs text-muted sm:hidden">4.3 kWp</span></td>
                    <td className="table-num hidden whitespace-nowrap text-right sm:table-cell">4.3 kWp</td>
                    <td className="table-num text-right">₱44,900</td>
                    <td className="table-num whitespace-nowrap text-right">7.8 yrs</td>
                  </tr>
                  <tr className="bg-mint/50">
                    <td className="font-semibold text-forest-deep">Base case<span className="block text-xs font-normal text-muted sm:hidden">6.0 kWp</span></td>
                    <td className="table-num hidden whitespace-nowrap text-right sm:table-cell font-semibold">6.0 kWp</td>
                    <td className="table-num text-right font-semibold">₱62,400</td>
                    <td className="table-num whitespace-nowrap text-right font-semibold">5.6 yrs</td>
                  </tr>
                  <tr>
                    <td>Optimistic<span className="block text-xs text-muted sm:hidden">7.7 kWp</span></td>
                    <td className="table-num hidden whitespace-nowrap text-right sm:table-cell">7.7 kWp</td>
                    <td className="table-num text-right">₱78,100</td>
                    <td className="table-num whitespace-nowrap text-right">4.5 yrs</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              Illustrative figures for a Quezon City home using 900 kWh/month at ₱11.50/kWh. Not a quotation.
            </p>
          </div>
        </div>
      </section>

      {/* Commitments + installers */}
      <section className="shell py-16 md:py-24">
        <div className="grid gap-5 md:grid-cols-3">
          <div className="card card-pad md:col-span-2">
            <h2 className="display-md text-forest-deep">What we will never do</h2>
            <ul className="mt-5 grid gap-3 text-sm text-ink-soft sm:grid-cols-2">
              {neverDo.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f9e0d8] text-clay">
                    <XMark className="h-2.5 w-2.5" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest p-6 text-white md:p-7">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime/25 blur-2xl" aria-hidden="true" />
            <p className="relative text-sm font-semibold text-[#cdeab5]">For installers</p>
            <h2 className="display-md relative mt-2">Opted-in leads. Structured bids.</h2>
            <p className="relative mt-3 text-sm text-[#d6ead0]">
              Apply for verification, receive customers who asked for quotes, and submit itemised proposals directly.
            </p>
            <Link href="/installers" className="btn btn-sun relative mt-6 w-full">
              Apply to join <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* Ask Solar AI */}
      <section className="shell py-16 md:py-20" aria-labelledby="advisor-heading">
        <div className="grid gap-8 rounded-[1.75rem] border border-line bg-white p-6 shadow-soft md:grid-cols-[1fr_1.05fr] md:items-center md:p-10">
          <div>
            <p className="eyebrow">Ask Solar AI</p>
            <h2 id="advisor-heading" className="display-md mt-2 text-forest-deep">Is that battery price fair? Check before you pay.</h2>
            <p className="mt-4 max-w-lg text-ink-soft">
              Ask about any battery, inverter or panel. You get observed prices from verified supplier listings, never prices made up by AI.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
              {["Exact matches kept apart from near alternatives", "Capacity calculated, e.g. 51.2 V × 300 Ah = 15.36 kWh", "Supplier, source and date checked on every price"].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-paper p-5 md:p-6">
            <form action="/advisor" method="get" role="search" aria-label="Ask Solar AI">
              <label htmlFor="home-advisor-q" className="label">Ask about solar equipment or prices</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="home-advisor-q" name="q" required minLength={3} maxLength={500} className="input flex-1" placeholder="e.g. 51.2V 300Ah LiFePO4 battery price" />
                <button type="submit" className="btn btn-primary">Check price <ArrowRight /></button>
              </div>
            </form>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Try</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Price of a 5 kW hybrid inverter", "550W solar panel price", "Will the IB-5.1 work with the KH-6K?"].map((q) => (
                <Link key={q} href={`/advisor?q=${encodeURIComponent(q)}`} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-3.5 text-sm text-forest-deep transition-colors hover:border-forest hover:bg-mint">
                  {q}
                </Link>
              ))}
            </div>
            <Link href="/advisor/quote" className="link-action mt-4 text-sm">Already have a quotation? Review it privately <ArrowRight /></Link>
          </div>
        </div>
      </section>

      {/* Marketplace: three sides */}
      <section className="border-t border-line bg-paper-deep/60">
        <div className="shell py-16 md:py-20">
          <div className="max-w-2xl">
            <h2 className="display-lg text-forest-deep">Buyers, installers and suppliers, in one place</h2>
            <p className="mt-3 text-ink-soft">
              Every company is reviewed before it appears. Every product listing shows who honours the warranty in the
              Philippines.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Panel, title: "Homeowners and businesses", body: "Get an estimate, compare installer quotes on the same fields, and see the exact equipment behind each one.", href: "/estimate", cta: "Get my estimate" },
              { icon: Inverter, title: "Installers", body: "Receive opted-in leads, source from verified suppliers with private trade pricing, and link real products in quotes.", href: "/installers", cta: "For installers" },
              { icon: Battery, title: "Suppliers and distributors", body: "List reviewed products, take order requests from buyers, and answer price requests from verified installers.", href: "/suppliers", cta: "For suppliers" },
            ].map((side) => (
              <div key={side.title} className="reveal flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-forest"><side.icon className="h-6 w-6" /></span>
                <h3 className="mt-4 text-lg text-forest-deep">{side.title}</h3>
                <p className="mt-2 flex-1 text-sm text-ink-soft">{side.body}</p>
                <Link href={side.href} className="link-action mt-4 text-sm">{side.cta} <ArrowRight className="inline h-3.5 w-3.5" /></Link>
              </div>
            ))}
          </div>
          {featured.length ? (
            <div className="mt-12">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h3 className="text-xl text-forest-deep">From the equipment catalogue</h3>
                <Link href="/equipment" className="link-action text-sm">See all equipment</Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((p) => <ProductCard key={p.id} product={p} href={`/equipment/${p.id}`} />)}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-white">
        <div className="shell py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="display-lg text-center text-forest-deep">Before you trust a number</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-ink-soft">The questions people ask us most.</p>
            <div className="mt-8 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper/50">
              {faqs.map((item) => (
                <details key={item.q} className="accordion group px-5">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink hover:text-forest">
                    {item.q}
                    <span
                      className="accordion-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-lg leading-none text-forest"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="shell py-16 md:py-24">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-forest-deep px-6 py-12 text-white md:px-16 md:py-16">
          <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-lime/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-sun/30 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr]">
            <span className="hidden rounded-3xl bg-white p-4 shadow-lift md:block">
              <LogoMark className="h-20 w-auto" />
            </span>
            <div>
              <h2 className="display-lg max-w-2xl">Find out what your roof could offset in about five minutes.</h2>
              <p className="mt-4 max-w-xl text-[#d6ead0]">Free during the pilot. No account needed for your first estimate. No obligation to request a quote.</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/estimate" className="btn btn-sun">
                  Create my free estimate <ArrowRight />
                </Link>
                <Link href="/installers" className="btn border-white/40 text-white hover:bg-white/10">
                  I’m an installer
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
