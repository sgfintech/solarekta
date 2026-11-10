"use client";

import { useActionState } from "react";
import { askAssistantAction, type AssistantState } from "@/app/actions/ai";

const SUGGESTIONS = [
  { id: "lower_savings", text: "Why are my savings lower than expected?" },
  { id: "site_visit", text: "What should I ask during a site visit?" },
  { id: "extra_power", text: "What happens to extra solar power?" },
  { id: "payback", text: "How is the payback worked out?" },
  { id: "roof", text: "What if my roof is smaller or shaded?" },
];

export function AssessmentAssistant({ assessmentId, aiEnabled }: { assessmentId: string; aiEnabled: boolean }) {
  const [state, action, pending] = useActionState<AssistantState, FormData>(askAssistantAction, null);

  return (
    <section aria-labelledby="assistant-heading" className="card card-pad no-print">
      <h2 id="assistant-heading" className="text-xl text-forest-deep">Questions about this estimate</h2>
      <p className="mt-1 text-sm text-ink-soft">Answers use your estimate and our solar buying guide. They never change your numbers.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <form key={s.id} action={action}>
            <input type="hidden" name="assessmentId" value={assessmentId} />
            <input type="hidden" name="questionId" value={s.id} />
            <button type="submit" disabled={pending} className="min-h-10 rounded-full border border-line bg-paper px-3.5 py-1.5 text-left text-sm font-medium text-ink-soft transition-colors hover:border-forest/40 hover:bg-mint hover:text-forest-deep">
              {s.text}
            </button>
          </form>
        ))}
      </div>

      <form action={action} className="mt-4">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <label htmlFor="assistant-question" className="label">
          Ask your own question {aiEnabled ? null : <span className="font-normal text-muted">(needs AI assist, currently off)</span>}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="assistant-question" name="question" className="input" maxLength={300} placeholder="e.g. Would a smaller system make sense?" disabled={!aiEnabled || pending} />
          <button type="submit" className="btn btn-secondary shrink-0" disabled={!aiEnabled || pending}>Ask</button>
        </div>
      </form>

      <div aria-live="polite" className="mt-4">
        {pending ? (
          <div className="space-y-2"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-3/4" /></div>
        ) : state?.answer ? (
          <div className="view-enter rounded-2xl border border-line bg-paper p-4">
            <p className="text-xs font-semibold text-muted">{state.question}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{state.answer}</p>
            <p className="mt-2 text-xs text-muted">{state.source === "ai" ? "AI answer, checked against your estimate." : "Answered from your estimate."}</p>
          </div>
        ) : null}
        {state?.error ? <p role="alert" className="field-error">{state.error}</p> : null}
      </div>
    </section>
  );
}
