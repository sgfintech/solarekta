"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createSiteAction, updateSiteAction } from "@/app/actions/sites";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Check } from "@/components/icons";
import { BusinessArt, HomeArt, RoofArt, UsageHighArt, UsageLowArt, UsageMediumArt } from "@/components/estimate/choice-art";
import { SOLAR_LOCATIONS } from "@/lib/solar/locations";
import type { ActionState } from "@/lib/action-state";
import type { SiteRow } from "@/lib/types";

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message}
    </p>
  );
}

function Choice({
  name,
  value,
  defaultChecked,
  title,
  body,
  art,
  row,
  onChange,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  title: string;
  body?: string;
  art?: React.ReactNode;
  row?: boolean;
  onChange?: () => void;
}) {
  return (
    <label className={`choice ${row ? "choice-row" : ""}`}>
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} onChange={onChange} />
      <span className="choice-mark" aria-hidden="true"><Check className="h-3 w-3" /></span>
      {art ? <span className="shrink-0">{art}</span> : null}
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        {body ? <span className="mt-0.5 block text-sm text-muted">{body}</span> : null}
      </span>
    </label>
  );
}

export function SiteForm({ site }: { site?: SiteRow }) {
  const action = site ? updateSiteAction : createSiteAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [, startTransition] = useTransition();
  const [province, setProvince] = useState(site?.province ?? "");
  const [provinceTouched, setProvinceTouched] = useState(Boolean(site?.province));
  const [roofStatus, setRoofStatus] = useState<"known" | "unknown">(site?.roof_area_status ?? "known");
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state?.fieldErrors ?? {};

  // Move focus to the first invalid field after a failed submit.
  useEffect(() => {
    const first = Object.keys(state?.fieldErrors ?? {})[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }, [state]);

  const describe = (name: string, help?: string) => ({
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : help,
  });

  return (
    <form
      ref={formRef}
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        // Submit via the handler (not the form action prop) so React keeps what was typed if validation fails.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {site ? <input type="hidden" name="siteId" value={site.id} /> : null}

      {state?.error && Object.keys(errors).length === 0 ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}
      {Object.keys(errors).length > 0 ? (
        <p role="alert" className="alert-error">
          Please fix the highlighted {Object.keys(errors).length === 1 ? "field" : "fields"} below.
        </p>
      ) : null}

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">The property</legend>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Name for this place</label>
            <input id="name" name="name" className="input" defaultValue={site?.name} placeholder="Our home in Quezon City" required {...describe("name")} />
            <ErrorText id="name-error" message={errors.name} />
          </div>
          <div>
            <label htmlFor="city" className="label">City or municipality</label>
            <input
              id="city"
              name="city"
              className="input"
              list="ph-cities"
              autoComplete="address-level2"
              defaultValue={site?.city}
              placeholder="Start typing your city"
              required
              {...describe("city", "city-help")}
              onChange={(event) => {
                const match = SOLAR_LOCATIONS.find((l) => l.city.toLowerCase() === event.target.value.trim().toLowerCase());
                // Follow the city unless the person deliberately typed a province.
                if (!provinceTouched) setProvince(match?.province ?? "");
              }}
            />
            <datalist id="ph-cities">
              {SOLAR_LOCATIONS.map((location) => (
                <option key={location.city} value={location.city}>{location.province}</option>
              ))}
            </datalist>
            <p id="city-help" className="help">Sets how much sun we assume. Not listed? Type it; we use a national average.</p>
            <ErrorText id="city-error" message={errors.city} />
          </div>
          <div>
            <label htmlFor="province" className="label">Province</label>
            <input
              id="province"
              name="province"
              className="input"
              autoComplete="address-level1"
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setProvinceTouched(e.target.value.trim() !== "");
              }}
              placeholder="Metro Manila"
              aria-describedby="province-help"
            />
            <p id="province-help" className="help">Used to match providers who serve your province.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="label">Street address <span className="font-normal text-muted">(optional, private)</span></label>
            <input id="address" name="address" className="input" autoComplete="street-address" defaultValue={site?.address ?? ""} placeholder="Barangay, street, number" aria-describedby="address-help" />
            <p id="address-help" className="help">Never shared automatically. Providers see your city and roof profile only.</p>
          </div>
        </div>
        <fieldset className="mt-5">
          <legend className="label">This is a…</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Choice name="propertyType" value="residential" defaultChecked={(site?.property_type ?? "residential") === "residential"} title="Home" art={<HomeArt className="h-10 w-10" />} row />
            <Choice name="propertyType" value="commercial" defaultChecked={site?.property_type === "commercial"} title="Business" art={<BusinessArt className="h-10 w-10" />} row />
            <Choice name="propertyType" value="industrial" defaultChecked={site?.property_type === "industrial"} title="Industrial" row />
          </div>
        </fieldset>
        <div className="mt-5 max-w-sm">
          <label htmlFor="ownership" className="label">Occupancy</label>
          <select id="ownership" name="ownership" className="select" defaultValue={site?.ownership ?? "owner"}>
            <option value="owner">I own the property</option>
            <option value="tenant">I rent or lease</option>
            <option value="other">Other arrangement</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Roof</legend>
        <fieldset className="mt-4">
          <legend className="label">Do you know the available roof area?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice name="roofAreaStatus" value="known" defaultChecked={roofStatus === "known"} title="Yes, roughly" row onChange={() => setRoofStatus("known")} />
            <Choice name="roofAreaStatus" value="unknown" defaultChecked={roofStatus === "unknown"} title="I don’t know yet" row onChange={() => setRoofStatus("unknown")} />
          </div>
        </fieldset>
        {roofStatus === "known" ? (
          <div className="mt-4 max-w-xs">
            <label htmlFor="roofAreaM2" className="label">Available roof area (m²)</label>
            <input
              id="roofAreaM2"
              name="roofAreaM2"
              type="number"
              inputMode="decimal"
              min={4}
              step={1}
              className="input"
              defaultValue={site && site.roof_area_status === "known" ? site.roof_area_m2 : ""}
              {...describe("roofAreaM2", "roofAreaM2-help")}
            />
            <p id="roofAreaM2-help" className="help">Sunny, unshaded area only. We assume 72% of it is practical for panels.</p>
            <ErrorText id="roofAreaM2-error" message={errors.roofAreaM2} />
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-[#f5d68a] bg-sun-soft px-4 py-3 text-sm text-[#6b4708]">
            Estimates will be marked as not checked against roof space. You will need the area before requesting quotes.
          </p>
        )}
        <fieldset className="mt-5">
          <legend className="label">Roof type</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["concrete", "Concrete / flat"],
                ["metal", "Metal sheet"],
                ["tile", "Tile"],
                ["asbestos", "Asbestos"],
                ["unknown", "Not sure"],
              ] as const
            ).map(([value, title]) => (
              <Choice key={value} name="roofType" value={value} defaultChecked={(site?.roof_type ?? "concrete") === value} title={title} art={<RoofArt kind={value} className="h-10 w-10" />} />
            ))}
          </div>
          <p className="help">Asbestos roofing needs licensed specialist handling before any work.</p>
        </fieldset>
        <div className="mt-5 max-w-xs">
          <label htmlFor="roofAgeYears" className="label">Roof age in years <span className="font-normal text-muted">(optional)</span></label>
          <input id="roofAgeYears" name="roofAgeYears" type="number" min={0} max={100} className="input" defaultValue={site?.roof_age_years ?? ""} />
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Electricity and budget</legend>
        <fieldset className="mt-4">
          <legend className="label">When do you use the most electricity?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Choice name="daytimeUsage" value="low" defaultChecked={site?.daytime_usage === "low"} title="Mostly evenings" art={<UsageLowArt className="h-10 w-10" />} />
            <Choice name="daytimeUsage" value="medium" defaultChecked={(site?.daytime_usage ?? "medium") === "medium"} title="Day and night" art={<UsageMediumArt className="h-10 w-10" />} />
            <Choice name="daytimeUsage" value="high" defaultChecked={site?.daytime_usage === "high"} title="Mostly daytime" art={<UsageHighArt className="h-10 w-10" />} />
          </div>
        </fieldset>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="exportPreference" className="label">What happens to extra solar power?</label>
            <select id="exportPreference" name="exportPreference" className="select" defaultValue={site?.export_preference ?? "not_sure"} aria-describedby="exportPreference-help">
              <option value="not_sure">Not sure yet</option>
              <option value="net_metering">Net-metering (credit for extra power)</option>
              <option value="zero_export">No export (no credit)</option>
            </select>
            <p id="exportPreference-help" className="help">You can change this each time you run an estimate.</p>
          </div>
          <div>
            <label htmlFor="utilityProvider" className="label">Electricity provider <span className="font-normal text-muted">(optional)</span></label>
            <input id="utilityProvider" name="utilityProvider" className="input" defaultValue={site?.utility_provider ?? ""} placeholder="Meralco, VECO, MORE Power…" />
          </div>
          <div>
            <label htmlFor="installBudgetPhp" className="label">One-time installation budget (₱, optional)</label>
            <input
              id="installBudgetPhp"
              name="installBudgetPhp"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              className="input"
              defaultValue={site?.install_budget_php ?? ""}
              placeholder="e.g. 250000"
              {...describe("installBudgetPhp", "installBudgetPhp-help")}
            />
            <p id="installBudgetPhp-help" className="help">What you could spend on the system itself, not your monthly bill.</p>
            <ErrorText id="installBudgetPhp-error" message={errors.installBudgetPhp} />
          </div>
          {site?.monthly_budget_php != null && site.install_budget_php == null ? (
            <p className="self-end rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink-soft">
              You previously entered ₱{site.monthly_budget_php.toLocaleString("en-PH")} as a “monthly electricity budget”. That
              field was unclear, so we no longer use it. Enter an installation budget if you have one.
            </p>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn btn-primary" pendingText="Saving…" pending={pending}>{site ? "Save changes" : "Save my property"}</SubmitButton>
        <a href={site ? `/app/sites/${site.id}` : "/app"} className="btn btn-ghost">Cancel</a>
      </div>
      <p className="text-xs text-muted">
        SOLARekta does not assess structural safety. A licensed installer must inspect the roof before installation.
      </p>
    </form>
  );
}
