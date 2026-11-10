"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingContext } from "@/components/preserving-form";

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "Working…",
  name,
  value,
  pending: pendingOverride,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
  /** For forms submitted through a handler rather than the form `action` prop. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const contextPending = useContext(FormPendingContext);
  const pending = pendingOverride ?? (contextPending ?? status.pending);
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      name={name}
      value={value}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" /> {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
