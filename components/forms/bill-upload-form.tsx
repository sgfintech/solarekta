"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { uploadBillAction } from "@/app/actions/sites";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Lock } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function BillUploadForm({
  siteId,
  aiEnabled,
  aiReason,
}: {
  siteId: string;
  aiEnabled: boolean;
  aiReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadBillAction, null);
  const [, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = (picked: File | undefined) => {
    setClientError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!picked) return setFile(null);
    if (!ACCEPTED.includes(picked.type)) {
      setFile(null);
      return setClientError("Choose a PDF, JPG, PNG or WEBP file.");
    }
    if (picked.size > MAX_BYTES) {
      setFile(null);
      return setClientError(`That file is ${(picked.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB; try a smaller photo.`);
    }
    setFile(picked);
    if (picked.type.startsWith("image/")) setPreview(URL.createObjectURL(picked));
  };

  const isPdf = file?.type === "application/pdf";
  const error = clientError ?? state?.error;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return setClientError("Choose a bill photo or PDF first.");
        const data = new FormData();
        data.set("siteId", siteId);
        data.set("file", file);
        if (aiEnabled && useAi && !isPdf) data.set("useAi", "on");
        // The chosen file stays selected if the upload fails, so retrying is one tap.
        startTransition(() => action(data));
      }}
    >
      {error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {error} {state?.error && file ? "Your file is still selected; you can try again." : null}
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn btn-secondary w-full" onClick={() => cameraRef.current?.click()}>
          Take a photo
        </button>
        <button type="button" className="btn btn-secondary w-full" onClick={() => fileRef.current?.click()}>
          Choose a file
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => choose(e.target.files?.[0])} />
      <label htmlFor="bill-file" className="sr-only">Bill file</label>
      <input id="bill-file" ref={fileRef} type="file" accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      <p className="help">PDF, JPG, PNG or WEBP, up to 8 MB. Make sure the kWh and total are readable.</p>

      {file ? (
        <div className="view-enter flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="Selected bill preview" className="h-20 w-16 shrink-0 rounded-lg border border-line object-cover" />
          ) : (
            <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-xs font-bold text-clay">PDF</span>
          )}
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-ink">{file.name}</p>
            <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            <button type="button" className="mt-1 text-xs font-semibold text-forest underline underline-offset-2" onClick={() => choose(undefined)}>
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {isPdf ? (
        <p className="rounded-xl border border-line bg-paper-deep/60 px-3.5 py-3 text-xs text-ink-soft">
          PDFs are stored privately for your records but are not read automatically. After uploading, you will type the
          kWh and total yourself.
        </p>
      ) : aiEnabled ? (
        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-paper-deep/40 px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#12601c]" />
          <span>
            <strong className="text-ink">Read the photo automatically (optional).</strong> The image is sent to our AI
            provider to suggest values. You check and correct every value before anything is used.
          </span>
        </label>
      ) : (
        <p className="rounded-xl bg-paper-deep/60 px-3.5 py-3 text-xs text-muted">{aiReason} You will type the values after uploading.</p>
      )}

      <SubmitButton className="btn btn-primary w-full sm:w-auto" pendingText={useAi && aiEnabled && !isPdf ? "Uploading and reading…" : "Uploading…"} pending={pending}>
        Upload bill
      </SubmitButton>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Your file is linked to your account only. Providers never receive your bill document.
      </p>
    </form>
  );
}
