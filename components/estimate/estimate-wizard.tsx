"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveEstimateStepAction } from "@/app/actions/estimate";
import { Alert, ArrowRight, Check } from "@/components/icons";
import {
  BusinessArt,
  ExportArt,
  HomeArt,
  RoofArt,
  UsageHighArt,
  UsageLowArt,
  UsageMediumArt,
} from "@/components/estimate/choice-art";
import { SOLAR_LOCATIONS } from "@/lib/solar/locations";
import { validateEstimateStep, type EstimateStep, type GuestEstimateData } from "@/lib/validation";

type Values = Record<string, string>;

const STEP_LABELS: Record<EstimateStep, string> = {
  1: "Electricity",
  2: "Your property",
  3: "Roof",
  4: "Extra power",
};

const STEP_FIELDS: Record<EstimateStep, string[]> = {
  1: ["monthlyKwh", "monthlyBillPhp", "utilityProvider"],
  2: ["city", "province", "propertyType", "daytimeUsage"],
  3: ["roofAreaStatus", "roofAreaM2", "roofType"],
  4: ["systemType"],
};

function toValues(data: GuestEstimateData): Values {
  const out: Values = {};
  for (const [key, value] of Object.entries(data)) {
    if (value != null) out[key] = String(value);
  }
  return out;
}

interface Ctx {
  values: Values;
  errors: Record<string, string>;
  set: (name: string, value: string) => void;
}

function FieldError({ ctx, name }: { ctx: Ctx; name: string }) {
  if (!ctx.errors[name]) return null;
  return (
    <p id={`${name}-error`} className="field-error" role="alert">
      <Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {ctx.errors[name]}
    </p>
  );
}

