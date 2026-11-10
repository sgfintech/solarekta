"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { submitInstallerQuoteAction } from "@/app/actions/quotes";
import { SubmitButton } from "@/components/submit-button";
import { Alert, ArrowRight } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";
import { peso } from "@/lib/format";

interface LineItem {
  description: string;
  amount: number;
}

interface QuoteDefaults {
  capacityKwp: number;
  expectedAnnualKwh: number;
  pricePhp?: number;
  warrantyYears?: number;
  workmanshipWarrantyYears?: number;
  timelineWeeks?: number;
  exclusions?: string;
  notes?: string;
  validUntil?: string;
  panelModel?: string;
  inverterModel?: string;
  equipmentSupplier?: string;
  inclusions?: string;
  panelProductId?: string;
  inverterProductId?: string;
}

export interface CatalogueOption {
  id: string;
  label: string;
}

export function InstallerQuoteForm({
  inviteId,
  defaults,
  lineItems = [],
  revise = false,
  catalogue = { panels: [], inverters: [] },
}: {
  inviteId: string;
  defaults: QuoteDefaults;
  lineItems?: LineItem[];
  revise?: boolean;
  catalogue?: { panels: CatalogueOption[]; inverters: CatalogueOption[] };
}) {
  const [state, action] = useActionState<ActionState, FormData>(submitInstallerQuoteAction, null);
  const initialLines = lineItems.length
    ? lineItems.map((item) => ({ description: item.description, amount: String(item.amount) }))
    : [
        { description: "", amount: "" },
        { description: "", amount: "" },
      ];
  const [lines, setLines] = useState(initialLines);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [lines],
  );

  const updateLine = (index: number, patch: Partial<{ description: string; amount: string }>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <PreservingForm action={action} className="space-y-5" noValidate>
      <input type="hidden" name="inviteId" value={inviteId} />

      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="capacityKwp" className="label">System capacity (kWp)</label>
          <input
            id="capacityKwp"
            name="capacityKwp"
            type="number"
            min={0.3}
            step={0.1}
            className="input"
            defaultValue={defaults.capacityKwp}
            required
          />
        </div>
        <div>
          <label htmlFor="expectedAnnualKwh" className="label">Expected annual production (kWh)</label>
          <input
            id="expectedAnnualKwh"
            name="expectedAnnualKwh"
            type="number"
            min={50}
            step={1}
            className="input"
            defaultValue={defaults.expectedAnnualKwh}
            required
          />
          <p className="help">State your own modelled figure; it is compared with the customer&apos;s assessment.</p>
        </div>
        <div>
          <label htmlFor="pricePhp" className="label">Total installed price (₱)</label>
          <input
            id="pricePhp"
            name="pricePhp"
            type="number"
            min={1000}
            step={1000}
            className="input"
            defaultValue={defaults.pricePhp ?? ""}
            placeholder="e.g. 350000"
            required
          />
          <p className="help">VAT-inclusive or state otherwise in exclusions. Line items should match this total.</p>
        </div>
        <div>
          <label htmlFor="timelineWeeks" className="label">Timeline (weeks)</label>
          <input
            id="timelineWeeks"
            name="timelineWeeks"
            type="number"
            min={1}
            max={104}
            className="input"
            defaultValue={defaults.timelineWeeks ?? ""}
            required
          />
        </div>
        <div>
          <label htmlFor="warrantyYears" className="label">Panel / equipment warranty (years)</label>
          <input
            id="warrantyYears"
            name="warrantyYears"
            type="number"
            min={0}
            max={40}
            className="input"
            defaultValue={defaults.warrantyYears ?? ""}
            required
          />
        </div>
        <div>
          <label htmlFor="workmanshipWarrantyYears" className="label">Workmanship warranty (years)</label>
          <input
            id="workmanshipWarrantyYears"
            name="workmanshipWarrantyYears"
            type="number"
            min={0}
            max={40}
            className="input"
            defaultValue={defaults.workmanshipWarrantyYears ?? ""}
            required
          />
        </div>
        <div>
          <label htmlFor="validUntil" className="label">Quote valid until <span className="normal-case tracking-normal text-muted">(optional)</span></label>
          <input
            id="validUntil"
            name="validUntil"
            type="date"
            className="input"
            defaultValue={defaults.validUntil ?? ""}
          />
        </div>
      </div>

      <fieldset className="rounded-xl border border-line bg-paper-deep/40 p-4">
        <legend className="px-1 text-sm font-semibold text-forest-deep">Itemised breakdown</legend>
        <p className="mb-3 text-xs text-muted">
          Add at least one line. The lines must total within 5% (or ₱1,000) of the total price above.
        </p>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <div>
                <label htmlFor={`itemDescription-${index}`} className="sr-only">Line {index + 1} description</label>
                <input
                  id={`itemDescription-${index}`}
                  name="itemDescription"
                  className="input"
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  placeholder={index === 0 ? "Solar panels and mounting" : index === 1 ? "Inverter and electrical works" : "Labour, permits or other"}
                />
              </div>
              <div>
                <label htmlFor={`itemAmount-${index}`} className="sr-only">Line {index + 1} amount in pesos</label>
                <input
                  id={`itemAmount-${index}`}
                  name="itemAmount"
                  type="number"
                  min={0}
                  step={100}
                  className="input"
                  value={line.amount}
                  onChange={(event) => updateLine(index, { amount: event.target.value })}
                  placeholder="Amount ₱"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                disabled={lines.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setLines((current) => [...current, { description: "", amount: "" }])}
            disabled={lines.length >= 20}
          >
            Add line
          </button>
          <p className="text-sm text-ink-soft">
            Lines total: <span className="font-semibold text-ink">{peso(total)}</span>
          </p>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Equipment and responsibilities (recommended)</legend>
        <p className="help mb-3">Customers compare these side by side. Leave blank if not yet decided; it will show as “Not provided”.</p>
        <div className="mb-4 grid gap-4 rounded-xl bg-mint/40 p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="panelProductId" className="label">Panel from the verified catalogue</label>
            <select id="panelProductId" name="panelProductId" className="select" defaultValue={defaults.panelProductId ?? ""}>
              <option value="">Not from the catalogue</option>
              {catalogue.panels.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="inverterProductId" className="label">Inverter from the verified catalogue</label>
            <select id="inverterProductId" name="inverterProductId" className="select" defaultValue={defaults.inverterProductId ?? ""}>
              <option value="">Not from the catalogue</option>
              {catalogue.inverters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <p className="help sm:col-span-2">Choosing a catalogue product fills in the model and supplier and shows customers a verified listing with its warranty backer.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="panelModel" className="label">Panel brand and model</label>
            <input id="panelModel" name="panelModel" className="input" maxLength={160} defaultValue={defaults.panelModel ?? ""} placeholder="e.g. Brand X 550W mono" />
          </div>
          <div>
            <label htmlFor="inverterModel" className="label">Inverter brand and model</label>
            <input id="inverterModel" name="inverterModel" className="input" maxLength={160} defaultValue={defaults.inverterModel ?? ""} placeholder="e.g. Brand Y 5 kW hybrid" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="equipmentSupplier" className="label">Who supplies the equipment</label>
            <input id="equipmentSupplier" name="equipmentSupplier" className="input" maxLength={160} defaultValue={defaults.equipmentSupplier ?? ""} placeholder="Your company, or the distributor you buy from" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="inclusions" className="label">What the price includes</label>
            <textarea id="inclusions" name="inclusions" className="textarea" style={{ minHeight: "4.5rem" }} maxLength={2000} defaultValue={defaults.inclusions ?? ""} placeholder="Mounting, wiring, monitoring app, permits assistance, net-metering application support…" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="exclusions" className="label">Exclusions</label>
        <textarea
          id="exclusions"
          name="exclusions"
          className="textarea"
          style={{ minHeight: "5rem" }}
          defaultValue={defaults.exclusions ?? ""}
          placeholder="Permits, net-metering fees, roof repair, scaffolding, panel cleaning access…"
          maxLength={2000}
        />
      </div>

      <div>
        <label htmlFor="notes" className="label">Notes to the customer</label>
        <textarea
          id="notes"
          name="notes"
          className="textarea"
          style={{ minHeight: "5rem" }}
          defaultValue={defaults.notes ?? ""}
          placeholder="Equipment brands/models, assumptions, site-survey conditions, payment schedule."
          maxLength={2000}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pendingText="Submitting quote…">
          {revise ? "Submit revised quote" : "Submit quote"}
        </SubmitButton>
        <Link href="/installer/leads" className="btn btn-ghost btn-sm">Back to leads</Link>
      </div>
      <p className="text-xs text-muted">
        SOLARekta does not verify prices or equipment quality. Your quote is shown as submitted by your business, alongside
        the customer&apos;s normalised comparison figures.
      </p>
    </PreservingForm>
  );
}
