import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { surveyAccess } from "@/lib/survey/data";
import { buildDetail } from "@/lib/survey/detail";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/survey/model";
import { SurveyDetail } from "@/components/survey/survey-detail";

export const metadata = { title: "Site survey" };

export default async function CustomerSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const access = surveyAccess(user, id);
  if (!access || access.role !== "customer") notFound();
  const { survey } = access;
  const detail = buildDetail(survey, "customer");
  return (
    <div className="space-y-6">
      <Link href="/app/surveys" className="back-link">← Site surveys</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{survey.reference} · {detail.survey.installerName}</p>
          <h1 className="display-sm mt-1 text-forest-deep">{survey.type === "residential" ? "Residential" : "Commercial"} site survey</h1>
          <p className="mt-1"><span className={`badge ${STATUS_TONE[survey.status]}`}>{STATUS_LABEL[survey.status]}</span></p>
        </div>
        <Link href={`/surveys/${id}/report`} className="btn btn-secondary btn-sm">Print / PDF report</Link>
      </div>
      <p className="alert-warn text-sm">This is the installer’s site survey. Findings are preliminary and subject to technical review. It is not a quotation, structural approval or permission to install.</p>
      <SurveyDetail {...detail} />
    </div>
  );
}
