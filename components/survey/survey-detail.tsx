/* eslint-disable @next/next/no-img-element -- private, session-authorised media can't go through the image optimiser */
import { Alert, Check } from "@/components/icons";
import { EvidenceGallery } from "@/components/survey/evidence-uploader";
import { EVIDENCE_CATEGORY_LABEL, SYSTEM_INTERESTS, VISIT_TYPES, type EvidenceCategory } from "@/lib/survey/config";
import { EVENT_LABEL, formatValue, orientationLabel } from "@/lib/survey/format";
import { answerFor, LOCATION_LABEL, STATUS_LABEL, STATUS_TONE, type CheckIssue, type SurveyData, type SurveyStatus, type LocationStatus } from "@/lib/survey/model";
import { ITEM_STATUS_LABEL, ORIENTATION_OPTIONS, type ItemStatus, type TemplateDef } from "@/lib/survey/templates";
import type { EvidenceView } from "@/lib/survey/view";

const ITEM_TONE: Record<ItemStatus, string> = { not_assessed: "badge-neutral", completed: "badge-good", issue: "badge-bad", na: "badge-neutral" };

export interface DetailProps {
  role: "surveyor" | "reviewer" | "customer";
  survey: {
    id: string;
    reference: string;
    type: string;
    status: SurveyStatus;
    revision: number;
    templateVersion: string;
    installerName: string;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    locationStatus: LocationStatus;
    checkIn: { device: { lat: number; lng: number; accuracy: number | null } | null; distance: number | null; geofenceMeters?: number; outcome: string } | null;
    exceptionReason: string | null;
    exceptionApprovedAt: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewerName: string | null;
    reviewNote: string | null;
  };
  template: TemplateDef;
  data: SurveyData;
  evidence: EvidenceView[];
  issues: CheckIssue[];
  contradictions: string[];
  events: { id: string; type: string; message: string | null; actorName: string | null; at: string }[];
  revisions: { revision: number; status: string; reason: string | null; changed: string[]; by: string | null; at: string }[];
  acknowledgments: { clientName: string; at: string; consentVersion: string; signatureUrl: string | null }[];
}

