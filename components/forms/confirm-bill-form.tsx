"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState } from "react";
import { confirmBillAction } from "@/app/actions/sites";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";
import type { BillRow } from "@/lib/types";
import type { BillIssue } from "@/lib/bills";

function Flag({ issues, field }: { issues: BillIssue[]; field: string }) {
  const issue = issues.find((i) => i.field === field);
  if (!issue) return null;
  return (
    <p id={`${field}-flag`} className={`mt-1 flex gap-1.5 text-xs font-medium ${issue.level === "missing" ? "text-clay" : "text-[#6b4708]"}`}>
      <Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {issue.message}
    </p>
  );
}

export function ConfirmBillForm({ bill, issues = [] }: { bill: BillRow; issues?: BillIssue[] }) {
  const [state, action] = useActionState<ActionState, FormData>(confirmBillAction, null);
  const flagged = (field: string) =>
    issues.some((i) => i.field === field)
      ? { "aria-describedby": `${field}-flag`, className: "input !border-[#e0a33a] !bg-[#fffaf0]" }
      : { className: "input" };

  return (
    <PreservingForm action={action} className="space-y-4" noValidate>
      <input type="hidden" name="billId" value={bill.id} />
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="provider" className="label">Utility provider</label>
          <input id="provider" name="provider" className="input" defaultValue={bill.provider} required />
        </div>
        <div>
          <label htmlFor="periodStart" className="label">Billing period start</label>
          <input id="periodStart" name="periodStart" type="date" className="input" defaultValue={bill.billing_period_start?.slice(0, 10) ?? ""} />
        </div>
        <div>
          <label htmlFor="periodEnd" className="label">Billing period end</label>
          <input id="periodEnd" name="periodEnd" type="date" {...flagged("periodEnd")} defaultValue={bill.billing_period_end?.slice(0, 10) ?? ""} />
          <Flag issues={issues} field="periodEnd" />
        </div>
        <div>
          <label htmlFor="monthlyKwh" className="label">Consumption (kWh)</label>
          <input id="monthlyKwh" name="monthlyKwh" type="number" inputMode="decimal" min={20} step={0.01} {...flagged("monthlyKwh")} defaultValue={bill.monthly_kwh || ""} required />
          <Flag issues={issues} field="monthlyKwh" />
        </div>
        <div>
          <label htmlFor="totalPhp" className="label">Total amount due (₱)</label>
          <input id="totalPhp" name="totalPhp" type="number" inputMode="decimal" min={100} step={0.01} {...flagged("totalPhp")} defaultValue={bill.total_php || ""} required />
          <Flag issues={issues} field="totalPhp" />
        </div>
        <div>
          <label htmlFor="generationChargePhp" className="label">Generation charge (₱, optional)</label>
          <input id="generationChargePhp" name="generationChargePhp" type="number" inputMode="decimal" min={0} step={0.01} {...flagged("generationChargePhp")} defaultValue={bill.generation_charge_php ?? ""} />
          <Flag issues={issues} field="generationChargePhp" />
        </div>
        <div>
          <label htmlFor="fixedChargesPhp" className="label">Fixed charges (₱, optional)</label>
          <input id="fixedChargesPhp" name="fixedChargesPhp" type="number" min={0} step={0.01} className="input" defaultValue={bill.fixed_charges_php ?? ""} />
        </div>
      </div>
      <SubmitButton className="btn btn-primary">Confirm bill values</SubmitButton>
      <p className="text-xs text-muted">Confirm only after checking the values against your bill. You can edit them here.</p>
    </PreservingForm>
  );
}