function Radio({
  ctx,
  name,
  value,
  title,
  body,
  art,
  row = false,
}: {
  ctx: Ctx;
  name: string;
  value: string;
  title: string;
  body?: string;
  art?: React.ReactNode;
  row?: boolean;
}) {
  return (
    <label className={`choice ${row ? "choice-row" : ""}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={ctx.values[name] === value}
        onChange={() => ctx.set(name, value)}
        aria-describedby={ctx.errors[name] ? `${name}-error` : undefined}
      />
      <span className="choice-mark" aria-hidden="true">
        <Check className="h-3 w-3" />
      </span>
      {art ? <span className="shrink-0">{art}</span> : null}
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        {body ? <span className="mt-0.5 block text-sm text-muted">{body}</span> : null}
      </span>
    </label>
  );
}

export function EstimateWizard({
  initial,
  initialStep,
  signedInCustomer,
}: {
  initial: GuestEstimateData;
  initialStep: number;
  signedInCustomer: boolean;
}) {
  const [step, setStep] = useState<EstimateStep>(Math.min(Math.max(initialStep, 1), 4) as EstimateStep);
  const [values, setValues] = useState<Values>(() => ({
    propertyType: "residential",
    roofAreaStatus: "known",
    ...toValues(initial),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [provinceTouched, setProvinceTouched] = useState(Boolean(initial.province));
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);

  const focusFirstError = (fieldErrors: Record<string, string>) => {
    const first = STEP_FIELDS[step].find((name) => fieldErrors[name]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
    el?.focus();
  };

  // Move focus to the step heading whenever the step changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const set = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: "" }));
  };

  const onCityChange = (city: string) => {
    set("city", city);
    const match = SOLAR_LOCATIONS.find((l) => l.city.toLowerCase() === city.trim().toLowerCase());
    // Autofill follows the city unless the person typed a province themselves.
    if (!provinceTouched) set("province", match?.province ?? "");
  };

  const submitStep = () => {
    const raw: Record<string, string> = {};
    for (const name of STEP_FIELDS[step]) raw[name] = values[name] ?? "";
    const checked = validateEstimateStep(step, raw);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      requestAnimationFrame(() => focusFirstError(checked.fieldErrors));
      return;
    }
    const fd = new FormData();
    fd.set("step", String(step));
    for (const [name, value] of Object.entries(raw)) fd.set(name, value);
    setServerError(null);
    startTransition(async () => {
      // On the last step the server redirects to the result; otherwise it confirms the save.
      const result = await saveEstimateStepAction(null, fd);
      if (result?.fieldErrors) {
        setErrors(result.fieldErrors);
        requestAnimationFrame(() => focusFirstError(result.fieldErrors ?? {}));
      } else if (result?.error) {
        setServerError(result.error);
      } else if (result?.savedStep) {
        setErrors({});
        setStep(Math.min(result.savedStep + 1, 4) as EstimateStep);
      }
    });
  };

  const fieldProps = (name: string) => ({
    id: name,
    name,
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : `${name}-help`,
  });

  const ctx: Ctx = { values, errors, set };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav aria-label="Estimate progress" className="mb-6">
        <p className="mb-2 text-sm font-semibold text-forest">
          Step {step} of 4 <span className="font-normal text-muted">· {STEP_LABELS[step]}</span>
        </p>
        <ol className="stepper" style={{ ["--steps" as string]: 4 }}>
          {([1, 2, 3, 4] as EstimateStep[]).map((n) => (
            <li key={n} aria-current={n === step ? "step" : undefined}>
              <div className="stepper-bar" data-state={n < step ? "done" : n === step ? "current" : "todo"}>
                <span />
              </div>
              <span className="mt-1.5 hidden text-xs text-muted sm:block">{STEP_LABELS[n]}</span>
            </li>
          ))}
        </ol>
      </nav>

      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submitStep();
        }}
        className="rounded-[1.5rem] border border-line bg-white p-5 shadow-soft sm:p-8"
      >
        {serverError ? (
          <div role="alert" className="alert-error mb-5 flex gap-2">
            <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {serverError}
          </div>
        ) : null}

        <div key={step} className="view-enter">
          {step === 1 ? (
            <section aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-2xl text-forest-deep outline-none">
                Start with your electricity bill
              </h2>
              <p className="mt-2 text-ink-soft">Two numbers from your latest bill are enough for a first estimate.</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="monthlyKwh" className="label">Electricity used (kWh)</label>
                  <input
                    {...fieldProps("monthlyKwh")}
                    type="number"
                    inputMode="decimal"
                    min={20}
                    className="input"
                    placeholder="e.g. 450"
                    value={values.monthlyKwh ?? ""}
                    onChange={(e) => set("monthlyKwh", e.target.value)}
                  />
                  <p id="monthlyKwh-help" className="help">Look for “kWh used” or “consumption”.</p>
                  <FieldError ctx={ctx} name="monthlyKwh" />
                </div>
                <div>
                  <label htmlFor="monthlyBillPhp" className="label">Total amount due (₱)</label>
                  <input
                    {...fieldProps("monthlyBillPhp")}
                    type="number"
                    inputMode="decimal"
                    min={100}
                    className="input"
                    placeholder="e.g. 5,400"
                    value={values.monthlyBillPhp ?? ""}
                    onChange={(e) => set("monthlyBillPhp", e.target.value)}
                  />
                  <p id="monthlyBillPhp-help" className="help">The full amount for that month.</p>
                  <FieldError ctx={ctx} name="monthlyBillPhp" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="utilityProvider" className="label">
                    Electricity provider <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    {...fieldProps("utilityProvider")}
                    className="input"
                    placeholder="Meralco, VECO, a cooperative…"
                    maxLength={60}
                    value={values.utilityProvider ?? ""}
                    onChange={(e) => set("utilityProvider", e.target.value)}
                  />
                  <p id="utilityProvider-help" className="help">Helps installers understand net-metering in your area.</p>
                  <FieldError ctx={ctx} name="utilityProvider" />
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
                <p className="font-semibold text-ink">Prefer to upload a bill photo?</p>
                <p className="mt-0.5">
                  Bill files are processed privately inside your account.{" "}
                  {signedInCustomer ? (
                    <Link href="/app/sites/new" className="font-semibold text-forest underline underline-offset-2">Add your home and upload a bill</Link>
                  ) : (
                    <>
                      <Link href="/login?next=/app/sites/new" className="font-semibold text-forest underline underline-offset-2">Log in</Link> or{" "}
                      <Link href="/signup" className="font-semibold text-forest underline underline-offset-2">create a free account</Link> to upload one.
                    </>
                  )}
                </p>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-2xl text-forest-deep outline-none">
                Tell us about the property
              </h2>
              <p className="mt-2 text-ink-soft">Your city sets how much sun we assume. No street address needed.</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="city" className="label">City or municipality</label>
                  <input
                    {...fieldProps("city")}
                    className="input"
                    list="ph-cities"
                    autoComplete="address-level2"
                    placeholder="Start typing"
                    value={values.city ?? ""}
                    onChange={(e) => onCityChange(e.target.value)}
                  />
                  <datalist id="ph-cities">
                    {SOLAR_LOCATIONS.map((l) => (
                      <option key={l.city} value={l.city}>{l.province}</option>
                    ))}
                  </datalist>
                  <p id="city-help" className="help">Not listed? Type it; we will use a national sun average.</p>
                  <FieldError ctx={ctx} name="city" />
                </div>
                <div>
                  <label htmlFor="province" className="label">
                    Province <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    {...fieldProps("province")}
                    className="input"
                    autoComplete="address-level1"
                    value={values.province ?? ""}
                    onChange={(e) => {
                      setProvinceTouched(e.target.value.trim() !== "");
                      set("province", e.target.value);
                    }}
                  />
                  <p id="province-help" className="help">Filled in from the city when we recognise it.</p>
                  <FieldError ctx={ctx} name="province" />
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="label">This is a…</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Radio ctx={ctx} name="propertyType" value="residential" title="Home" body="House, townhouse or similar" art={<HomeArt />} row />
                  <Radio ctx={ctx} name="propertyType" value="commercial" title="Business" body="Shop, office, small facility" art={<BusinessArt />} row />
                </div>
                <FieldError ctx={ctx} name="propertyType" />
              </fieldset>

              <fieldset className="mt-6">
                <legend className="label">When do you use the most electricity?</legend>
                <p className="help -mt-1 mb-3">Solar makes power in the daytime, so this changes how much you save.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Radio ctx={ctx} name="daytimeUsage" value="low" title="Mostly evenings" body="Out during the day" art={<UsageLowArt />} />
                  <Radio ctx={ctx} name="daytimeUsage" value="medium" title="Day and night" body="Some work or study from home" art={<UsageMediumArt />} />
                  <Radio ctx={ctx} name="daytimeUsage" value="high" title="Mostly daytime" body="Business hours or aircon all day" art={<UsageHighArt />} />
                </div>
                <FieldError ctx={ctx} name="daytimeUsage" />
              </fieldset>
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-2xl text-forest-deep outline-none">
                Your roof
              </h2>
              <p className="mt-2 text-ink-soft">Roof space limits how big a system can be. A rough figure is fine.</p>

              <fieldset className="mt-6">
                <legend className="label">Do you know the available roof area?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Radio ctx={ctx} name="roofAreaStatus" value="known" title="Yes, roughly" row />
                  <Radio ctx={ctx} name="roofAreaStatus" value="unknown" title="I don’t know yet" row />
                </div>
                <FieldError ctx={ctx} name="roofAreaStatus" />
              </fieldset>

              {values.roofAreaStatus === "known" ? (
                <div className="mt-5 max-w-xs">
                  <label htmlFor="roofAreaM2" className="label">Available roof area (m²)</label>
                  <input
                    {...fieldProps("roofAreaM2")}
                    type="number"
                    inputMode="decimal"
                    min={4}
                    className="input"
                    placeholder="e.g. 60"
                    value={values.roofAreaM2 ?? ""}
                    onChange={(e) => set("roofAreaM2", e.target.value)}
                  />
                  <p id="roofAreaM2-help" className="help">Sunny, unshaded roof only. A 10 m × 6 m section is 60 m².</p>
                  <FieldError ctx={ctx} name="roofAreaM2" />
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-[#f5d68a] bg-sun-soft px-4 py-3 text-sm text-[#6b4708]">
                  No problem. We will size the system from your electricity use only and clearly mark that it has not been
                  checked against roof space. You can add the area later.
                </p>
              )}

              <fieldset className="mt-6">
                <legend className="label">Roof type</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Radio ctx={ctx} name="roofType" value="concrete" title="Concrete / flat" art={<RoofArt kind="concrete" />} />
                  <Radio ctx={ctx} name="roofType" value="metal" title="Metal sheet" art={<RoofArt kind="metal" />} />
                  <Radio ctx={ctx} name="roofType" value="tile" title="Tile" art={<RoofArt kind="tile" />} />
                  <Radio ctx={ctx} name="roofType" value="asbestos" title="Asbestos" body="Needs specialist handling" art={<RoofArt kind="asbestos" />} />
                  <Radio ctx={ctx} name="roofType" value="unknown" title="Not sure" art={<RoofArt kind="unknown" />} />
                </div>
                <FieldError ctx={ctx} name="roofType" />
              </fieldset>
            </section>
          ) : null}

          {step === 4 ? (
            <section aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-2xl text-forest-deep outline-none">
                What happens to extra solar power?
              </h2>
              <p className="mt-2 text-ink-soft">
                On sunny afternoons panels can make more than you use. Whether you get credit for it depends on your
                utility.
              </p>
              <fieldset className="mt-6">
                <legend className="sr-only">Extra solar power</legend>
                <div className="grid gap-3">
                  <Radio
                    ctx={ctx}
                    name="systemType"
                    value="net_metering"
                    title="Net-metering"
                    body="Extra power goes to the grid for a bill credit. We assume about 55% of your rate; your utility decides the real figure."
                    art={<ExportArt kind="net_metering" />}
                    row
                  />
                  <Radio
                    ctx={ctx}
                    name="systemType"
                    value="zero_export"
                    title="No export"
                    body="Extra power is not credited. Common when net-metering is not available or not wanted."
                    art={<ExportArt kind="zero_export" />}
                    row
                  />
                  <Radio
                    ctx={ctx}
                    name="systemType"
                    value="not_sure"
                    title="Not sure yet"
                    body="We will count no credit to stay realistic, and show how much more you could save with net-metering."
                    art={<ExportArt kind="not_sure" />}
                    row
                  />
                </div>
                <FieldError ctx={ctx} name="systemType" />
              </fieldset>
            </section>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          {step > 1 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setErrors({});
                setStep((step - 1) as EstimateStep);
              }}
            >
              Back
            </button>
          ) : (
            <span className="hidden text-xs text-muted sm:block">Your answers are saved as you go.</span>
          )}
          <button type="submit" className="btn btn-primary" disabled={pending} aria-live="polite">
            {pending ? (
              <>
                <span className="spinner" aria-hidden="true" /> {step === 4 ? "Calculating…" : "Saving…"}
              </>
            ) : step === 4 ? (
              <>
                See my solar estimate <ArrowRight />
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </button>
        </div>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        We keep these answers for 7 days on our server so you can come back. No name, address or bill file is needed.
      </p>
    </div>
  );
}
