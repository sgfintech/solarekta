"use client";

import { PreservingForm } from "@/components/preserving-form";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

export function LoginForm({ next, fromEstimate = false }: { next?: string; fromEstimate?: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, null);

  return (
    <div>
      <p className="eyebrow">Welcome back</p>
      <h1 className="mt-2 text-[1.75rem] text-forest-deep sm:text-[2rem]">Log in to your account</h1>
      <p className="mt-3 text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-forest underline underline-offset-2">
          Create a free account
        </Link>
      </p>

      {fromEstimate ? (
        <p className="mt-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          After you log in, your estimate will be saved to your account.
        </p>
      ) : null}

      {state?.error ? (
        <div role="alert" className="alert-error mt-6 flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}

      <PreservingForm action={action} className="mt-7 space-y-5" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div>
          <label htmlFor="email" className="label">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" placeholder="Your password" />
        </div>
        <SubmitButton className="btn btn-primary w-full" pendingText="Logging in…">Log in</SubmitButton>
      </PreservingForm>

      <p className="mt-6 rounded-xl bg-paper-deep/70 px-4 py-3 text-xs leading-relaxed text-muted">
        Demo environment? Seeded accounts are listed in the README. Never use real customer bills in a demo.
      </p>
    </div>
  );
}
