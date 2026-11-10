"use client";

import { createContext, useTransition, type FormHTMLAttributes } from "react";

/** Pending state for submit buttons inside a PreservingForm (useFormStatus only sees native form actions). */
export const FormPendingContext = createContext<boolean | null>(null);

/**
 * A form that submits a server action without React's automatic reset, so typed values
 * survive a validation error and only the field that needs fixing has to change.
 */
export function PreservingForm({
  action,
  children,
  ...rest
}: { action: (formData: FormData) => void } & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const [pending, startTransition] = useTransition();
  return (
    <FormPendingContext.Provider value={pending}>
      <form
        {...rest}
        aria-busy={pending || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const data = new FormData(event.currentTarget, submitter);
          startTransition(() => action(data));
        }}
      >
        {children}
      </form>
    </FormPendingContext.Provider>
  );
}
