"use client";

import { useActionState } from "react";
import { summarizeQuotesAction, type QuoteSummaryState } from "@/app/actions/ai";
import type { QuoteSummary } from "@/lib/ai/features";

export function QuoteSummaryPanel({
  requestId,
  initial,
  aiEnabled,
  fieldLabels,
}: {
  requestId: string;
  initial: QuoteSummary;
  aiEnabled: boolean;
  fieldLabels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<QuoteSummaryState, FormData>(summarizeQuotesAction, null);
  const summary = state?.summary ?? initial;

  return (
    <section aria-labelledby="quote-summary-heading" className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="quote-summary-heading" className="text-xl text-forest-deep">What stands out</h2>
        <span className="badge badge-neutral">{summary.source === "ai" ? "AI summary, checked against quote fields" : "Calculated from quote fields"}</span>
      </div>
      <div aria-live="polite" className="mt-3">
        {pending ? (
          <div className="space-y-2"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" /></div>
        ) : (
          <div className="view-enter grid gap-5 md:grid-cols-2">
            <ul className="space-y-2.5">
              {summary.points.map((point, index) => (
                <li key={index} className="rounded-xl border border-line-soft bg-paper/60 p-3 text-sm text-ink">
                  {point.text}
                  <span className="mt-1 block text-xs text-muted">
                    Based on {point.refs.join(", ")} · {fieldLabels[point.field] ?? point.field}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <p className="text-sm font-semibold text-ink">Questions to ask the providers</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-soft marker:text-lime">
                {summary.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {summary.notice ? <p className="mt-3 text-xs text-[#6b4708]">{summary.notice}</p> : null}
        {state?.error ? <p role="alert" className="field-error">{state.error}</p> : null}
      </div>
      <p className="mt-4 text-xs text-muted">
        This is not a recommendation of a provider. Missing information is shown as “Not provided”, which is not the same
        as a bad term — ask the provider.
      </p>
      {aiEnabled ? (
        <form action={action} className="mt-3 no-print">
          <input type="hidden" name="requestId" value={requestId} />
          {summary.source === "ai" ? <input type="hidden" name="force" value="1" /> : null}
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
            {summary.source === "ai" ? "Refresh AI summary" : "Summarise with AI"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
