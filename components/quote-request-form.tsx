"use client";

import { PreservingForm } from "@/components/preserving-form";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createQuoteRequestAction } from "@/app/actions/quotes";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Check, Shield } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

export interface ProviderOption {
  id: string;
  businessName: string;
  areas: string[];
  matchLabel: string;
  yearsExperience: number | null;
  about: string | null;
  slug: string;
  isDemo?: boolean;
}

export function QuoteRequestForm({
  assessmentId,
  providers,
  maxProviders,
  city,
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  assessmentId: string;
  providers: ProviderOption[];
  maxProviders: number;
  city: string;
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createQuoteRequestAction, null);
  const [share, setShare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const atLimit = selected.length >= maxProviders;

  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper px-4 py-5 text-sm">
        <p className="font-semibold text-ink">No verified provider covers {city} yet</p>
        <p className="mt-1 text-ink-soft">
          We only list providers whose service areas include your city, province or region, and whose business documents
          we have reviewed. Your estimate stays saved here.
        </p>
        <ul className="mt-3 space-y-1.5 text-ink-soft">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Check that your city and province are correct on your property details.</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Come back later: new providers are reviewed during the pilot.</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> Share your estimate (print or save as PDF) with an installer you already know.</li>
        </ul>
        <Link href="/installers" className="btn btn-secondary btn-sm mt-4">See all verified providers</Link>
      </div>
    );
  }

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, id].slice(0, maxProviders) : current.filter((x) => x !== id)));

  return (
    <PreservingForm action={action} className="space-y-5">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}

      <fieldset aria-describedby="provider-count provider-help">
        <legend className="label">Choose providers to ask for a quote</legend>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p id="provider-count" className="text-sm text-ink-soft" aria-live="polite">
            <strong className="text-ink">{selected.length}</strong> of {maxProviders} selected
          </p>
          {atLimit ? <span className="badge badge-warn">Limit reached</span> : null}
        </div>
        <div className="space-y-2">
          {providers.map((provider) => {
            const checked = selected.includes(provider.id);
            return (
              <label key={provider.id} className={`choice choice-row !items-start ${!checked && atLimit ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  name="installerIds"
                  value={provider.id}
                  checked={checked}
                  disabled={!checked && atLimit}
                  onChange={(event) => toggle(provider.id, event.target.checked)}
                />
                <span className="choice-mark" aria-hidden="true"><Check className="h-3 w-3" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{provider.businessName}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="badge badge-good">{provider.matchLabel}</span>
                    <span className="badge">Documents reviewed</span>
                    {provider.yearsExperience != null ? <span className="badge badge-neutral">{provider.yearsExperience} yrs in business</span> : null}
                    {provider.isDemo ? <span className="badge badge-neutral">Demo listing</span> : null}
                  </span>
                  <span className="mt-1.5 block text-xs text-muted">Covers: {provider.areas.slice(0, 6).join(", ")}</span>
                  {provider.about ? <span className="mt-1 block text-xs text-ink-soft line-clamp-2">{provider.about}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        <p id="provider-help" className="help">
          “Documents reviewed” means an admin checked business registration and permits. It is not an endorsement,
          warranty or engineering certification.
        </p>
        {state?.fieldErrors?.installerIds ? <p className="field-error">{state.fieldErrors.installerIds}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="message" className="label">Message to providers <span className="font-normal text-muted">(optional)</span></label>
        <textarea
          id="message"
          name="message"
          className="textarea"
          maxLength={1000}
          placeholder="For example: we may install in phases and want to understand roof mounting options."
        />
      </div>

      <div className="rounded-2xl border border-line bg-paper p-4">
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="shareContact"
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#12601c]"
          />
          <span>
            <strong className="text-ink">Share my contact details with the providers I selected</strong>
            <span className="mt-0.5 block text-xs text-muted">
              Until you tick this, providers see your city, roof profile and estimate, not your name, email or phone.
            </span>
          </span>
        </label>

        {share ? (
          <div className="view-enter mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="contactName" className="label">Contact name</label>
              <input id="contactName" name="contactName" className="input" defaultValue={defaultName} autoComplete="name" required />
              {state?.fieldErrors?.contactName ? <p className="field-error">{state.fieldErrors.contactName}</p> : null}
            </div>
            <div>
              <label htmlFor="contactPhone" className="label">Phone</label>
              <input id="contactPhone" name="contactPhone" type="tel" className="input" defaultValue={defaultPhone} autoComplete="tel" placeholder="+63 9xx xxx xxxx" required />
            </div>
            <div>
              <label htmlFor="contactEmail" className="label">Email</label>
              <input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={defaultEmail} autoComplete="email" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn btn-primary" pendingText="Sending request…">
          {selected.length > 0 ? `Request ${selected.length} quote${selected.length === 1 ? "" : "s"}` : "Request quotes"}
        </SubmitButton>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Shield className="h-3.5 w-3.5" /> Consent is recorded for this request only
        </span>
      </div>
    </PreservingForm>
  );
}
