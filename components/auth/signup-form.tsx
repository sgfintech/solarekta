"use client";

import { PreservingForm } from "@/components/preserving-form";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signupAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

export function SignupForm({ initialRole, fromEstimate = false }: { initialRole: "customer" | "installer" | "supplier"; fromEstimate?: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(signupAction, null);
  const [role, setRole] = useState(initialRole);

  return (
    <div>
      <p className="eyebrow">Get started</p>
      <h1 className="mt-2 text-[1.75rem] text-forest-deep sm:text-[2rem]">Create your account</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Already have one?{" "}
        <Link href="/login" className="font-semibold text-forest underline underline-offset-2">
          Log in
        </Link>
      </p>

      {fromEstimate ? (
        <p className="mt-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          Your estimate will be saved to your new account automatically.
        </p>
      ) : null}

      {state?.error ? (
        <div role="alert" className="alert-error mt-6 flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}

      <PreservingForm action={action} className="mt-7 space-y-5" noValidate>
        <fieldset>
          <legend className="label">I am signing up as</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { value: "customer", title: "Homeowner / business", sub: "I want solar" },
              { value: "installer", title: "Installer", sub: "I install systems" },
              { value: "supplier", title: "Supplier", sub: "I sell equipment" },
            ].map((option) => (
              <label key={option.value} className="choice !gap-0.5 !p-3 text-sm">
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value as "customer" | "installer" | "supplier")}
                />
                <span className="block font-semibold text-ink">{option.title}</span>
                <span className="block text-xs text-muted">{option.sub}</span>
              </label>
            ))}
          </div>
          {role === "installer" ? (
            <p className="help">Next: add your business details and documents for manual review.</p>
          ) : role === "supplier" ? (
            <p className="help">Next: add your company details and documents. Products are listed after an admin review.</p>
          ) : null}
        </fieldset>

        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" name="name" type="text" autoComplete="name" required className="input" placeholder="Juan Dela Cruz" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className="input"
            placeholder="At least 10 characters"
            aria-describedby="password-help"
          />
          <p id="password-help" className="help">At least 10 characters, including a letter and a number.</p>
        </div>

        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-5 w-5 accent-[#12601c]" />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="underline">Terms of Use</Link> and{" "}
            <Link href="/privacy" className="underline">Privacy Notice</Link>, and consent to processing my uploaded
            electricity bill to produce estimates.
          </span>
        </label>

        <SubmitButton className="btn btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      </PreservingForm>

      <p className="mt-5 text-center text-xs text-muted">
        Free during the pilot. No credit card. No obligation to request a quote.
      </p>
    </div>
  );
}