/** Read-only survey record: findings, values, statuses, evidence, visit and history. */
export function SurveyDetail(p: DetailProps) {
  const { data, template, role } = p;
  const internal = role !== "customer";
  const d = data.details;
  const interests = d.interests.map((i) => SYSTEM_INTERESTS.find((s) => s.value === i)?.label ?? i).join(", ") || "None recorded";
  const blockers = p.issues.filter((i) => i.severity === "blocker");
  const warnings = p.issues.filter((i) => i.severity === "warning");
  const byCategory = Object.entries(p.evidence.filter((e) => e.kind !== "signature").reduce<Record<string, EvidenceView[]>>((a, e) => ((a[e.category] ??= []).push(e), a), {}));

  return (
    <div className="space-y-6">
      {/* Separate states: evidence, location, acknowledgment, reviewer */}
      <section aria-label="Record states" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <State label="Review status" value={STATUS_LABEL[p.survey.status]} tone={STATUS_TONE[p.survey.status]} note={p.survey.status === "approved" ? "Internal record review only — not structural, utility or installation approval." : undefined} />
        <State label="Evidence submitted" value={`${p.evidence.filter((e) => e.kind !== "signature" && e.status === "active").length} files`} tone="badge-neutral" note={internal ? `${p.evidence.filter((e) => e.reviewStatus === "accepted").length} accepted, ${p.evidence.filter((e) => e.reviewStatus === "rejected").length} rejected by reviewer` : undefined} />
        {internal ? <State label="Location vs site pin" value={LOCATION_LABEL[p.survey.locationStatus]} tone={p.survey.locationStatus === "consistent" ? "badge-good" : p.survey.locationStatus === "not_recorded" ? "badge-neutral" : "badge-warn"} note={p.survey.exceptionApprovedAt ? `Exception accepted: ${p.survey.exceptionReason}` : "Device-reported; supports but doesn’t prove attendance."} /> : null}
        <State label="Client acknowledged" value={p.acknowledgments.length ? `Yes — ${p.acknowledgments[0].clientName}` : "No"} tone={p.acknowledgments.length ? "badge-good" : "badge-neutral"} note={p.acknowledgments.length ? "Drawn acknowledgment, not a digital signature." : undefined} />
      </section>

      {internal && (blockers.length || warnings.length || p.contradictions.length) ? (
        <section className="card card-pad" aria-labelledby="missing-h">
          <h2 id="missing-h" className="text-lg font-semibold text-forest-deep">Missing items and flags</h2>
          {blockers.length ? <ul className="mt-2 space-y-1 text-sm">{blockers.map((b, i) => <li key={i} className="flex gap-2"><Alert className="mt-0.5 h-4 w-4 shrink-0 text-clay" /> {b.message}</li>)}</ul> : null}
          {warnings.length ? <ul className="mt-2 space-y-1 text-sm text-ink-soft">{warnings.map((w, i) => <li key={i} className="flex gap-2"><Alert className="mt-0.5 h-4 w-4 shrink-0 text-[#a06b00]" /> {w.message}</li>)}</ul> : null}
          {p.contradictions.length ? <><p className="mt-3 text-sm font-semibold text-ink">Answers that disagree</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">{p.contradictions.map((c) => <li key={c}>{c}</li>)}</ul></> : null}
        </section>
      ) : null}

      <section className="card card-pad" aria-labelledby="details-h">
        <h2 id="details-h" className="text-lg font-semibold text-forest-deep">Client and site</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Client" v={d.clientName || "—"} />
          {internal ? <Row k="Contact number" v={d.clientPhone || "—"} /> : null}
          <Row k="Site address" v={[d.address, d.city, d.province].filter(Boolean).join(", ") || "—"} />
          <Row k="Distribution utility" v={d.utility || "—"} />
          {internal ? <Row k="GPS pin" v={d.siteLat != null && d.siteLng != null ? `${d.siteLat}, ${d.siteLng} (${d.siteLocationSource === "device" ? "device location" : "entered manually"})` : "—"} /> : null}
          <Row k="Surveyor / company" v={`${d.surveyorName || "—"} · ${p.survey.installerName}`} />
          <Row k="Scheduled" v={d.scheduledDate || "—"} />
          <Row k="Actual visit" v={p.survey.checkedInAt ? `${new Date(p.survey.checkedInAt).toLocaleString("en-PH")} (server time)` : d.actualVisitAt ? `${d.actualVisitAt.replace("T", " ")} (entered by surveyor)` : "—"} />
          <Row k="Visit type" v={VISIT_TYPES.find((v) => v.value === d.visitType)?.label ?? d.visitType} />
          <Row k="Purpose" v={d.purpose || "—"} />
          <Row k="System interests" v={interests} />
        </dl>
      </section>

      {template.sections.map((section) => (
        <section key={section.id} className="card card-pad break-inside-avoid-page" aria-labelledby={`sec-${section.id}`}>
          <h2 id={`sec-${section.id}`} className="text-lg font-semibold text-forest-deep">{section.title}</h2>
          {section.engineerReview ? <p className="mt-1 text-xs text-[#7a5200]">Observations for engineer review — not a structural verification.</p> : null}
          <ul className="mt-3 divide-y divide-line">
            {section.items.map((item) => {
              const a = answerFor(data, item.id);
              const values = (item.fields ?? []).map((f) => ({ label: f.label, value: formatValue(f, a.values[f.key]) })).filter((v) => v.value);
              const itemEvidence = p.evidence.filter((e) => e.itemId === item.id && e.kind !== "signature");
              return (
                <li key={item.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium text-ink">{item.label}</span>
                    <span className={`badge ${ITEM_TONE[a.status]}`}>{ITEM_STATUS_LABEL[a.status]}</span>
                  </div>
                  {values.length ? <p className="mt-0.5 text-ink-soft">{values.map((v) => `${v.label}${/[?:]$/.test(v.label) ? "" : ":"} ${v.value}`).join(" · ")}</p> : null}
                  {a.note ? <p className="mt-0.5 whitespace-pre-line text-ink-soft">“{a.note}”</p> : null}
                  {itemEvidence.length ? <p className="mt-0.5 text-xs text-muted">{itemEvidence.length} linked evidence file{itemEvidence.length === 1 ? "" : "s"}</p> : null}
                </li>
              );
            })}
          </ul>
          {section.roofPlanes ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink">Roof planes</h3>
              {data.roofPlanes.length ? (
                <div className="table-scroll mt-2 rounded-xl border border-line" tabIndex={0} role="region" aria-label="Roof planes, scrolls sideways on small screens">
                  <table className="table text-sm">
                    <thead><tr><th>Plane</th><th className="text-right">Usable area</th><th className="text-right">Pitch</th><th>Faces</th><th>Notes</th></tr></thead>
                    <tbody>
                      {data.roofPlanes.map((pl, i) => (
                        <tr key={pl.id}><td>{pl.label || `Plane ${i + 1}`}</td><td className="text-right">{pl.usableAreaM2 != null ? `${pl.usableAreaM2} m²` : "—"}</td><td className="text-right">{pl.pitchDeg != null ? `${pl.pitchDeg}°` : "—"}</td><td>{orientationLabel(pl.orientation, ORIENTATION_OPTIONS)}</td><td className="whitespace-pre-line">{pl.notes || "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mt-1 text-sm text-muted">No roof planes recorded.</p>}
            </div>
          ) : null}
          {section.planeShading && data.roofPlanes.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink">Shading per plane</h3>
              <ul className="mt-1 space-y-1 text-sm text-ink-soft">{data.roofPlanes.map((pl, i) => <li key={pl.id}><span className="font-medium text-ink">{pl.label || `Plane ${i + 1}`}:</span> morning {pl.shadeMorning || "—"}; noon {pl.shadeNoon || "—"}; afternoon {pl.shadeAfternoon || "—"}</li>)}</ul>
            </div>
          ) : null}
        </section>
      ))}

      <section className="card card-pad" aria-labelledby="findings-h">
        <h2 id="findings-h" className="text-lg font-semibold text-forest-deep">Findings and next steps</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-ink">{data.findings.notes || "No notes recorded."}</p>
        <p className="mt-3 text-sm"><span className="font-semibold">Preliminary recommended capacity:</span> {data.findings.recommendedKwp != null ? `${data.findings.recommendedKwp} kWp` : "Not stated"} <span className="text-muted">— subject to technical review and final design.</span></p>
        <p className="mt-2 whitespace-pre-line text-sm"><span className="font-semibold">Next steps:</span> {data.findings.nextSteps || "Not stated"}</p>
      </section>

      <section id="evidence" className="card card-pad" aria-labelledby="ev-h">
        <h2 id="ev-h" className="text-lg font-semibold text-forest-deep">Visit evidence</h2>
        {byCategory.length === 0 ? <p className="mt-2 text-sm text-muted">No evidence uploaded.</p> : null}
        <div className="mt-3 space-y-4">
          {byCategory.map(([cat, list]) => (
            <div key={cat}>
              <h3 className="mb-2 text-sm font-semibold text-ink">{EVIDENCE_CATEGORY_LABEL[cat as EvidenceCategory] ?? cat} ({list.length})</h3>
              <EvidenceGallery evidence={list} editable={false} showMeta={internal} />
            </div>
          ))}
        </div>
      </section>

      {p.acknowledgments.length ? (
        <section className="card card-pad" aria-labelledby="ack-h">
          <h2 id="ack-h" className="text-lg font-semibold text-forest-deep">Client acknowledgment</h2>
          {p.acknowledgments.map((a, i) => (
            <div key={i} className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              {a.signatureUrl && internal ? <img src={a.signatureUrl} alt={`Signature drawn by ${a.clientName}`} className="h-16 rounded-lg border border-line bg-white p-1" /> : null}
              <p>{a.clientName} · {new Date(a.at).toLocaleString("en-PH")} (server time) · consent text {a.consentVersion}<br /><span className="text-xs text-muted">Drawn acknowledgment, not a cryptographically verified digital signature.</span></p>
            </div>
          ))}
        </section>
      ) : null}

      {internal ? (
        <section id="visit" className="card card-pad" aria-labelledby="visit-h">
          <h2 id="visit-h" className="text-lg font-semibold text-forest-deep">Visit record</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Started (server time)" v={p.survey.checkedInAt ? new Date(p.survey.checkedInAt).toLocaleString("en-PH") : "Not recorded"} />
            <Row k="Finished (server time)" v={p.survey.checkedOutAt ? new Date(p.survey.checkedOutAt).toLocaleString("en-PH") : "Not recorded"} />
            <Row k="Check-in location (device-reported)" v={p.survey.checkIn?.device ? `${p.survey.checkIn.device.lat}, ${p.survey.checkIn.device.lng} (±${p.survey.checkIn.device.accuracy ?? "?"} m)` : p.survey.checkIn ? `Not shared (${p.survey.checkIn.outcome})` : "—"} />
            <Row k="Distance from site pin" v={p.survey.checkIn?.distance != null ? `${p.survey.checkIn.distance} m (limit ${p.survey.checkIn.geofenceMeters ?? "—"} m)` : "—"} />
          </dl>
        </section>
      ) : null}

      {internal ? (
        <section id="timeline" className="card card-pad" aria-labelledby="tl-h">
          <h2 id="tl-h" className="text-lg font-semibold text-forest-deep">Timeline and comments</h2>
          <ol className="mt-3 space-y-2.5 border-l-2 border-line pl-4">
            {p.events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-forest" aria-hidden="true" />
                <p className="font-medium text-ink">{EVENT_LABEL[e.type] ?? e.type}{e.actorName ? <span className="font-normal text-muted"> · {e.actorName}</span> : null}</p>
                {e.message ? <p className={e.type === "comment" ? "mt-0.5 rounded-lg bg-paper px-3 py-1.5 text-ink" : "text-ink-soft"}>{e.message}</p> : null}
                <p className="text-xs text-muted">{new Date(e.at).toLocaleString("en-PH")}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {internal && p.revisions.length ? (
        <section className="card card-pad" aria-labelledby="rev-h">
          <h2 id="rev-h" className="text-lg font-semibold text-forest-deep">Revision history</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {p.revisions.map((r, i) => (
              <li key={i} className="rounded-xl border border-line px-3 py-2">
                <p className="font-medium text-ink">Revision {r.revision} · {STATUS_LABEL[r.status as SurveyStatus] ?? r.status} <span className="font-normal text-muted">· {new Date(r.at).toLocaleString("en-PH")}{r.by ? ` · ${r.by}` : ""}</span></p>
                {r.reason ? <p className="text-ink-soft">{r.reason}</p> : null}
                {r.changed.length ? <p className="text-xs text-muted">Changed since the previous snapshot: {r.changed.length} field{r.changed.length === 1 ? "" : "s"} ({r.changed.slice(0, 6).join(", ")}{r.changed.length > 6 ? "…" : ""})</p> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Each submission and review decision stores an unchangeable snapshot. Template {p.survey.templateVersion}.</p>
        </section>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

function State({ label, value, tone, note }: { label: string; value: string; tone: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5"><span className={`badge ${tone}`}>{value}</span></p>
      {note ? <p className="mt-1.5 text-xs text-ink-soft">{note}</p> : null}
    </div>
  );
}

export { Check };
