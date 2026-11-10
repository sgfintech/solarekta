"use client";

import { useMemo, useState } from "react";
import { createOrderAction } from "@/app/actions/marketplace";
import { ActionForm } from "@/components/marketplace/action-form";

interface Item {
  id: string;
  label: string;
  sub: string;
  pricePhp: number | null;
  unit: string;
  outOfStock: boolean;
}

function peso(n: number) {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export function OrderForm({
  supplierId,
  items,
  initial,
  installers,
  defaults,
}: {
  supplierId: string;
  items: Item[];
  initial: Record<string, number>;
  installers: { id: string; name: string }[];
  defaults: { name: string; phone: string; city: string; province: string };
}) {
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [plan, setPlan] = useState("undecided");
  const { subtotal, unpriced, count } = useMemo(() => {
    let sum = 0;
    let missing = false;
    let n = 0;
    for (const item of items) {
      const q = qty[item.id] ?? 0;
      if (q <= 0) continue;
      n += 1;
      if (item.pricePhp == null) missing = true;
      else sum += item.pricePhp * q;
    }
    return { subtotal: sum, unpriced: missing, count: n };
  }, [qty, items]);

  return (
    <ActionForm action={createOrderAction} submitLabel="Send order request" pendingLabel="Sending…">
      <input type="hidden" name="supplierId" value={supplierId} />
      <fieldset>
        <legend className="label">Items</legend>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <input type="hidden" name="productId" value={item.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
                <p className="text-xs text-muted">{item.sub} · {item.pricePhp != null ? `${peso(item.pricePhp)} / ${item.unit}` : "Price on request"}</p>
              </div>
              <label htmlFor={`qty_${item.id}`} className="sr-only">Quantity for {item.label}</label>
              <input
                id={`qty_${item.id}`}
                name={`qty_${item.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                disabled={item.outOfStock}
                className="input !min-h-10 w-20 text-center"
                value={qty[item.id] ?? 0}
                onChange={(e) => setQty((c) => ({ ...c, [item.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
          {count === 0 ? "Set a quantity for at least one item." : (
            <>
              {count} item{count === 1 ? "" : "s"} · listed subtotal <strong className="text-ink">{peso(subtotal)}</strong>
              {unpriced ? " plus items priced on request" : ""}. Delivery is added by the supplier.
            </>
          )}
        </p>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label sm:col-span-2">Delivery</legend>
        <div><label htmlFor="deliveryCity" className="label">City or municipality</label><input id="deliveryCity" name="deliveryCity" className="input" defaultValue={defaults.city} autoComplete="address-level2" required /></div>
        <div><label htmlFor="deliveryProvince" className="label">Province</label><input id="deliveryProvince" name="deliveryProvince" className="input" defaultValue={defaults.province} autoComplete="address-level1" /></div>
        <div className="sm:col-span-2"><label htmlFor="deliveryAddress" className="label">Street address <span className="font-normal text-muted">(optional now)</span></label><input id="deliveryAddress" name="deliveryAddress" className="input" autoComplete="street-address" /><p className="help">Shared only with this supplier, for delivery.</p></div>
        <div><label htmlFor="contactName" className="label">Contact name</label><input id="contactName" name="contactName" className="input" defaultValue={defaults.name} autoComplete="name" required /></div>
        <div><label htmlFor="contactPhone" className="label">Phone</label><input id="contactPhone" name="contactPhone" type="tel" className="input" defaultValue={defaults.phone} autoComplete="tel" placeholder="+63 9xx xxx xxxx" required /></div>
      </fieldset>

      <fieldset>
        <legend className="label">Who will install it?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["platform_installer", "A SOLARekta installer"],
            ["own_installer", "My own licensed installer"],
            ["undecided", "Not decided yet"],
          ].map(([value, title]) => (
            <label key={value} className="choice !p-3 text-sm">
              <input type="radio" name="installerPlan" value={value} checked={plan === value} onChange={() => setPlan(value)} />
              <span className="font-semibold text-ink">{title}</span>
            </label>
          ))}
        </div>
        {plan === "platform_installer" ? (
          <div className="mt-3 max-w-sm">
            <label htmlFor="installerId" className="label">Installer</label>
            <select id="installerId" name="installerId" className="select" defaultValue="">
              <option value="" disabled>Choose a verified installer</option>
              {installers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        ) : null}
        <p className="help">Grid-connected solar must be installed and signed off by a licensed installer or electrician.</p>
      </fieldset>

      <div><label htmlFor="note" className="label">Note to supplier <span className="font-normal text-muted">(optional)</span></label><textarea id="note" name="note" className="textarea" style={{ minHeight: "4.5rem" }} maxLength={1000} /></div>

      <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper p-4 text-sm text-ink-soft">
        <input type="checkbox" name="acknowledge" className="mt-0.5 h-5 w-5 shrink-0 accent-[#12601c]" />
        <span>
          <strong className="text-ink">I understand how this works.</strong> This is an order request, not a payment. The
          supplier confirms availability, the total and the delivery date. I pay the supplier directly only after that, and
          should ask for an official receipt. SOLARekta does not process payments or guarantee products.
        </span>
      </label>
    </ActionForm>
  );
}
