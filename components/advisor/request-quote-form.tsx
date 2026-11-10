"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createSupplierQuoteRequestAction } from "@/app/actions/advisor";
import { Alert, Check } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

/**
 * Two-step request: the buyer fills the form, reviews exactly what will be sent (and
 * whether contact details are shared), then confirms. Nothing is sent before confirming.
 */
export function RequestQuoteForm({
  productId,
  productLabel,
  supplierName,
  defaultName,
  defaultPhone,
  email,
}: {
  productId: string;
  productLabel: string;
  supplierName: string;
  defaultName: string;
  defaultPhone: string;
  email: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSupplierQuoteRequestAction, null);
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<Record<string, string> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [share, setShare] = useState("no");

  const toReview = () => {
    const form = formRef.current;
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const qty = Number(data.quantity);
    if (!Number.isInteger(qty) || qty < 1) return setLocalError("Enter a whole-number quantity.");
    if ((data.deliveryCity ?? "").trim().length < 2) return setLocalError("Enter the delivery city or municipality.");
    if (data.shareContact === "yes" && ((data.contactName ?? "").trim().length < 2 || (data.contactPhone ?? "").trim().length < 7)) {
      return setLocalError("Enter your name and phone number, or choose not to share contact details.");
    }
    setLocalError(null);
    setReview(data);
  };

  const send = () => {
    if (!review) return;
    const data = new FormData();
    Object.entries(review).forEach(([k, v]) => data.set(k, v));
    data.set("confirmed", "yes");
    startTransition(() => formAction(data));
  };

  const error = localError ?? state?.error;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}

      <form ref={formRef} className={`card card-pad space-y-4 ${review ? "hidden" : ""}`} noValidate onSubmit={(e) => { e.preventDefault(); toReview(); }}>
        <input type="hidden" name="productId" value={productId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="quantity" className="label">Quantity</label>
            <input id="quantity" name="quantity" type="number" min={1} step={1} defaultValue={1} className="input" required />
          </div>
          <div>
            <label htmlFor="deliveryCity" className="label">Deliver to (city or municipality)</label>
            <input id="deliveryCity" name="deliveryCity" className="input" placeholder="e.g. Pasig, Metro Manila" required />
          </div>
        </div>
        <div>
          <label htmlFor="details" className="label">Questions for the supplier <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="details" name="details" maxLength={1000} className="textarea" placeholder="e.g. Is the BMS cable included? Delivery lead time?" />
          <p className="help">Don’t include account numbers or other sensitive information.</p>
        </div>
        <fieldset>
          <legend className="label">Share your contact details with {supplierName}?</legend>
          <div className="mt-2 space-y-2 text-sm">
            <label className="flex gap-2"><input type="radio" name="shareContact" value="no" checked={share === "no"} onChange={() => setShare("no")} /> No — the supplier replies here on SOLARekta only</label>
            <label className="flex gap-2"><input type="radio" name="shareContact" value="yes" checked={share === "yes"} onChange={() => setShare("yes")} /> Yes — share my name, phone and email ({email})</label>
          </div>
        </fieldset>
        {share === "yes" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="contactName" className="label">Name</label><input id="contactName" name="contactName" className="input" defaultValue={defaultName} /></div>
            <div><label htmlFor="contactPhone" className="label">Phone</label><input id="contactPhone" name="contactPhone" className="input" defaultValue={defaultPhone} inputMode="tel" /></div>
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary">Review request</button>
      </form>

      {review ? (
        <section className="card card-pad space-y-4" aria-labelledby="review-heading">
          <h2 id="review-heading" className="text-lg font-semibold text-forest-deep">Check before sending</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Supplier", supplierName],
              ["Product", productLabel],
              ["Quantity", review.quantity],
              ["Deliver to", review.deliveryCity],
              ["Your questions", review.details?.trim() || "None"],
              ["Contact details shared", review.shareContact === "yes" ? `${review.contactName}, ${review.contactPhone}, ${email}` : "No — replies stay on SOLARekta"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-white p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 break-words font-medium text-ink">{value}</dd></div>
            ))}
          </dl>
          <ul className="space-y-1 text-xs text-ink-soft">
            <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> This is a request for a quotation, not an order. Nothing is charged.</li>
            <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> Only the details above are sent. Uploaded quotations are never shared.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={send} disabled={pending}>{pending ? "Sending…" : "Send request to supplier"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setReview(null)} disabled={pending}>Edit</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
