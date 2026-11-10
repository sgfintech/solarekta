/* eslint-disable @next/next/no-img-element -- private, session-authorised media can't go through the image optimiser */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { surveyAccess } from "@/lib/survey/data";
import { buildDetail } from "@/lib/survey/detail";
import { EVIDENCE_CATEGORY_LABEL, SYSTEM_INTERESTS, VISIT_TYPES, type EvidenceCategory } from "@/lib/survey/config";
import { EVENT_LABEL, formatValue, orientationLabel } from "@/lib/survey/format";
import { answerFor, LOCATION_LABEL, STATUS_LABEL } from "@/lib/survey/model";
import { ITEM_STATUS_LABEL, ORIENTATION_OPTIONS } from "@/lib/survey/templates";
import { formatDuration } from "@/lib/survey/view";
import { Logo } from "@/components/logo";
import { PrintButton } from "@/components/survey/print-button";

export const metadata: Metadata = { title: "Site survey report", robots: { index: false } };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Branded, multi-page A4 report. Uses the viewer's access: customers get the shared version
 * without device locations, comments or history. Video entries show a preview and duration;
 * no media URL is printed, because links require signing in and must not be shared as permanent links.
 */
export default async function SurveyReport({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/surveys/${id}/report`);
  const access = surveyAccess(user, id);
  if (!access) notFound();
  const { survey, role } = access;
  const p = buildDetail(survey, role);
  const internal = role !== "customer";
  const d = p.data.details;
  const back = role === "reviewer" ? `/admin/surveys/${id}` : role === "customer" ? `/app/surveys/${id}` : `/installer/surveys/${id}/review`;
  const evidence = p.evidence.filter((e) => e.kind !== "signature" && e.status === "active" && e.reviewStatus !== "rejected");
  const exceptions = p.issues.filter((i) => i.severity === "warning");
  const answered = p.template.sections.reduce((n, s) => n + s.items.filter((i) => answerFor(p.data, i.id).status !== "not_assessed").length, 0);
  const total = p.template.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="report mx-auto max-w-[210mm] bg-white px-6 py-8 text-[13px] leading-relaxed text-ink print:px-0 print:py-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-4 py-3">
        <Link href={back} className="back-link">← Back</Link>
        <p className="text-sm text-ink-soft">Use your browser’s print dialog with paper size A4. Choose “Save as PDF” to keep a copy.</p>
        <PrintButton />
      </div>

      <div className="report-head flex items-start justify-between gap-4 border-b-4 border-sun pb-4">
        <div>
          <Logo href={null} size="sm" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-forest">Solar rooftop · Ocular visit report</p>
          <h1 className="mt-1 text-3xl font-bold text-forest-deep">{p.template.title}</h1>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold text-sun-deep">{p.template.code}</p>
          <p className="text-xs text-muted">{survey.reference} · Revision {survey.revision}</p>
          <p className="text-xs text-muted">Status: {STATUS_LABEL[survey.status]}</p>
          <p className="text-xs text-muted">Printed {fmt(new Date().toISOString())}</p>
        </div>
      </div>

      <section className="report-section mt-5">
        <h2>Client and site</h2>
        <table className="report-kv">
          <tbody>
            <tr><th>Client</th><td>{d.clientName || "—"}</td><th>Contact</th><td>{internal ? d.clientPhone || "—" : "Shared separately"}</td></tr>
            <tr><th>Site address</th><td colSpan={3}>{[d.address, d.city, d.province].filter(Boolean).join(", ") || "—"}</td></tr>
            <tr><th>Distribution utility</th><td>{d.utility || "—"}</td><th>GPS pin</th><td>{internal && d.siteLat != null ? `${d.siteLat}, ${d.siteLng}` : internal ? "—" : "Not included"}</td></tr>
            <tr><th>Surveyor</th><td>{d.surveyorName || "—"}</td><th>Company</th><td>{p.survey.installerName}</td></tr>
            <tr><th>Scheduled</th><td>{d.scheduledDate || "—"}</td><th>Visit</th><td>{p.survey.checkedInAt ? `${fmt(p.survey.checkedInAt)} (server)` : d.actualVisitAt ? `${d.actualVisitAt.replace("T", " ")} (entered)` : "—"}</td></tr>
            <tr><th>Visit type</th><td>{VISIT_TYPES.find((v) => v.value === d.visitType)?.label ?? d.visitType}</td><th>Interests</th><td>{d.interests.map((i) => SYSTEM_INTERESTS.find((s) => s.value === i)?.label ?? i).join(", ") || "—"}</td></tr>
            {d.purpose ? <tr><th>Purpose</th><td colSpan={3}>{d.purpose}</td></tr> : null}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted">{answered} of {total} checklist items assessed · Template {survey.template_version}</p>
      </section>

      {p.template.sections.map((section, si) => (
        <section key={section.id} className="report-section mt-5">
          <h2>{si + 1}. {section.title}</h2>
          {section.engineerReview ? <p className="text-xs text-[#7a5200]">Observations for qualified engineer review. Not a structural verification.</p> : null}
          <table className="report-table">
            <thead><tr><th style={{ width: "38%" }}>Check</th><th style={{ width: "16%" }}>Status</th><th>Values and notes</th></tr></thead>
            <tbody>
              {section.items.map((item) => {
                const a = answerFor(p.data, item.id);
                const values = (item.fields ?? []).map((f) => [f.label, formatValue(f, a.values[f.key])]).filter(([, v]) => v);
                return (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td className={`status-${a.status}`}>{ITEM_STATUS_LABEL[a.status]}</td>
                    <td>
                      {values.map(([k, v]) => <span key={k} className="block">{k}{/[?:]$/.test(String(k)) ? "" : ":"} <strong>{v}</strong></span>)}
                      {a.note ? <span className="block whitespace-pre-line text-ink-soft">{a.note}</span> : null}
                      {!values.length && !a.note ? <span className="text-muted">—</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {section.roofPlanes ? (
            <table className="report-table mt-2">
              <thead><tr><th>Roof plane</th><th>Usable area</th><th>Pitch</th><th>Faces</th><th>Notes</th></tr></thead>
              <tbody>
                {p.data.roofPlanes.length ? p.data.roofPlanes.map((pl, i) => (
                  <tr key={pl.id}><td>{pl.label || `Plane ${i + 1}`}</td><td>{pl.usableAreaM2 != null ? `${pl.usableAreaM2} m²` : "—"}</td><td>{pl.pitchDeg != null ? `${pl.pitchDeg}°` : "—"}</td><td>{orientationLabel(pl.orientation, ORIENTATION_OPTIONS)}</td><td className="whitespace-pre-line">{pl.notes || "—"}{section.id === "roof" && (pl.shadeMorning || pl.shadeNoon || pl.shadeAfternoon) ? ` Shade: ${pl.shadeMorning || "—"} / ${pl.shadeNoon || "—"} / ${pl.shadeAfternoon || "—"}` : ""}</td></tr>
                )) : <tr><td colSpan={5} className="text-muted">No roof planes recorded.</td></tr>}
              </tbody>
            </table>
          ) : null}
        </section>
      ))}

      <section className="report-section mt-5">
        <h2>Findings, preliminary recommendation and next steps</h2>
        <p className="whitespace-pre-line">{p.data.findings.notes || "No notes recorded."}</p>
        <p className="mt-2"><strong>Preliminary recommended capacity:</strong> {p.data.findings.recommendedKwp != null ? `${p.data.findings.recommendedKwp} kWp` : "Not stated"} — <em>subject to technical review and final engineering design.</em></p>
        <p className="mt-1 whitespace-pre-line"><strong>Next steps:</strong> {p.data.findings.nextSteps || "Not stated"}</p>
        {internal && exceptions.length ? (
          <>
            <h3 className="mt-3 font-semibold">Exceptions and open items</h3>
            <ul className="list-disc pl-5">{exceptions.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          </>
        ) : null}
        {internal && p.contradictions.length ? (
          <>
            <h3 className="mt-3 font-semibold">Answers flagged for checking</h3>
            <ul className="list-disc pl-5">{p.contradictions.map((c) => <li key={c}>{c}</li>)}</ul>
          </>
        ) : null}
      </section>

      <section className="report-section mt-5">
        <h2>Evidence ({evidence.length})</h2>
        {evidence.length === 0 ? <p className="text-muted">No evidence attached.</p> : null}
        <div className="report-evidence">
          {evidence.map((e, i) => (
            <figure key={e.id}>
              {e.thumbUrl || (e.kind === "photo" && e.mime !== "image/heic") ? <img src={e.thumbUrl ?? e.url} alt="" /> : <div className="report-placeholder">{e.kind === "document" ? "PDF document" : e.kind === "video" ? "Video" : "Photo"}</div>}
              <figcaption>
                <strong>E{i + 1}. {EVIDENCE_CATEGORY_LABEL[e.category as EvidenceCategory] ?? e.category}</strong>
                {e.kind === "video" ? ` · Video${e.durationSec ? `, ${formatDuration(e.durationSec)}` : ""}` : ""}
                {e.caption ? <span className="block">{e.caption}</span> : null}
                <span className="block text-muted">Uploaded {fmt(e.uploadedAt)}{internal && e.capturedAt ? ` · captured ${fmt(e.capturedAt)} (device)` : ""}</span>
                {e.kind === "video" ? <span className="block text-muted">Play in SOLARekta (sign-in required) · ref {e.id.slice(0, 8)}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {internal ? (
        <section className="report-section mt-5">
          <h2>Visit record</h2>
          <table className="report-kv">
            <tbody>
              <tr><th>Visit started</th><td>{fmt(p.survey.checkedInAt)} (server time)</td><th>Visit finished</th><td>{fmt(p.survey.checkedOutAt)} (server time)</td></tr>
              <tr><th>Location check</th><td colSpan={3}>{LOCATION_LABEL[p.survey.locationStatus]}{p.survey.checkIn?.distance != null ? ` — ${p.survey.checkIn.distance} m from the site pin` : ""}{p.survey.exceptionApprovedAt ? `. Exception accepted: ${p.survey.exceptionReason}` : ""}. Device-reported locations support, but do not prove, attendance.</td></tr>
            </tbody>
          </table>
          <h3 className="mt-3 font-semibold">Timeline</h3>
          <ol className="report-timeline">
            {p.events.filter((e) => e.type !== "evidence_added").map((e) => <li key={e.id}><span>{fmt(e.at)}</span> {EVENT_LABEL[e.type] ?? e.type}{e.actorName ? ` (${e.actorName})` : ""}{e.message && e.type !== "visit_started" && e.type !== "visit_finished" ? `: ${e.message}` : ""}</li>)}
          </ol>
        </section>
      ) : null}

      <section className="report-section mt-5">
        <h2>Acknowledgment and review</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Client acknowledgment</h3>
            {p.acknowledgments.length ? p.acknowledgments.map((a, i) => (
              <div key={i} className="mt-1">
                {a.signatureUrl && internal ? <img src={a.signatureUrl} alt={`Signature drawn by ${a.clientName}`} className="h-14 border-b border-ink" /> : null}
                <p>{a.clientName} · {fmt(a.at)} (server time)</p>
                <p className="text-xs text-muted">Drawn acknowledgment ({a.consentVersion}); not a cryptographically verified digital signature.</p>
              </div>
            )) : <p className="text-muted">Not recorded.</p>}
          </div>
          <div>
            <h3 className="font-semibold">Technical review</h3>
            <p>{STATUS_LABEL[survey.status]}{p.survey.reviewerName ? ` · ${p.survey.reviewerName}` : ""}{p.survey.reviewedAt ? ` · ${fmt(p.survey.reviewedAt)}` : ""}</p>
            {p.survey.reviewNote ? <p className="text-ink-soft">“{p.survey.reviewNote}”</p> : null}
            <p className="text-xs text-muted">“Approved” means the survey record passed SOLARekta’s internal review. It is not structural approval, utility approval or permission to install.</p>
          </div>
        </div>
      </section>

      <p className="mt-6 border-t border-line pt-3 text-xs text-muted">
        Confirm measurements before design. Preliminary findings are subject to a licensed engineer’s and the utility’s requirements. Generated by SOLARekta from revision {survey.revision} of {survey.reference}.
      </p>
    </div>
  );
}
