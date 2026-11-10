import { requireUser } from "@/lib/auth";
import { listSurveys } from "@/lib/survey/data";
import { PageHeader } from "@/components/page-header";
import { SurveyFilters, SurveyList, parseFilters } from "@/components/survey/survey-list";

export const metadata = { title: "Survey review" };

export default async function AdminSurveysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser(["admin"]);
  const q = await searchParams;
  const filters = parseFilters(q);
  const showDrafts = q.drafts === "1";
  const rows = listSurveys({ admin: true, excludeDrafts: !showDrafts && !filters.status }, filters);
  return (
    <>
      <PageHeader eyebrow="Review" title="Site survey review" description="Submitted ocular surveys from installers. Approval means the record passed internal review — not structural, utility or installation approval." />
      <SurveyFilters action="/admin/surveys" filters={filters} />
      <p className="mt-3 text-xs text-muted">{showDrafts ? "Including drafts in progress." : "Drafts and in-progress surveys are hidden."} <a className="link-action" href={showDrafts ? "/admin/surveys" : "/admin/surveys?drafts=1"}>{showDrafts ? "Hide drafts" : "Show drafts"}</a></p>
      <div className="mt-4"><SurveyList rows={rows} hrefFor={(r) => `/admin/surveys/${r.id}`} showInstaller /></div>
    </>
  );
}
