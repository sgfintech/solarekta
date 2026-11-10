"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState } from "react";
import { decideInstallerAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import type { ActionState } from "@/lib/action-state";

const ACTIONS: Record<string, { value: string; label: string; tone: string }[]> = {
  draft: [
    { value: "approve", label: "Approve and verify", tone: "btn-primary" },
    { value: "reject", label: "Reject application", tone: "btn-secondary" },
  ],
  pending: [
    { value: "approve", label: "Approve and verify", tone: "btn-primary" },
    { value: "reject", label: "Reject application", tone: "btn-secondary" },
  ],
  rejected: [
    { value: "approve", label: "Approve and verify", tone: "btn-primary" },
    { value: "reject", label: "Keep rejected", tone: "btn-secondary" },
  ],
  verified: [{ value: "suspend", label: "Suspend from leads", tone: "btn-secondary" }],
  suspended: [{ value: "reinstate", label: "Reinstate verification", tone: "btn-primary" }],
};

export function InstallerDecisionForm({
  installerId,
  status,
}: {
  installerId: string;
  status: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(decideInstallerAction, null);
  const actions = ACTIONS[status] ?? ACTIONS.pending;

  return (
    <PreservingForm action={action} className="space-y-3">
      <input type="hidden" name="installerId" value={installerId} />
      {state?.error ? (
        <p role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor={`notes-${installerId}`} className="label">Decision notes</label>
        <textarea
          id={`notes-${installerId}`}
          name="notes"
          className="textarea"
          style={{ minHeight: "4.5rem" }}
          maxLength={2000}
          placeholder="What was checked, what is missing, or why the status changed. Shown to the installer."
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((option) => (
          <SubmitButton
            key={option.value}
            name="action"
            value={option.value}
            className={`btn ${option.tone} btn-sm`}
            pendingText="Recording…"
          >
            {option.label}
          </SubmitButton>
        ))}
      </div>
    </PreservingForm>
  );
}
