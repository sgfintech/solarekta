"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { finishVisitAction, startVisitAction, submitSurveyAction } from "@/app/actions/surveys";
import { Alert, ArrowRight, Check } from "@/components/icons";
import { EvidenceGallery, EvidenceUploader } from "@/components/survey/evidence-uploader";
import { FieldInput } from "@/components/survey/field-input";
import { SignaturePad } from "@/components/survey/signature-pad";
import { clearDraft, readDraft, requestPosition, writeDraft, type LocationOutcome } from "@/components/survey/client-utils";
import { EVIDENCE_CATEGORY_LABEL, SYSTEM_INTERESTS, VISIT_TYPES, type EvidenceCategory, type EvidenceRequirement } from "@/lib/survey/config";
import {
  answerFor,
  changedFields,
  contradictionChecks,
  LOCATION_LABEL,
  progress,
  submissionChecks,
  type CheckIssue,
  type ItemAnswer,
  type LocationStatus,
  type SurveyData,
} from "@/lib/survey/model";
import { ITEM_STATUS_LABEL, ORIENTATION_OPTIONS, type ChecklistItemDef, type ItemStatus, type SectionDef, type TemplateDef } from "@/lib/survey/templates";
import type { EvidenceView } from "@/lib/survey/view";

export interface EditorSurvey {
  id: string;
  reference: string;
  type: "residential" | "commercial";
  status: string;
  revision: number;
  version: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  locationStatus: LocationStatus;
  exceptionApproved: boolean;
  acknowledgments: { clientName: string; at: string }[];
}

type SaveState = "saved" | "saving" | "pending" | "offline" | "failed" | "conflict";
const SAVE_LABEL: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", pending: "Sync pending", offline: "Offline — saved on this device", failed: "Save failed — retrying", conflict: "Conflict — choose a version" };

const UTILITIES = ["Meralco", "VECO", "Davao Light", "CEPALCO", "AEC (Angeles)", "BENECO", "Iloilo Electric (MORE)", "Electric cooperative"];

