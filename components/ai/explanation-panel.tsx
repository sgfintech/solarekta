"use client";

import { useActionState, useState } from "react";
import { explainAssessmentAction, type ExplanationState } from "@/app/actions/ai";

type Cached = { text: string; source: "ai" | "deterministic" } | null;

export function ExplanationPanel({
  assessmentId,
  initialLocale,
  cached,
  aiEnabled,
}: {
  assessmentId: string;
  initialLocale: "en" | "fil";
  cached: { en: Cached; fil: Cached };
  aiEnabled: boolean;
}) {
  const [locale, setLocale] = useState<"en" | "fil">(initialLocale);
  const [state, action, pending] = useActionState<ExplanationState, FormData>(explainAssessmentAction, null);
  const current = state?.locale === locale && state.text ? { text: state.text, source: state.source ?? "deterministic" } : cached[locale];

  return (
    <section aria-labelledby="explanation-heading" className="card card-pad" id="explanation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="explanation-heading" className="text-xl text-forest-deep">Your estimate in plain words</h2>
        <div role="group" aria-label="Language" className="inline-flex rounded-full border border-line bg-paper p-1 text-sm">
          {(["en", "fil"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={locale === value}
              onClick={() => setLocale(value)}
              className={`min-h-9 rounded-full px-3 font-semibold transition-colors ${locale === value ? "bg-forest text-white" : "text-ink-soft hover:text-forest"}`}
            >
              {value === "en" ? "English" : "Filipino"}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="mt-3">
        {pending ? (
          <div className="space-y-2" aria-label="Writing explanation">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-4/5" />
          </div>
        ) : current ? (
          <div className="view-enter">
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft" lang={locale === "fil" ? "fil" : "en"}>{current.text}</p>
            <p className="mt-2 text-xs text-muted">
              {current.source === "ai"
                ? "Written by AI from your calculated figures only, and checked against them. It cannot change the numbers."
                : "Standard explanation generated from your calculated figures."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            Get a short explanation of what these numbers mean for you{locale === "fil" ? ", in Filipino" : ""}.
          </p>
        )}
        {state?.notice && state.locale === locale ? <p className="mt-2 text-xs text-[#6b4708]">{state.notice}</p> : null}
        {state?.error ? <p role="alert" className="field-error">{state.error}</p> : null}
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-3 no-print">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input type="hidden" name="locale" value={locale} />
        {current?.source === "ai" ? <input type="hidden" name="force" value="1" /> : null}
        {aiEnabled ? (
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
            {pending ? <><span className="spinner" aria-hidden="true" /> Writing…</> : current?.source === "ai" ? "Regenerate with AI" : "Rewrite with AI"}
          </button>
        ) : (
          <span className="text-xs text-muted">AI assist is off in this environment, so the standard explanation is shown.</span>
        )}
      </form>
    </section>
  );
}
