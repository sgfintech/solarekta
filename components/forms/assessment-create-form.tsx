"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState } from "react";
import { createAssessmentAction } from "@/app/actions/sites";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Check } from "@/components/icons";
import { ExportArt } from "@/components/estimate/choice-art";
import type { ActionState } from "@/lib/action-state";

const OPTIONS = [
  { value: "net_metering", title: "Net-metering", body: "Extra power earns a bill credit. We assume about 55% of your rate." },
  { value: "zero_export", title: "No export", body: "Extra power is not credited." },
  { value: "not_sure", title: "Not sure yet", body: "We count no credit and show what net-metering could add." },
] as const;

export function AssessmentCreateForm({ siteId, defaultExport }: { siteId: string; defaultExport: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createAssessmentAction, null);

  return (
    <PreservingForm action={action} className="space-y-4">
      <input type="hidden" name="siteId" value={siteId} />
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}
      <fieldset>
        <legend className="label">What happens to extra solar power?</legend>
        <div className="space-y-2">
          {OPTIONS.map((option) => (
            <label key={option.value} className="choice choice-row">
              <input type="radio" name="systemType" value={option.value} defaultChecked={defaultExport === option.value} required />
              <span className="choice-mark" aria-hidden="true"><Check className="h-3 w-3" /></span>
              <ExportArt kind={option.value} className="h-9 w-9 shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-ink">{option.title}</span>
                <span className="block text-xs text-muted">{option.body}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="help">Net-metering needs approval from your electricity provider; the real credit rate is theirs to set.</p>
      </fieldset>
      <SubmitButton className="btn btn-primary w-full" pendingText="Calculating…">See my solar estimate</SubmitButton>
    </PreservingForm>
  );
}
