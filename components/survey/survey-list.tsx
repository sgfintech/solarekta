import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE, LOCATION_LABEL, type SurveyStatus } from "@/lib/survey/model";
import type { SurveyListFilters, SurveyListRow } from "@/lib/survey/data";

/** GET filter form shared by installer and reviewer lists (works without JavaScript). */
export function SurveyFilters({ action, filters, showSurveyor = true }: { action: string; filters: SurveyListFilters; showSurveyor?: boolean }) {
  return (
    <form action={action} method="get" className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter surveys">
      <div className="sm:col-span-2"><label className="label" htmlFor="f-q">Client, site or reference</label><input id="f-q" name="q" className="input" defaultValue={filters.q ?? ""} placeholder="e.g. Santos, Pasig or SRV-2026" /></div>
      <div>
        <label className="label" htmlFor="f-type">Type</label>
        <select id="f-type" name="type" className="select" defaultValue={filters.type ?? ""}><option value="">All</option><option value="residential">Residential</option><option value="commercial">Commercial</option></select>
      </div>
      <div>
        <label className="label" htmlFor="f-status">Status</label>
        <select id="f-status" name="status" className="select" defaultValue={filters.status ?? ""}>
          <option value="">All</option>
          {(Object.keys(STATUS_LABEL) as SurveyStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {showSurveyor ? <div><label className="label" htmlFor="f-surveyor">Surveyor</label><input id="f-surveyor" name="surveyor" className="input" defaultValue={filters.surveyor ?? ""} /></div> : null}
      <div><label className="label" htmlFor="f-from">Visit from</label><input id="f-from" name="from" type="date" className="input" defaultValue={filters.from ?? ""} /></div>
      <div><label className="label" htmlFor="f-to">Visit to</label><input id="f-to" name="to" type="date" className="input" defaultValue={filters.to ?? ""} /></div>
      <div className="flex flex-col justify-end gap-1 text-sm">
        <label className="inline-flex min-h-7 items-center gap-2"><input type="checkbox" name="missing" value="1" defaultChecked={filters.missingEvidence} /> Missing required evidence</label>
        <label className="inline-flex min-h-7 items-center gap-2"><input type="checkbox" name="flagged" value="1" defaultChecked={filters.flagged} /> Flagged visit / location</label>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn btn-primary btn-sm">Apply filters</button>
        <Link href={action} className="btn btn-ghost btn-sm">Clear</Link>
      </div>
    </form>
  );
}

export function parseFilters(q: Record<string, string | undefined>): SurveyListFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return { q: q.q?.slice(0, 80) || undefined, type: q.type || undefined, status: q.status && q.status in STATUS_LABEL ? q.status : undefined, surveyor: q.surveyor?.slice(0, 80) || undefined, from: date(q.from), to: date(q.to), missingEvidence: q.missing === "1", flagged: q.flagged === "1" };
}

export function SurveyList({ rows, hrefFor, showInstaller = false }: { rows: SurveyListRow[]; hrefFor: (r: SurveyListRow) => string; showInstaller?: boolean }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-ink-soft">No surveys match these filters.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={hrefFor(r)} className="card card-pad flex flex-wrap items-center justify-between gap-3 no-underline transition-shadow hover:shadow-lift">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.reference} · {r.type === "residential" ? "Residential" : "Commercial"} · Rev {r.revision}{r.is_demo ? " · Demo" : ""}</p>
              <p className="mt-0.5 truncate font-semibold text-forest-deep">{r.client_name || "Client not recorded"}</p>
              <p className="truncate text-sm text-ink-soft">{r.site_label || "Address not recorded"}</p>
              <p className="mt-1 text-xs text-muted">
                {r.surveyor_name || "Surveyor not set"}{showInstaller ? ` · ${r.installer_name}` : ""} · {r.checked_in_at ? `Visited ${new Date(r.checked_in_at).toLocaleDateString("en-PH")}` : r.scheduled_date ? `Scheduled ${r.scheduled_date}` : "Not scheduled"} · {r.photo_count} photo{r.photo_count === 1 ? "" : "s"}, {r.evidence_count} file{r.evidence_count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`badge ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              {r.location_status !== "consistent" && r.location_status !== "not_recorded" && !r.exception_approved_at ? <span className="badge badge-warn" title={LOCATION_LABEL[r.location_status]}>Location flag</span> : null}
              {!r.checked_in_at && !["draft", "in_progress"].includes(r.status) ? <span className="badge badge-warn">No check-in</span> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
