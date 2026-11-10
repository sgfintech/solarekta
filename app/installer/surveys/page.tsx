import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { installerForUser, listSurveys } from "@/lib/survey/data";
import { createSurveyAction } from "@/app/actions/surveys";
import { PageHeader } from "@/components/page-header";
import { SurveyFilters, SurveyList, parseFilters } from "@/components/survey/survey-list";

export const metadata = { title: "Site surveys" };

export default async function InstallerSurveysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(["installer"]);
  const q = await searchParams;
  const installer = installerForUser(user.id);
  const filters = parseFilters(q);
  const rows = installer ? listSurveys({ installerId: installer.id }, filters) : [];
  const leads = installer
    ? (db
        .prepare(
          `SELECT qr.id, s.city, s.property_type, qr.share_contact, qr.contact_name FROM quote_invites qi JOIN quote_requests qr ON qr.id = qi.quote_request_id JOIN sites s ON s.id = qr.site_id
           WHERE qi.installer_id = ? AND qi.status NOT IN ('declined','withdrawn') ORDER BY qr.created_at DESC LIMIT 50`,
        )
        .all(installer.id) as { id: string; city: string; property_type: string; share_contact: number; contact_name: string | null }[])
    : [];
  const verified = installer?.verification_status === "verified";

  return (
    <>
      <PageHeader eyebrow="Field work" title="Site surveys" description="Ocular visits: record findings on your phone, attach evidence and submit for technical review." />
      {q.error === "verify" || !verified ? <p className="alert-warn mb-5">Site surveys are available once your company is verified.</p> : null}
      {verified ? (
        <form action={createSurveyAction} className="card card-pad mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="n-type">New survey</label>
            <select id="n-type" name="type" className="select" defaultValue="residential"><option value="residential">Residential rooftop</option><option value="commercial">Commercial rooftop</option></select>
          </div>
          <div><label className="label" htmlFor="n-date">Scheduled date</label><input id="n-date" name="scheduledDate" type="date" className="input" /></div>
          <div>
            <label className="label" htmlFor="n-lead">Link to a lead <span className="font-normal text-muted">(optional)</span></label>
            <select id="n-lead" name="quoteRequestId" className="select" defaultValue={q.lead ?? ""}>
              <option value="">No linked lead</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.share_contact && l.contact_name ? l.contact_name : "Homeowner"} · {l.city} · {l.property_type}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Create survey</button>
        </form>
      ) : null}
      <SurveyFilters action="/installer/surveys" filters={filters} />
      <div className="mt-5">
        <SurveyList rows={rows} hrefFor={(r) => (["draft", "in_progress", "changes_requested"].includes(r.status) ? `/installer/surveys/${r.id}` : `/installer/surveys/${r.id}/review`)} />
      </div>
    </>
  );
}
