/* eslint-disable @next/next/no-img-element -- private, session-authorised media can't go through the image optimiser */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/provider";
import { listEvidence, surveyAccess } from "@/lib/survey/data";
import { buildDetail } from "@/lib/survey/detail";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/survey/model";
import { EVIDENCE_CATEGORY_LABEL, type EvidenceCategory } from "@/lib/survey/config";
import { approveExceptionAction, commentAction, decideSurveyAction, reviewEvidenceAction, startReviewAction } from "@/app/actions/surveys";
import { SurveyDetail } from "@/components/survey/survey-detail";
import { SurveyAiPanel } from "@/components/survey/survey-ai-panel";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Review survey" };

const ERRORS: Record<string, string> = {
  note: "Explain what needs to change (at least 5 characters).",
  state: "The survey changed state. Refresh and try again.",
  "evidence-note": "Give a reason for rejecting the evidence.",
  exception: "Give a reason for accepting the exception (at least 5 characters).",
};

export default async function AdminSurveyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; decided?: string; ai?: string }> }) {
  const user = await requireUser(["admin"]);
  const { id } = await params;
  const q = await searchParams;
  const access = surveyAccess(user, id);
  if (!access) notFound();
  const { survey } = access;
  const detail = buildDetail(survey, "reviewer");
  const evidence = listEvidence(id).filter((e) => e.kind !== "signature");
  const flagged = (survey.location_status !== "consistent" || !survey.checked_in_at) && !survey.exception_approved_at;

  return (
    <div className="space-y-6">
      <Link href="/admin/surveys" className="back-link">← Survey review</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{survey.reference} · {survey.type === "residential" ? "Residential" : "Commercial"} · Revision {survey.revision} · {detail.survey.installerName}</p>
          <h1 className="display-sm mt-1 text-forest-deep">{survey.client_name || "Site survey"}</h1>
          <p className="mt-1"><span className={`badge ${STATUS_TONE[survey.status]}`}>{STATUS_LABEL[survey.status]}</span></p>
        </div>
        <Link href={`/surveys/${id}/report`} className="btn btn-secondary btn-sm">Print / PDF report</Link>
      </div>
      {q.error && ERRORS[q.error] ? <p role="alert" className="alert-error">{ERRORS[q.error]}</p> : null}
      {q.decided ? <p role="status" className="alert-success">Decision recorded and the installer notified.</p> : null}

      {survey.status === "submitted" ? (
        <form action={startReviewAction} className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="surveyId" value={id} />
          <p className="text-sm text-ink-soft">Submitted {survey.submitted_at ? new Date(survey.submitted_at).toLocaleString("en-PH") : ""}. Start the review to approve or request changes.</p>
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Starting…">Start review</SubmitButton>
        </form>
      ) : null}

      {survey.status === "under_review" ? (
        <section id="decision" className="card card-pad space-y-3" aria-labelledby="decision-h">
          <h2 id="decision-h" className="text-lg font-semibold text-forest-deep">Decision</h2>
          <p className="text-sm text-ink-soft">“Approve” confirms the survey record passed internal review. It does not mean structural approval, utility approval or permission to install.</p>
          <form action={decideSurveyAction} className="space-y-2">
            <input type="hidden" name="surveyId" value={id} />
            <label className="label" htmlFor="note">Reviewer note <span className="font-normal text-muted">(required when requesting changes)</span></label>
            <textarea id="note" name="note" rows={3} maxLength={2000} className="textarea" aria-invalid={q.error === "note" || undefined} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="decision" value="approved" className="btn btn-primary btn-sm" pendingText="Saving…">Approve record</SubmitButton>
              <SubmitButton name="decision" value="changes_requested" className="btn btn-secondary btn-sm" pendingText="Saving…">Request changes</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      {flagged && survey.status !== "draft" ? (
        <section className="card card-pad space-y-2" aria-labelledby="exc-h">
          <h2 id="exc-h" className="text-lg font-semibold text-forest-deep">Visit or location flag</h2>
          <p className="text-sm text-ink-soft">{!survey.checked_in_at ? "No “Start site visit” record." : "The device location at check-in was missing, imprecise or far from the site pin."} Accept an exception only with a reason (e.g. confirmed by phone with the client, GPS indoors).</p>
          <form action={approveExceptionAction} className="space-y-2">
            <input type="hidden" name="surveyId" value={id} />
            <label className="label" htmlFor="exc-reason">Reason</label>
            <input id="exc-reason" name="reason" required minLength={5} maxLength={1000} className="input" />
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Saving…">Accept exception</SubmitButton>
          </form>
        </section>
      ) : null}

      {evidence.length ? (
        <section className="card card-pad" aria-labelledby="evr-h">
          <h2 id="evr-h" className="text-lg font-semibold text-forest-deep">Evidence review</h2>
          <p className="text-sm text-ink-soft">Accept or reject each file. Rejecting requires a reason; rejected files don’t count toward required evidence.</p>
          <ul className="mt-3 divide-y divide-line">
            {evidence.map((e) => (
              <li key={e.id} id={`ev-${e.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <a href={`/api/surveys/evidence/${e.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${e.kind} in a new tab: ${e.caption || e.original_name}`} className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-paper-deep">
                  {e.thumb_storage_key || e.kind === "photo" ? <img src={`/api/surveys/evidence/${e.id}${e.thumb_storage_key ? "?v=thumb" : ""}`} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs font-semibold text-muted">{e.kind.toUpperCase()}</span>}
                </a>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{EVIDENCE_CATEGORY_LABEL[e.category as EvidenceCategory] ?? e.category}{e.status === "removed" ? " · removed by surveyor" : ""}</p>
                  <p className="truncate text-ink-soft">{e.caption || e.original_name}</p>
                  <p className="text-xs text-muted">{e.review_status === "pending" ? "Not reviewed" : e.review_status === "accepted" ? "Accepted" : `Rejected: ${e.review_note}`}</p>
                </div>
                <form action={reviewEvidenceAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="evidenceId" value={e.id} />
                  <label className="sr-only" htmlFor={`rn-${e.id}`}>Reason</label>
                  <input id={`rn-${e.id}`} name="note" className="input h-10 w-40" placeholder="Reason (to reject)" maxLength={500} />
                  <SubmitButton name="decision" value="accepted" className="btn btn-ghost btn-sm" pendingText="…">Accept</SubmitButton>
                  <SubmitButton name="decision" value="rejected" className="btn btn-ghost btn-sm text-clay" pendingText="…">Reject</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SurveyAiPanel surveyId={id} aiJson={survey.ai_json} aiEnabled={aiStatus().enabled} canAccept={false} limited={q.ai === "limit"} />
      <SurveyDetail {...detail} />

      <form action={commentAction} className="card card-pad space-y-2">
        <input type="hidden" name="surveyId" value={id} />
        <label className="label" htmlFor="comment">Reviewer comment</label>
        <textarea id="comment" name="message" className="textarea" rows={2} maxLength={2000} required minLength={2} />
        <SubmitButton className="btn btn-secondary btn-sm" pendingText="Posting…">Post comment</SubmitButton>
      </form>
    </div>
  );
}
