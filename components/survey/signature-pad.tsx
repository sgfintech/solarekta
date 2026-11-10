"use client";

import { useEffect, useRef, useState } from "react";
import { acknowledgeAction } from "@/app/actions/surveys";
import { CLIENT_CONSENT_TEXT } from "@/lib/survey/config";

/**
 * Client acknowledgment with a signature drawn by finger or mouse. Stored as an image with the
 * server time; it is a drawn acknowledgment, not a cryptographically verified digital signature.
 */
export function SignaturePad({ surveyId, defaultName, onDone }: { surveyId: string; defaultName: string; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f2214";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="ack-name" className="label">Client name</label>
        <input id="ack-name" className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">{CLIENT_CONSENT_TEXT}</p>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        The client has read the text above and agrees.
      </label>
      <div>
        <p className="label" id="sig-label">Client signs here</p>
        <canvas
          ref={canvas}
          aria-labelledby="sig-label"
          role="img"
          className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-line bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const ctx = e.currentTarget.getContext("2d");
            const p = point(e);
            ctx?.beginPath();
            ctx?.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d");
            const p = point(e);
            ctx?.lineTo(p.x, p.y);
            ctx?.stroke();
            setHasInk(true);
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        />
        <p className="help">A drawn acknowledgment saved with the server time — not a certified digital signature.</p>
      </div>
      {error ? <p role="alert" className="alert-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            if (!hasInk) return setError("Ask the client to sign in the box.");
            setBusy(true);
            setError(null);
            const res = await acknowledgeAction({ surveyId, clientName: name, consent, signaturePng: canvas.current?.toDataURL("image/png") ?? "", deviceTime: new Date().toISOString() });
            setBusy(false);
            if (res.ok) onDone();
            else setError(res.error ?? "Not saved.");
          }}
        >
          {busy ? "Saving…" : "Save acknowledgment"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={clear}>Clear signature</button>
      </div>
    </div>
  );
}
