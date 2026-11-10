"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState } from "react";
import { createManualBillAction } from "@/app/actions/sites";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";
import type { SiteRow } from "@/lib/types";

export function ManualBillForm({ site }: { site: SiteRow }) {
  const [state, action] = useActionState<ActionState, FormData>(createManualBillAction, null);

  return (
    <PreservingForm action={action} className="space-y-4" noValidate>
      <input type="hidden" name="siteId" value={site.id} />
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="provider" className="label">Utility provider</label>
          <input id="provider" name="provider" className="input" defaultValue={site.utility_provider ?? ""} placeholder="Meralco" required />
        </div>
        <div>
          <label htmlFor="periodStart" className="label">Billing period start</label>
          <input id="periodStart" name="periodStart" type="date" className="input" />
        </div>
        <div>
          <label htmlFor="periodEnd" className="label">Billing period end</label>
          <input id="periodEnd" name="periodEnd" type="date" className="input" />
        </div>
        <div>
          <label htmlFor="monthlyKwh" className="label">Consumption (kWh)</label>
          <input id="monthlyKwh" name="monthlyKwh" type="number" min={20} step={0.01} className="input" placeholder="350" required />
          <p className="help">Find “kWh used” or “consumption” on the bill.</p>
        </div>
        <div>
          <label htmlFor="totalPhp" className="label">Total amount due (₱)</label>
          <input id="totalPhp" name="totalPhp" type="number" min={100} step={0.01} className="input" placeholder="4820.50" required />
        </div>
        <div>
          <label htmlFor="generationChargePhp" className="label">Generation charge (₱, optional)</label>
          <input id="generationChargePhp" name="generationChargePhp" type="number" min={0} step={0.01} className="input" />
        </div>
        <div>
          <label htmlFor="fixedChargesPhp" className="label">Fixed charges (₱, optional)</label>
          <input id="fixedChargesPhp" name="fixedChargesPhp" type="number" min={0} step={0.01} className="input" />
        </div>
      </div>
      <SubmitButton className="btn btn-primary">Save confirmed bill</SubmitButton>
      <p className="text-xs text-muted">
        Use the kWh and total from one billing month. A bill with a reading period longer than a month will distort the estimate.
      </p>
    </PreservingForm>
  );
}
