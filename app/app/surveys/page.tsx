import { requireUser } from "@/lib/auth";
import { listSurveys } from "@/lib/survey/data";
import { PageHeader } from "@/components/page-header";
import { SurveyList } from "@/components/survey/survey-list";

export const metadata = { title: "Site surveys" };

export default async function CustomerSurveysPage() {
  const user = await requireUser(["customer"]);
  const rows = listSurveys({ customerUserId: user.id });
  return (
    <>
      <PageHeader eyebrow="Your projects" title="Site surveys" description="Ocular visit reports your installers chose to share with you." />
      {rows.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
          <h2 className="text-xl text-forest-deep">No shared surveys yet</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">After an installer visits your property, they can share the survey summary here.</p>
        </div>
      ) : (
        <SurveyList rows={rows} hrefFor={(r) => `/app/surveys/${r.id}`} />
      )}
    </>
  );
}
