import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/provider";
import { surveyAccess } from "@/lib/survey/data";
import { buildDetail } from "@/lib/survey/detail";
import { EDITABLE, STATUS_LABEL, STATUS_TONE, reopenCreatesRevision } from "@/lib/survey/model";
import { commentAction, reopenSurveyAction, shareSurveyAction } from "@/app/actions/surveys";
import { SurveyDetail } from "@/components/survey/survey-detail";
import { SurveyAiPanel } from "@/components/survey/survey-ai-panel";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Survey summary" };

export default async function InstallerSurveyReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; reopenError?: string; ai?: string }> }) {
  const user = await requireUser(["installer"]);
  const { id } = await params;
  const q = await searchParams;
  const access = surveyAccess(user, id);
  if (!access || access.role !== "surveyor") notFound();
  const { survey } = access;
  const detail = buildDetail(survey, "surveyor");
  const editable = EDITABLE.includes(survey.status);

  return (
    <div className="space-y-6">
      <Link href="/installer/surveys" className="back-link">← Site surveys</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{survey.reference} · {survey.type === "residential" ? "Residential" : "Commercial"} · Revision {survey.revision}</p>
          <h1 className="display-sm mt-1 text-forest-deep">{survey.client_name || "Site survey"}</h1>
          <p className="mt-1"><span className={`badge ${STATUS_TONE[survey.status]}`}>{STATUS_LABEL[survey.status]}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? <Link href={`/installer/surveys/${id}`} className="btn btn-primary btn-sm">Continue editing</Link> : null}
          <Link href={`/surveys/${id}/report`} className="btn btn-secondary btn-sm">Print / PDF report</Link>
        </div>
      </div>
      {q.submitted ? <p role="status" className="alert-success">Submitted for technical review. You’ll be notified when a reviewer decides.</p> : null}
      {survey.status === "changes_requested" ? <p className="alert-error">Changes requested{survey.review_note ? `: ${survey.review_note}` : "."} Edit the survey and resubmit.</p> : null}
      {survey.status === "approved" ? <p className="alert-success">Approved in SOLARekta’s internal record review. This is not structural approval, utility approval or permission to install.</p> : null}

      {reopenCreatesRevision(survey.status) ? (
        <details id="reopen" className="card card-pad" open={Boolean(q.reopenError)}>
          <summary className="link-action text-sm">Need to change something? Reopen as revision {survey.revision + 1}</summary>
          <form action={reopenSurveyAction} className="mt-3 space-y-2">
            <input type="hidden" name="surveyId" value={id} />
            <label className="label" htmlFor="reopen-reason">Reason for the change</label>
            <input id="reopen-reason" name="reason" required minLength={5} maxLength={500} className="input" aria-invalid={q.reopenError ? true : undefined} />
            {q.reopenError ? <p className="field-error">Give a short reason (at least 5 characters).</p> : null}
            <p className="help">The submitted version stays in the history. The survey must be resubmitted and reviewed again.</p>
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Reopening…">Reopen for changes</SubmitButton>
          </form>
        </details>
      ) : null}
      {survey.status === "changes_requested" ? (
        <form action={reopenSurveyAction}>
          <input type="hidden" name="surveyId" value={id} />
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Opening…">Start making changes</SubmitButton>
        </form>
      ) : null}

      {survey.customer_user_id ? (
        <form action={shareSurveyAction} className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="surveyId" value={id} />
          <input type="hidden" name="share" value={survey.shared_with_customer ? "no" : "yes"} />
          <p className="text-sm text-ink-soft">{survey.shared_with_customer ? "The client can see this survey’s summary and report (without device locations, comments or history)." : "Not shared with the client. Sharing shows them the findings, photos and report — never device locations, internal comments or history."}</p>
          <SubmitButton className={survey.shared_with_customer ? "btn btn-ghost btn-sm" : "btn btn-secondary btn-sm"} pendingText="Saving…">{survey.shared_with_customer ? "Stop sharing" : "Share with client"}</SubmitButton>
        </form>
      ) : null}

      <SurveyAiPanel surveyId={id} aiJson={survey.ai_json} aiEnabled={aiStatus().enabled} canAccept={editable} limited={q.ai === "limit"} />
      <SurveyDetail {...detail} />

      <form action={commentAction} className="card card-pad space-y-2">
        <input type="hidden" name="surveyId" value={id} />
        <label className="label" htmlFor="comment">Reply to the reviewer</label>
        <textarea id="comment" name="message" className="textarea" rows={2} maxLength={2000} required minLength={2} />
        <SubmitButton className="btn btn-secondary btn-sm" pendingText="Posting…">Post comment</SubmitButton>
      </form>
    </div>
  );
}
