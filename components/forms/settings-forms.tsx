"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState } from "react";
import { updateProfileAction, changePasswordAction, createDataRequestAction } from "@/app/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

export function ProfileSettingsForm({ name, phone }: { name: string; phone: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, null);
  return (
    <PreservingForm action={action} className="space-y-4">
      {state?.error ? (
        <p role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="name" className="label">Full name</label>
        <input id="name" name="name" className="input" defaultValue={name} required />
      </div>
      <div>
        <label htmlFor="phone" className="label">Phone</label>
        <input id="phone" name="phone" className="input" defaultValue={phone} placeholder="+63 9xx xxx xxxx" />
        <p className="help">Used only when you consent to share contact details with installers.</p>
      </div>
      <SubmitButton className="btn btn-secondary btn-sm">Save profile</SubmitButton>
    </PreservingForm>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, null);
  return (
    <PreservingForm action={action} className="space-y-4">
      {state?.error ? (
        <p role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="currentPassword" className="label">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="input" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newPassword" className="label">New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} className="input" required />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="label">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} className="input" required />
        </div>
      </div>
      <SubmitButton className="btn btn-secondary btn-sm">Change password</SubmitButton>
    </PreservingForm>
  );
}

export function DataRequestForm() {
  const [state, action] = useActionState<ActionState, FormData>(createDataRequestAction, null);
  return (
    <PreservingForm action={action} className="space-y-4">
      {state?.error ? (
        <p role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="kind" className="label">Request type</label>
        <select id="kind" name="kind" className="select">
          <option value="export">Export a copy of my data</option>
          <option value="deletion">Delete my account and personal data</option>
        </select>
      </div>
      <div>
        <label htmlFor="note" className="label">Note (optional)</label>
        <textarea id="note" name="note" className="textarea" maxLength={1000} placeholder="Anything the reviewer should know." />
      </div>
      <SubmitButton className="btn btn-secondary btn-sm" pendingText="Submitting…">Submit request</SubmitButton>
      <p className="text-xs text-muted">
        Deletion is reviewed before execution so live disputes or legal obligations are not silently destroyed. An
        export can also be downloaded immediately.
      </p>
    </PreservingForm>
  );
}
