"use client";

import { useActionState, useTransition } from "react";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

/**
 * Generic form for server actions that return ActionState. Submits through a handler
 * so typed values survive validation errors, and lists field errors in plain words.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className = "space-y-5",
  submitClassName = "btn btn-primary",
  footer,
  submitName,
  submitValue,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  footer?: React.ReactNode;
  submitName?: string;
  submitValue?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [, startTransition] = useTransition();
  const fieldErrors = Object.values(state?.fieldErrors ?? {}).filter(Boolean);

  return (
    <form
      className={className}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (submitName && submitValue) data.set(submitName, submitValue);
        startTransition(() => formAction(data));
      }}
    >
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{state.error}</p>
            {fieldErrors.length > 1 ? (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {fieldErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" /> {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </button>
        {footer}
      </div>
    </form>
  );
}
