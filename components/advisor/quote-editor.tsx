"use client";

import { useState } from "react";
import { saveQuoteCorrectionsAction } from "@/app/actions/advisor";
import { ActionForm } from "@/components/marketplace/action-form";
import type { QuoteData, QuoteItem } from "@/lib/advisor/quote";

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(/[₱,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const show = (v: number | null | undefined) => (v == null ? "" : String(v));
const lines = (text: string) => text.split("\n").map((t) => t.trim()).filter(Boolean);

const blankItem = (): QuoteItem => ({ description: "", brand: null, model: null, category: null, quantity: 1, unitPricePhp: null, lineTotalPhp: null });

/** Lets the owner correct every extracted value before comparison. */
export function QuoteEditor({ reviewId, initial }: { reviewId: string; initial: QuoteData }) {
  const [data, setData] = useState<QuoteData>(initial.items.length ? initial : { ...initial, items: [blankItem()] });
  const [inclusions, setInclusions] = useState(initial.inclusions.join("\n"));
  const [exclusions, setExclusions] = useState(initial.exclusions.join("\n"));

  const setItem = (index: number, patch: Partial<QuoteItem>) => setData((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));
  const payload: QuoteData = {
    ...data,
    items: data.items.filter((i) => i.description.trim()),
    inclusions: lines(inclusions),
    exclusions: lines(exclusions),
    warranties: data.warranties.filter((w) => w.item.trim()),
    otherCharges: data.otherCharges.filter((c) => c.label.trim()),
  };

  return (
    <ActionForm action={saveQuoteCorrectionsAction} submitLabel="Save and compare" pendingLabel="Saving…">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="data" value={JSON.stringify(payload)} />

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Quotation</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="q-supplier" className="label">Installer or supplier</label><input id="q-supplier" className="input" value={data.supplierName ?? ""} onChange={(e) => setData({ ...data, supplierName: e.target.value || null })} /></div>
          <div><label htmlFor="q-date" className="label">Quotation date</label><input id="q-date" type="date" className="input" value={data.quoteDate ?? ""} onChange={(e) => setData({ ...data, quoteDate: e.target.value || null })} /></div>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Equipment and lines</legend>
        <p className="help">Check each line against the document. Leave a price blank if it isn’t stated.</p>
        <div className="mt-3 space-y-4">
          {data.items.map((item, i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-3">
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="sm:col-span-3"><label htmlFor={`d-${i}`} className="label">Description</label><input id={`d-${i}`} className="input" value={item.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="e.g. 51.2V 300Ah LiFePO4 battery" /></div>
                <div className="sm:col-span-3">
                  <label htmlFor={`c-${i}`} className="label">Type</label>
                  <select id={`c-${i}`} className="select" value={item.category ?? ""} onChange={(e) => setItem(i, { category: (e.target.value || null) as QuoteItem["category"] })}>
                    <option value="">Not sure</option><option value="panel">Solar panel</option><option value="inverter">Inverter</option><option value="battery">Battery</option><option value="mounting">Mounting</option><option value="accessory">Cables / accessories</option><option value="other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2"><label htmlFor={`b-${i}`} className="label">Brand</label><input id={`b-${i}`} className="input" value={item.brand ?? ""} onChange={(e) => setItem(i, { brand: e.target.value || null })} /></div>
                <div className="sm:col-span-2"><label htmlFor={`m-${i}`} className="label">Model</label><input id={`m-${i}`} className="input" value={item.model ?? ""} onChange={(e) => setItem(i, { model: e.target.value || null })} /></div>
                <div className="sm:col-span-2"><label htmlFor={`q-${i}`} className="label">Quantity</label><input id={`q-${i}`} type="number" min={0} step="any" className="input" value={show(item.quantity)} onChange={(e) => setItem(i, { quantity: num(e.target.value) ?? 0 })} /></div>
                <div className="sm:col-span-3"><label htmlFor={`u-${i}`} className="label">Unit price (₱)</label><input id={`u-${i}`} inputMode="decimal" className="input" value={show(item.unitPricePhp)} onChange={(e) => setItem(i, { unitPricePhp: num(e.target.value) })} /></div>
                <div className="sm:col-span-3"><label htmlFor={`t-${i}`} className="label">Line total (₱)</label><input id={`t-${i}`} inputMode="decimal" className="input" value={show(item.lineTotalPhp)} onChange={(e) => setItem(i, { lineTotalPhp: num(e.target.value) })} /></div>
              </div>
              <button type="button" className="link-action link-danger mt-2 text-xs" onClick={() => setData((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>Remove line</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setData((d) => ({ ...d, items: [...d.items, blankItem()] }))}>Add line</button>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Charges and total</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="q-install" className="label">Installation (₱)</label><input id="q-install" inputMode="decimal" className="input" value={show(data.installationPhp)} onChange={(e) => setData({ ...data, installationPhp: num(e.target.value) })} /><p className="help">Blank if not priced separately.</p></div>
          <div><label htmlFor="q-total" className="label">Stated total (₱)</label><input id="q-total" inputMode="decimal" className="input" value={show(data.totalPhp)} onChange={(e) => setData({ ...data, totalPhp: num(e.target.value) })} /></div>
        </div>
        <div className="mt-4 space-y-2">
          <p className="label">Other charges</p>
          {data.otherCharges.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
              <input aria-label="Charge" className="input" value={c.label} onChange={(e) => setData({ ...data, otherCharges: data.otherCharges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="e.g. Net-metering application" />
              <input aria-label="Amount (₱)" inputMode="decimal" className="input" value={show(c.amountPhp)} onChange={(e) => setData({ ...data, otherCharges: data.otherCharges.map((x, j) => (j === i ? { ...x, amountPhp: num(e.target.value) ?? 0 } : x)) })} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setData({ ...data, otherCharges: data.otherCharges.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setData({ ...data, otherCharges: [...data.otherCharges, { label: "", amountPhp: 0 }] })}>Add charge</button>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Warranties, inclusions and exclusions</legend>
        <div className="mt-3 space-y-2">
          {data.warranties.map((w, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
              <input aria-label="Warranty item" className="input" value={w.item} onChange={(e) => setData({ ...data, warranties: data.warranties.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) })} placeholder="e.g. Battery" />
              <input aria-label="Years" inputMode="numeric" className="input" value={show(w.years)} onChange={(e) => setData({ ...data, warranties: data.warranties.map((x, j) => (j === i ? { ...x, years: num(e.target.value) } : x)) })} placeholder="Years" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setData({ ...data, warranties: data.warranties.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setData({ ...data, warranties: [...data.warranties, { item: "", years: null, text: null }] })}>Add warranty</button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="q-inc" className="label">Stated as included (one per line)</label><textarea id="q-inc" className="textarea" value={inclusions} onChange={(e) => setInclusions(e.target.value)} /></div>
          <div><label htmlFor="q-exc" className="label">Stated as excluded (one per line)</label><textarea id="q-exc" className="textarea" value={exclusions} onChange={(e) => setExclusions(e.target.value)} /></div>
        </div>
      </fieldset>
    </ActionForm>
  );
}
