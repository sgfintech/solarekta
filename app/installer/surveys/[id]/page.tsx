import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serverLimits } from "@/lib/survey/config";
import { listAcknowledgments, listEvidence, surveyAccess, surveyData, templateFor } from "@/lib/survey/data";
import { EDITABLE } from "@/lib/survey/model";
import { evidenceView } from "@/lib/survey/view";
import { SurveyEditor } from "@/components/survey/survey-editor";

export const metadata = { title: "Site survey" };

export default async function SurveyEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const user = await requireUser(["installer"]);
  const { id } = await params;
  const { section } = await searchParams;
  const access = surveyAccess(user, id);
  if (!access || access.role !== "surveyor") notFound();
  const { survey } = access;
  if (!EDITABLE.includes(survey.status)) redirect(`/installer/surveys/${id}/review`);
  const limits = serverLimits();
  return (
    <SurveyEditor
      key={survey.id}
      survey={{
        id: survey.id,
        reference: survey.reference,
        type: survey.type,
        status: survey.status,
        revision: survey.revision,
        version: survey.version,
        checkedInAt: survey.checked_in_at,
        checkedOutAt: survey.checked_out_at,
        locationStatus: survey.location_status,
        exceptionApproved: Boolean(survey.exception_approved_at),
        acknowledgments: listAcknowledgments(survey.id).map((a) => ({ clientName: a.client_name, at: a.acknowledged_at })),
      }}
      template={templateFor(survey)}
      initialData={surveyData(survey)}
      initialEvidence={listEvidence(survey.id).map((e) => evidenceView(e, "surveyor"))}
      requirements={limits.requiredEvidence}
      requireCheckIn={limits.requireCheckIn}
      initialSection={section}
    />
  );
}
