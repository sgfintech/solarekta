import { acceptAiSummaryAction, surveyAssistAction } from "@/app/actions/surveys";
import { SubmitButton } from "@/components/submit-button";
import type { SurveyAssist } from "@/lib/survey/ai";

/** AI suggestions: generated only on request, always labelled, accepted only by a person. */
export function SurveyAiPanel({ surveyId, aiJson, aiEnabled, canAccept, limited }: { surveyId: string; aiJson: string | null; aiEnabled: boolean; canAccept: boolean; limited?: boolean }) {
  const ai = aiJson ? (JSON.parse(aiJson) as SurveyAssist) : null;
  return (
    <section id="ai" className="card card-pad" aria-labelledby="ai-h">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ai-h" className="text-lg font-semibold text-forest-deep">AI assistance <span className="badge badge-info ml-1 align-middle">Suggestions only</span></h2>
          <p className="mt-1 text-sm text-ink-soft">Drafts a findings summary, a client-friendly summary and follow-up questions from the recorded answers. Names, phone numbers, addresses, coordinates, photos and documents are not sent. It never adds measurements or confirms anything as verified.</p>
        </div>
        {aiEnabled ? (
          <form action={surveyAssistAction}>
            <input type="hidden" name="surveyId" value={surveyId} />
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Drafting…">{ai ? "Draft again" : "Draft suggestions"}</SubmitButton>
          </form>
        ) : null}
      </div>
      {!aiEnabled ? <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-muted">AI assistance is not configured. Everything else works without it.</p> : null}
      {limited ? <p className="alert-warn mt-3 text-sm">You’ve reached the hourly limit for AI drafts. Try again later.</p> : null}
      {ai && !ai.ok ? <p className="alert-warn mt-3 text-sm">{ai.reason}</p> : null}
      {ai && ai.ok ? (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-xs text-muted">Generated {new Date(ai.generatedAt).toLocaleString("en-PH")} from survey version {ai.sourceVersion}. Check every statement against the answers and evidence.</p>
          <div className="rounded-xl border border-dashed border-[#bcd6db] bg-sky/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">AI draft — findings summary</p>
            <p className="mt-1 whitespace-pre-line text-ink">{ai.summary}</p>
            {canAccept ? (
              <form action={acceptAiSummaryAction} className="mt-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton className="btn btn-primary btn-sm" pendingText="Adding…">Accept into findings notes</SubmitButton>
              </form>
            ) : null}
          </div>
          <div className="rounded-xl border border-dashed border-[#bcd6db] bg-sky/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">AI draft — client-friendly summary</p>
            <p className="mt-1 whitespace-pre-line text-ink">{ai.customerSummary}</p>
          </div>
          {ai.followUps.length ? <div><p className="font-semibold text-ink">Suggested follow-up questions</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">{ai.followUps.map((q) => <li key={q}>{q}</li>)}</ul></div> : null}
          {ai.aiChecks.length ? <div><p className="font-semibold text-ink">Possible gaps noticed by AI</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">{ai.aiChecks.map((q) => <li key={q}>{q}</li>)}</ul></div> : null}
        </div>
      ) : null}
    </section>
  );
}