export function SurveyEditor(props: {
  survey: EditorSurvey;
  template: TemplateDef;
  initialData: SurveyData;
  initialEvidence: EvidenceView[];
  requirements: EvidenceRequirement[];
  requireCheckIn: boolean;
  initialSection?: string;
}) {
  const { survey, template } = props;
  const router = useRouter();
  const steps = useMemo(() => [{ id: "visit", title: "Visit details" }, ...template.sections.map((s) => ({ id: s.id, title: s.title })), { id: "evidence", title: "Visit evidence" }, { id: "findings", title: "Findings & submit" }], [template]);
  const [step, setStep] = useState(() => Math.max(0, steps.findIndex((s) => s.id === props.initialSection)));
  const [data, setData] = useState<SurveyData>(props.initialData);
  const [evidence, setEvidence] = useState<EvidenceView[]>(props.initialEvidence);
  const [visit, setVisit] = useState({ checkedInAt: survey.checkedInAt, checkedOutAt: survey.checkedOutAt, locationStatus: survey.locationStatus });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ version: number; data: SurveyData; updatedAt: string; updatedByName: string | null; diff: number } | null>(null);
  const [recovery, setRecovery] = useState<{ baseVersion: number; data: SurveyData; savedAt: string } | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const versionRef = useRef(survey.version);
  const latest = useRef(data);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changes = useRef(0);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const conflictRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /* ---- autosave ---- */
  const save = useCallback(async () => {
    if (inFlight.current || !dirty.current) return;
    if (!navigator.onLine) {
      setSaveState("offline");
      return;
    }
    inFlight.current = true;
    dirty.current = false;
    setSaveState("saving");
    const body = JSON.stringify({ version: versionRef.current, data: latest.current });
    try {
      const res = await fetch(`/api/surveys/${survey.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        versionRef.current = json.version;
        setSavedAt(json.updatedAt);
        setSaveError(null);
        if (dirty.current) setSaveState("pending");
        else {
          clearDraft(survey.id);
          setSaveState("saved");
        }
      } else if (res.status === 409) {
        dirty.current = true;
        setConflict({ ...json.current, diff: changedFields(json.current.data, latest.current).length });
        setSaveState("conflict");
      } else if (res.status === 423) {
        setSaveState("failed");
        setSaveError(json.error ?? "This survey is locked.");
      } else {
        dirty.current = true;
        setSaveState("failed");
        setSaveError(json.error ?? "Couldn't save. Your changes are kept on this device and will retry.");
        timer.current = setTimeout(() => void saveRef.current(), 6000);
      }
    } catch {
      dirty.current = true;
      setSaveState(navigator.onLine ? "failed" : "offline");
      timer.current = setTimeout(() => void saveRef.current(), 6000);
    } finally {
      inFlight.current = false;
      if (dirty.current && saveStateAllowsRetry()) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void saveRef.current(), 1500);
      }
    }
    function saveStateAllowsRetry() {
      return navigator.onLine;
    }
  }, [survey.id]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    conflictRef.current = Boolean(conflict);
  }, [conflict]);

  /** Saves pending changes now (used before server actions that read the stored survey). */
  const flush = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) await saveRef.current();
    return !dirty.current;
  };

  /** Applies a change, keeps a local copy for recovery and schedules an autosave. */
  const update = (mutate: (d: SurveyData) => void) => {
    const next = structuredClone(latest.current);
    mutate(next);
    latest.current = next;
    dirty.current = true;
    changes.current += 1;
    setData(next);
    if (!writeDraft(survey.id, { baseVersion: versionRef.current, data: next, savedAt: new Date().toISOString() })) setStorageFull(true);
    if (conflictRef.current) return;
    setSaveState(navigator.onLine ? "pending" : "offline");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 1200);
  };

  // Local recovery, connectivity and leave warnings.
  useEffect(() => {
    const draft = readDraft<SurveyData>(survey.id);
    // Browser-only storage can only be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft && JSON.stringify(draft.data) !== JSON.stringify(props.initialData)) setRecovery(draft);
    const online = () => {
      if (dirty.current) void saveRef.current();
      else setSaveState((s) => (s === "offline" ? "saved" : s));
    };
    const offline = () => setSaveState((s) => (dirty.current || s === "pending" ? "offline" : s));
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (index: number) => {
    setStep(Math.min(Math.max(index, 0), steps.length - 1));
    if (dirty.current) void saveRef.current();
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    });
  };

  /* ---- derived ---- */
  const prog = progress(template, data);
  const evidenceSummaries = evidence.map((e) => ({ id: e.id, category: e.category, kind: e.kind, itemId: e.itemId, planeId: e.planeId, reviewStatus: e.reviewStatus }));
  const issues = submissionChecks({ template, data, evidence: evidenceSummaries, requirements: props.requirements, visit: { ...visit, exceptionApproved: survey.exceptionApproved, exceptionReason: null }, requireCheckIn: props.requireCheckIn });
  const contradictions = contradictionChecks(survey.type, data);
  const links = { items: template.sections.flatMap((s) => s.items.map((i) => ({ id: i.id, label: `${s.title}: ${i.label}` }))), planes: data.roofPlanes.map((p, i) => ({ id: p.id, label: p.label || `Plane ${i + 1}` })) };
  const current = steps[step];
  const section = template.sections.find((s) => s.id === current.id);
  const sectionIssues = (id: string) => issues.filter((i) => i.where === id && i.severity === "blocker").length;

  const addEvidence = (e: EvidenceView) => setEvidence((list) => (list.some((x) => x.id === e.id) ? list : [...list, e]));

  return (
    <div className="pb-40">
      {/* Header + progress */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{template.code} · {survey.reference} · Revision {survey.revision}</p>
          <h1 className="display-sm mt-1 text-forest-deep">{data.details.clientName || template.title}</h1>
          <p className="text-sm text-ink-soft">{[data.details.address, data.details.city].filter(Boolean).join(", ") || "Address not recorded yet"}</p>
        </div>
        <Link href={`/installer/surveys/${survey.id}/review`} className="btn btn-ghost btn-sm">Summary & report</Link>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{prog.answered} of {prog.total} checks answered</span>
          <span className="text-muted">{prog.percent}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
          <div className="h-full rounded-full bg-forest transition-[width] duration-300" style={{ width: `${prog.percent}%` }} />
        </div>
      </div>

      <nav aria-label="Survey sections" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex gap-2 pb-1">
          {steps.map((s, i) => {
            const sp = prog.sections.find((x) => x.sectionId === s.id);
            const blockers = sectionIssues(s.id);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined} className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${i === step ? "border-forest bg-forest text-white" : "border-line bg-white text-ink-soft hover:border-forest"}`}>
                  <span>{i + 1}. {s.title}</span>
                  {sp ? <span className={`text-xs ${i === step ? "text-[#d6ead0]" : "text-muted"}`}>{sp.answered}/{sp.total}</span> : null}
                  {blockers ? <span className={`h-2 w-2 rounded-full ${i === step ? "bg-sun" : "bg-clay"}`} aria-label={`${blockers} required`} /> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {recovery ? (
        <div className="alert-warn mt-4 flex flex-wrap items-center justify-between gap-2">
          <p>Unsaved changes from this device were found ({new Date(recovery.savedAt).toLocaleString("en-PH")}).</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { versionRef.current = recovery.baseVersion; setRecovery(null); update((d) => Object.assign(d, structuredClone(recovery.data))); }}>Restore them</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearDraft(survey.id); setRecovery(null); }}>Discard</button>
          </div>
        </div>
      ) : null}
      {storageFull ? <p className="alert-warn mt-4">This browser’s storage is full or blocked, so unsaved changes can’t be kept on the device. Stay online until “Saved” shows.</p> : null}
      {conflict ? (
        <div className="alert-error mt-4 space-y-2" role="alert">
          <p className="font-semibold">This survey was changed on another device{conflict.updatedByName ? ` by ${conflict.updatedByName}` : ""} at {new Date(conflict.updatedAt).toLocaleString("en-PH")}.</p>
          <p>{conflict.diff} fields differ from your copy. Choose which version to keep. Nothing has been overwritten yet.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { versionRef.current = conflict.version; setConflict(null); dirty.current = true; void save(); }}>Keep my version</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { versionRef.current = conflict.version; dirty.current = false; clearDraft(survey.id); latest.current = conflict.data; setData(conflict.data); setConflict(null); setSaveState("saved"); }}>Use the saved version</button>
          </div>
        </div>
      ) : null}

      <section className="mt-6" aria-labelledby="step-heading">
        <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-forest-deep outline-none">{current.title}</h2>
        {section ? <p className="mt-1 text-sm text-ink-soft">{section.description}</p> : null}
        {section?.engineerReview ? <p className="alert-warn mt-3 text-sm">Observations for a qualified engineer. Nothing recorded here — including loading figures, checkboxes or AI output — counts as structural verification.</p> : null}

        <div className="mt-5 space-y-4">
          {current.id === "visit" ? (
            <VisitStep survey={survey} data={data} update={update} visit={visit} setVisit={setVisit} onAck={() => router.refresh()} flush={flush} />
          ) : null}
          {section ? (
            <>
              {section.items.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  answer={answerFor(data, item.id)}
                  onChange={(a) => update((d) => { d.items[item.id] = a; })}
                  surveyId={survey.id}
                  evidence={evidence.filter((e) => e.itemId === item.id)}
                  onUploaded={addEvidence}
                  onEvidenceChange={(e) => setEvidence((l) => l.map((x) => (x.id === e.id ? e : x)))}
                  onEvidenceRemove={(id) => setEvidence((l) => l.filter((x) => x.id !== id))}
                  links={links}
                />
              ))}
              {section.roofPlanes ? <RoofPlanes section={section} data={data} update={update} surveyId={survey.id} evidence={evidence} onUploaded={addEvidence} /> : null}
              {section.planeShading ? <PlaneShading data={data} update={update} /> : null}
            </>
          ) : null}
          {current.id === "evidence" ? (
            <EvidenceStep surveyId={survey.id} evidence={evidence} requirements={props.requirements} onUploaded={addEvidence} setEvidence={setEvidence} links={links} />
          ) : null}
          {current.id === "findings" ? (
            <FindingsStep survey={survey} data={data} update={update} issues={issues} contradictions={contradictions} goTo={(where) => go(Math.max(0, steps.findIndex((s) => s.id === where)))} saveNow={flush} onSubmitted={() => { clearDraft(survey.id); router.push(`/installer/surveys/${survey.id}/review?submitted=1`); }} />
          ) : null}
        </div>
      </section>

      {/* Sticky save / continue bar */}
      <div className="fixed inset-x-0 bottom-[calc(4.4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-[17rem]">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <p className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${saveState === "failed" || saveState === "conflict" ? "text-clay" : saveState === "offline" ? "text-[#7a5200]" : "text-muted"}`} role="status" aria-live="polite">
            {saveState === "saved" ? <Check className="h-4 w-4 shrink-0 text-leaf" /> : saveState === "saving" ? <span className="spinner" aria-hidden="true" /> : <Alert className="h-4 w-4 shrink-0" />}
            <span className="truncate">{SAVE_LABEL[saveState]}{saveState === "saved" && savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}{saveError && saveState === "failed" ? ` — ${saveError}` : ""}</span>
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => go(step + 1)}>Save & continue <ArrowRight /></button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>Save now</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Checklist item
 * ------------------------------------------------------------------------- */

const STATUS_STYLE: Record<ItemStatus, string> = {
  not_assessed: "peer-checked:border-ink-soft peer-checked:bg-paper-deep peer-checked:text-ink",
  completed: "peer-checked:border-forest peer-checked:bg-mint peer-checked:text-forest-deep",
  issue: "peer-checked:border-clay peer-checked:bg-[#f9e0d8] peer-checked:text-[#7d2a14]",
  na: "peer-checked:border-ink-soft peer-checked:bg-[#eef1ea] peer-checked:text-ink",
};

function ChecklistItem({ item, answer, onChange, surveyId, evidence, onUploaded, onEvidenceChange, onEvidenceRemove, links }: {
  item: ChecklistItemDef;
  answer: ItemAnswer;
  onChange: (a: ItemAnswer) => void;
  surveyId: string;
  evidence: EvidenceView[];
  onUploaded: (e: EvidenceView) => void;
  onEvidenceChange: (e: EvidenceView) => void;
  onEvidenceRemove: (id: string) => void;
  links: { items: { id: string; label: string }[]; planes: { id: string; label: string }[] };
}) {
  const [showNote, setShowNote] = useState(Boolean(answer.note));
  const [showUpload, setShowUpload] = useState(false);
  const needsNote = answer.status === "issue" || (answer.status === "na" && item.naNeedsReason !== false);
  const noteMissing = needsNote && !answer.note.trim();
  const groupId = `st-${item.id}`;
  return (
    <article id={`item-${item.id}`} className="card card-pad scroll-mt-24">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink" id={`${groupId}-label`}>
            {item.label}
            {item.required ? <span className="ml-1.5 text-xs font-medium text-clay">Required</span> : null}
          </h3>
          {item.help ? <p className="mt-0.5 text-sm text-ink-soft">{item.help}</p> : null}
        </div>
        {item.photo ? <span className="badge badge-info shrink-0">Photo</span> : null}
      </div>

      <fieldset className="mt-3" aria-labelledby={`${groupId}-label`}>
        <legend className="sr-only">Status for {item.label}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["not_assessed", "completed", "issue", "na"] as ItemStatus[]).map((s) => (
            <label key={s} className="relative">
              <input type="radio" name={groupId} value={s} checked={answer.status === s} onChange={() => { onChange({ ...answer, status: s }); if (s === "issue" || s === "na") setShowNote(true); }} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <span className={`flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-2 text-center text-sm font-medium text-ink-soft transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest ${STATUS_STYLE[s]}`}>
                {ITEM_STATUS_LABEL[s]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {item.fields?.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {item.fields.map((f) => (
            <div key={f.key} className={f.type === "textarea" || f.type === "multiselect" ? "sm:col-span-2" : ""}>
              <FieldInput field={f} id={`${item.id}-${f.key}`} value={answer.values[f.key]} onChange={(v) => onChange({ ...answer, values: { ...answer.values, [f.key]: v } })} />
            </div>
          ))}
        </div>
      ) : null}

      {showNote || needsNote ? (
        <div className="mt-3">
          <label htmlFor={`note-${item.id}`} className="label">{answer.status === "issue" ? "Describe the issue" : answer.status === "na" ? "Why is this not applicable?" : "Note"}{needsNote ? <span className="text-clay"> *</span> : null}</label>
          <textarea id={`note-${item.id}`} className="textarea" rows={2} maxLength={4000} value={answer.note} aria-invalid={noteMissing || undefined} aria-describedby={noteMissing ? `note-err-${item.id}` : undefined} onChange={(e) => onChange({ ...answer, note: e.target.value })} />
          {noteMissing ? <p id={`note-err-${item.id}`} className="field-error">{answer.status === "issue" ? "Explain the issue so the reviewer can follow up." : "Add a short reason."}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-4">
        {!showNote && !needsNote ? <button type="button" className="link-action text-sm" onClick={() => setShowNote(true)}>Add note</button> : null}
        <button type="button" className="link-action text-sm" onClick={() => setShowUpload((v) => !v)} aria-expanded={showUpload}>
          {showUpload ? "Hide upload" : item.photo ? "Add photo" : "Add evidence"}{evidence.length ? ` (${evidence.length})` : ""}
        </button>
      </div>
      {showUpload ? (
        <div className="mt-2">
          <EvidenceUploader surveyId={surveyId} editable compact defaultCategory={(item.evidence ?? "other") as EvidenceCategory} itemId={item.id} onUploaded={onUploaded} />
        </div>
      ) : null}
      {evidence.length ? <div className="mt-3"><EvidenceGallery evidence={evidence} editable links={links} onChange={onEvidenceChange} onRemove={onEvidenceRemove} /></div> : null}
    </article>
  );
}

/* ----------------------------------------------------------------------------
 * Roof planes
 * ------------------------------------------------------------------------- */

function RoofPlanes({ section, data, update, surveyId, evidence, onUploaded }: { section: SectionDef; data: SurveyData; update: (m: (d: SurveyData) => void) => void; surveyId: string; evidence: EvidenceView[]; onUploaded: (e: EvidenceView) => void }) {
  void section;
  const planes = data.roofPlanes;
  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">Roof planes</h3>
          <p className="text-sm text-ink-soft">Each usable plane with its own area, pitch and orientation.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => update((d) => { d.roofPlanes.push({ id: `p${Date.now().toString(36)}`, label: `Plane ${d.roofPlanes.length + 1}`, usableAreaM2: null, pitchDeg: null, orientation: "", notes: "", shadeMorning: "", shadeNoon: "", shadeAfternoon: "" }); })}>Add roof plane</button>
      </div>
      {planes.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No roof planes yet. Add one for each usable section of roof.</p> : null}
      <div className="mt-4 space-y-4">
        {planes.map((p, i) => {
          const set = (patch: Partial<typeof p>) => update((d) => { d.roofPlanes[i] = { ...d.roofPlanes[i], ...patch }; });
          const planeEvidence = evidence.filter((e) => e.planeId === p.id);
          return (
            <fieldset key={p.id} className="rounded-xl border border-line bg-paper p-4">
              <legend className="px-1 text-sm font-semibold text-forest-deep">{p.label || `Plane ${i + 1}`}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor={`pl-${p.id}`}>Name</label><input id={`pl-${p.id}`} className="input" maxLength={80} value={p.label} onChange={(e) => set({ label: e.target.value })} /></div>
                <div><label className="label" htmlFor={`pa-${p.id}`}>Usable area <span className="font-normal text-muted">(m²)</span></label><input id={`pa-${p.id}`} type="number" inputMode="decimal" min={0} step="any" className="input" value={p.usableAreaM2 ?? ""} onChange={(e) => set({ usableAreaM2: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div><label className="label" htmlFor={`pp-${p.id}`}>Pitch <span className="font-normal text-muted">(degrees)</span></label><input id={`pp-${p.id}`} type="number" inputMode="decimal" min={0} max={90} step="any" className="input" value={p.pitchDeg ?? ""} onChange={(e) => set({ pitchDeg: e.target.value === "" ? null : Math.min(90, Number(e.target.value)) })} /></div>
                <div>
                  <label className="label" htmlFor={`po-${p.id}`}>Orientation (faces)</label>
                  <select id={`po-${p.id}`} className="select" value={p.orientation} onChange={(e) => set({ orientation: e.target.value })}>
                    <option value="">Not recorded</option>
                    {ORIENTATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2"><label className="label" htmlFor={`pn-${p.id}`}>Notes</label><textarea id={`pn-${p.id}`} className="textarea" rows={2} maxLength={4000} value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
              </div>
              <div className="mt-3 space-y-2">
                <EvidenceUploader surveyId={surveyId} editable compact defaultCategory="roof_overview" planeId={p.id} onUploaded={onUploaded} />
                {planeEvidence.length ? <EvidenceGallery evidence={planeEvidence} editable={false} /> : null}
              </div>
              <button type="button" className="link-action link-danger mt-2 text-sm" onClick={() => update((d) => { d.roofPlanes.splice(i, 1); })}>Remove plane</button>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

function PlaneShading({ data, update }: { data: SurveyData; update: (m: (d: SurveyData) => void) => void }) {
  if (!data.roofPlanes.length) return <p className="alert-warn text-sm">Add roof planes in the Roof section to record shading per plane.</p>;
  return (
    <div className="card card-pad space-y-4">
      <h3 className="font-semibold text-ink">Shading per roof plane</h3>
      {data.roofPlanes.map((p, i) => (
        <fieldset key={p.id} className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold text-forest-deep">{p.label || `Plane ${i + 1}`}</legend>
          {(["shadeMorning", "shadeNoon", "shadeAfternoon"] as const).map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`${k}-${p.id}`}>{k === "shadeMorning" ? "Morning" : k === "shadeNoon" ? "Noon" : "Afternoon"}</label>
              <input id={`${k}-${p.id}`} className="input" maxLength={300} value={p[k]} onChange={(e) => update((d) => { d.roofPlanes[i] = { ...d.roofPlanes[i], [k]: e.target.value }; })} />
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Visit details, check-in / check-out, acknowledgment
 * ------------------------------------------------------------------------- */

function VisitStep({ survey, data, update, visit, setVisit, onAck, flush }: {
  survey: EditorSurvey;
  data: SurveyData;
  update: (m: (d: SurveyData) => void) => void;
  visit: { checkedInAt: string | null; checkedOutAt: string | null; locationStatus: LocationStatus };
  setVisit: (v: { checkedInAt: string | null; checkedOutAt: string | null; locationStatus: LocationStatus }) => void;
  onAck: () => void;
  flush: () => Promise<boolean>;
}) {
  const d = data.details;
  const set = (patch: Partial<SurveyData["details"]>) => update((x) => { x.details = { ...x.details, ...patch }; });
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [visitMsg, setVisitMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAck, setShowAck] = useState(false);

  const visitAction = async (kind: "start" | "finish", withLocation: boolean) => {
    setBusy(true);
    if (!(await flush())) {
      setBusy(false);
      return setVisitMsg("Your latest changes haven't saved yet. Check your connection and try again.");
    }
    setVisitMsg(withLocation ? "Asking your browser for location…" : null);
    const loc: LocationOutcome | null = withLocation ? await requestPosition() : null;
    const input = loc?.outcome === "ok" ? { surveyId: survey.id, outcome: "ok" as const, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, deviceTime: new Date().toISOString() } : { surveyId: survey.id, outcome: (loc ? loc.outcome : "skipped") as "denied" | "unavailable" | "skipped", deviceTime: new Date().toISOString() };
    const res = kind === "start" ? await startVisitAction(input) : await finishVisitAction(input);
    setBusy(false);
    if (!res.ok) return setVisitMsg(res.error);
    if (kind === "start") {
      setVisit({ ...visit, checkedInAt: res.at, locationStatus: res.locationStatus });
      if (!d.actualVisitAt) set({ actualVisitAt: res.at.slice(0, 16) });
      setVisitMsg(loc && loc.outcome !== "ok" ? loc.message : `Visit started. ${LOCATION_LABEL[res.locationStatus]}${res.distance != null ? ` (${res.distance} m from the pin${loc?.outcome === "ok" && loc.accuracy ? `, ±${loc.accuracy} m` : ""})` : ""}.`);
    } else {
      setVisit({ ...visit, checkedOutAt: res.at });
      setVisitMsg("Visit finished.");
    }
  };

  return (
    <>
      <div className="card card-pad">
        <h3 className="font-semibold text-ink">Site visit</h3>
        <p className="mt-1 text-sm text-ink-soft">The server records the time when you start and finish. Sharing your location is optional: it’s compared with the site pin and shown to reviewers. If you decline, you can still continue — the survey is flagged for review instead.</p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Started:</span> <strong>{visit.checkedInAt ? new Date(visit.checkedInAt).toLocaleString("en-PH") : "Not yet"}</strong></p>
          <p><span className="text-muted">Finished:</span> <strong>{visit.checkedOutAt ? new Date(visit.checkedOutAt).toLocaleString("en-PH") : "Not yet"}</strong></p>
          {visit.checkedInAt ? <p className="sm:col-span-2"><span className="text-muted">Location check:</span> {LOCATION_LABEL[visit.locationStatus]}</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!visit.checkedInAt ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => visitAction("start", true)}>Start site visit</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => visitAction("start", false)}>Start without location</button>
            </>
          ) : !visit.checkedOutAt ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => visitAction("finish", true)}>Finish site visit</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => visitAction("finish", false)}>Finish without location</button>
            </>
          ) : null}
        </div>
        {visitMsg ? <p role="status" className="mt-2 text-sm text-ink-soft">{visitMsg}</p> : null}
      </div>

      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <h3 className="font-semibold text-ink sm:col-span-2">Client and site</h3>
        <div><label className="label" htmlFor="d-client">Client name <span className="text-clay">*</span></label><input id="d-client" className="input" autoComplete="off" maxLength={300} value={d.clientName} onChange={(e) => set({ clientName: e.target.value })} /></div>
        <div><label className="label" htmlFor="d-phone">Contact number</label><input id="d-phone" className="input" inputMode="tel" autoComplete="off" maxLength={40} value={d.clientPhone} onChange={(e) => set({ clientPhone: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="d-address">Complete site address <span className="text-clay">*</span></label><input id="d-address" className="input" maxLength={400} value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="House/building no., street, barangay" /></div>
        <div><label className="label" htmlFor="d-city">City / municipality</label><input id="d-city" className="input" maxLength={300} value={d.city} onChange={(e) => set({ city: e.target.value })} /></div>
        <div><label className="label" htmlFor="d-province">Province</label><input id="d-province" className="input" maxLength={300} value={d.province} onChange={(e) => set({ province: e.target.value })} /></div>
        <div>
          <label className="label" htmlFor="d-utility">Distribution utility <span className="text-clay">*</span></label>
          <input id="d-utility" className="input" list="utilities" maxLength={300} value={d.utility} onChange={(e) => set({ utility: e.target.value })} placeholder="e.g. Meralco" />
          <datalist id="utilities">{UTILITIES.map((u) => <option key={u} value={u} />)}</datalist>
        </div>
        <div><label className="label" htmlFor="d-surveyor">Surveyor <span className="text-clay">*</span></label><input id="d-surveyor" className="input" maxLength={300} value={d.surveyorName} onChange={(e) => set({ surveyorName: e.target.value })} /></div>

        <fieldset className="sm:col-span-2">
          <legend className="label">Site GPS pin <span className="text-clay">*</span></legend>
          <p className="help mb-2">Stand at the building and use your location, or type coordinates from a map. This is the reference point for the visit location check.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div><label className="label" htmlFor="d-lat">Latitude</label><input id="d-lat" type="number" inputMode="decimal" step="any" min={-90} max={90} className="input" value={d.siteLat ?? ""} onChange={(e) => set({ siteLat: e.target.value === "" ? null : Number(e.target.value), siteLocationSource: "manual" })} /></div>
            <div><label className="label" htmlFor="d-lng">Longitude</label><input id="d-lng" type="number" inputMode="decimal" step="any" min={-180} max={180} className="input" value={d.siteLng ?? ""} onChange={(e) => set({ siteLng: e.target.value === "" ? null : Number(e.target.value), siteLocationSource: "manual" })} /></div>
            <button type="button" className="btn btn-secondary" onClick={async () => {
              setPinMsg("Asking your browser for location…");
              const r = await requestPosition();
              if (r.outcome === "ok") {
                set({ siteLat: r.lat, siteLng: r.lng, siteLocationSource: "device" });
                setPinMsg(`Pin saved from this device (±${r.accuracy ?? "?"} m).${r.accuracy && r.accuracy > 50 ? " Accuracy is low — move outdoors and try again, or enter coordinates manually." : ""}`);
              } else setPinMsg(`${r.message} Enter the coordinates manually instead.`);
            }}>Use my location</button>
          </div>
          <p className="mt-1 text-xs text-muted">{d.siteLocationSource === "device" ? "Source: device location" : d.siteLocationSource === "manual" ? "Source: entered manually" : ""}</p>
          {pinMsg ? <p role="status" className="text-sm text-ink-soft">{pinMsg}</p> : null}
        </fieldset>
      </div>

      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <h3 className="font-semibold text-ink sm:col-span-2">Visit</h3>
        <div><label className="label" htmlFor="d-sched">Scheduled date</label><input id="d-sched" type="date" className="input" value={d.scheduledDate} onChange={(e) => set({ scheduledDate: e.target.value })} /></div>
        <div><label className="label" htmlFor="d-actual">Actual visit date and time</label><input id="d-actual" type="datetime-local" className="input" value={d.actualVisitAt} onChange={(e) => set({ actualVisitAt: e.target.value })} /><p className="help">Filled from “Start site visit”. Edit only if you visited without starting it here.</p></div>
        <div>
          <label className="label" htmlFor="d-vtype">Visit type</label>
          <select id="d-vtype" className="select" value={d.visitType} onChange={(e) => set({ visitType: e.target.value })}>
            {VISIT_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="d-purpose">Purpose</label><input id="d-purpose" className="input" maxLength={600} value={d.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="e.g. Assess roof and electrical for a hybrid system" /></div>
        <fieldset className="sm:col-span-2">
          <legend className="label">System interests</legend>
          <div className="flex flex-wrap gap-2">
            {SYSTEM_INTERESTS.map((o) => {
              const on = d.interests.includes(o.value);
              return (
                <label key={o.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm ${on ? "border-forest bg-mint text-forest-deep" : "border-line bg-white text-ink-soft"}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => set({ interests: on ? d.interests.filter((v) => v !== o.value) : [...d.interests, o.value] })} />
                  {on ? <Check className="h-4 w-4" /> : null}
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="card card-pad">
        <h3 className="font-semibold text-ink">Client acknowledgment <span className="font-normal text-muted">(optional)</span></h3>
        {survey.acknowledgments.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {survey.acknowledgments.map((a, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-leaf" /> Acknowledged by {a.clientName} · {new Date(a.at).toLocaleString("en-PH")} (server time)</li>)}
          </ul>
        ) : <p className="mt-1 text-sm text-ink-soft">Ask the client to confirm the visit with a drawn signature at the end.</p>}
        {showAck ? (
          <div className="mt-3"><SignaturePad surveyId={survey.id} defaultName={d.clientName} onDone={() => { setShowAck(false); onAck(); }} /></div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setShowAck(true)}>Record client acknowledgment</button>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Evidence step
 * ------------------------------------------------------------------------- */

function EvidenceStep({ surveyId, evidence, requirements, onUploaded, setEvidence, links }: { surveyId: string; evidence: EvidenceView[]; requirements: EvidenceRequirement[]; onUploaded: (e: EvidenceView) => void; setEvidence: React.Dispatch<React.SetStateAction<EvidenceView[]>>; links: { items: { id: string; label: string }[]; planes: { id: string; label: string }[] } }) {
  const groups = Object.entries(evidence.reduce<Record<string, EvidenceView[]>>((acc, e) => ((acc[e.category] ??= []).push(e), acc), {}));
  return (
    <>
      {requirements.length ? (
        <div className="card card-pad">
          <h3 className="font-semibold text-ink">Required before submitting</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {requirements.map((r) => {
              const have = evidence.filter((e) => e.category === r.category && e.reviewStatus !== "rejected" && (r.kind === undefined || r.kind === "any" || e.kind === r.kind)).length;
              return (
                <li key={r.category} className="flex items-center gap-2">
                  {have >= r.min ? <Check className="h-4 w-4 text-leaf" /> : <Alert className="h-4 w-4 text-clay" />}
                  {EVIDENCE_CATEGORY_LABEL[r.category]}: {have} of {r.min} {r.kind === "photo" ? "photo" : "item"}{r.min > 1 ? "s" : ""}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <EvidenceUploader surveyId={surveyId} editable defaultCategory="site_frontage" onUploaded={onUploaded} />
      <p className="text-xs text-muted">Photos up to 25 MB, PDF documents up to 25 MB, videos up to 500 MB and 10 minutes by default. Media is private to your company and SOLARekta reviewers.</p>
      {groups.length === 0 ? <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No evidence yet. Start with a frontage photo on arrival.</p> : null}
      {groups.map(([cat, list]) => (
        <section key={cat} aria-label={EVIDENCE_CATEGORY_LABEL[cat as EvidenceCategory] ?? cat}>
          <h3 className="mb-2 text-sm font-semibold text-forest-deep">{EVIDENCE_CATEGORY_LABEL[cat as EvidenceCategory] ?? cat} ({list.length})</h3>
          <EvidenceGallery evidence={list} editable links={links} onChange={(e) => setEvidence((l) => l.map((x) => (x.id === e.id ? e : x)))} onRemove={(id) => setEvidence((l) => l.filter((x) => x.id !== id))} />
        </section>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Findings and submission
 * ------------------------------------------------------------------------- */

function FindingsStep({ survey, data, update, issues, contradictions, goTo, saveNow, onSubmitted }: {
  survey: EditorSurvey;
  data: SurveyData;
  update: (m: (d: SurveyData) => void) => void;
  issues: CheckIssue[];
  contradictions: string[];
  goTo: (where: string) => void;
  saveNow: () => Promise<boolean>;
  onSubmitted: () => void;
}) {
  const f = data.findings;
  const set = (patch: Partial<SurveyData["findings"]>) => update((d) => { d.findings = { ...d.findings, ...patch }; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<CheckIssue[] | null>(null);
  const blockers = (serverIssues ?? issues).filter((i) => i.severity === "blocker");
  const warnings = (serverIssues ?? issues).filter((i) => i.severity === "warning");
  const whereLabel = (w: string) => (w === "details" || w === "visit" ? "visit" : w);

  return (
    <>
      <div className="card card-pad grid gap-4">
        <div><label className="label" htmlFor="f-notes">Notes and findings</label><textarea id="f-notes" className="textarea" rows={6} maxLength={8000} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What you observed, constraints, sketches described, measurements to confirm" /></div>
        <div>
          <label className="label" htmlFor="f-kwp">Preliminary recommended capacity <span className="font-normal text-muted">(kWp, optional)</span></label>
          <input id="f-kwp" type="number" inputMode="decimal" min={0} step="any" className="input max-w-xs" value={f.recommendedKwp ?? ""} onChange={(e) => set({ recommendedKwp: e.target.value === "" ? null : Number(e.target.value) })} />
          <p className="help">Preliminary and subject to technical review and final design.</p>
        </div>
        <div><label className="label" htmlFor="f-next">Next steps</label><textarea id="f-next" className="textarea" rows={3} maxLength={2000} value={f.nextSteps} onChange={(e) => set({ nextSteps: e.target.value })} /></div>
      </div>

      {contradictions.length ? (
        <div className="alert-warn">
          <p className="font-semibold">Answers to double-check</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{contradictions.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : null}

      <div className="card card-pad">
        <h3 className="font-semibold text-ink">Before you submit</h3>
        {blockers.length === 0 ? <p className="alert-success mt-2">Everything required is in place.</p> : (
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex gap-2"><Alert className="mt-0.5 h-4 w-4 shrink-0 text-clay" /> {b.message}</span>
                <button type="button" className="link-action shrink-0 text-sm" onClick={() => { goTo(whereLabel(b.where)); if (b.itemId) setTimeout(() => document.getElementById(`item-${b.itemId}`)?.scrollIntoView({ block: "center" }), 120); }}>Fix</button>
              </li>
            ))}
          </ul>
        )}
        {warnings.length ? (
          <details className="mt-3">
            <summary className="link-action text-sm">{warnings.length} warning{warnings.length === 1 ? "" : "s"} (won’t block submission; reviewers see them)</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
          </details>
        ) : null}
        {error ? <p role="alert" className="alert-error mt-3">{error}</p> : null}
        <button
          type="button"
          className="btn btn-primary mt-4"
          disabled={busy || blockers.length > 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const saved = await saveNow();
            if (!saved) {
              setBusy(false);
              return setError("Save your latest changes first (check your connection), then submit.");
            }
            const res = await submitSurveyAction(survey.id);
            setBusy(false);
            if (res.ok) onSubmitted();
            else {
              setError(res.error);
              if (res.issues) setServerIssues(res.issues);
            }
          }}
        >
          {busy ? "Submitting…" : `Submit revision ${survey.revision} for review`}
        </button>
        <p className="help mt-2">After submitting, the survey is read-only. Changes then create a new revision and need resubmission.</p>
      </div>
    </>
  );
}
