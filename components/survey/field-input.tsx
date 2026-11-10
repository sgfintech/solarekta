"use client";

import { Check } from "@/components/icons";
import type { FieldDef } from "@/lib/survey/templates";

type Value = string | number | string[] | null | undefined;

/** Renders one "actual value" field. Values are kept separate from the checklist status. */
export function FieldInput({ field, id, value, disabled, onChange }: { field: FieldDef; id: string; value: Value; disabled?: boolean; onChange: (v: string | number | string[] | null) => void }) {
  const label = (
    <label htmlFor={id} className="label">
      {field.label}
      {field.unit ? <span className="font-normal text-muted"> ({field.unit})</span> : null}
    </label>
  );
  const help = field.help ? <p className="help">{field.help}</p> : null;

  if (field.type === "number") {
    return (
      <div>
        {label}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min}
          max={field.max}
          className="input"
          disabled={disabled}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(null);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }}
        />
        {help}
      </div>
    );
  }
  if (field.type === "select" || field.type === "yesno") {
    const options = field.type === "yesno" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Don't know" }] : field.options ?? [];
    return (
      <div>
        {label}
        <select id={id} className="select" disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Not recorded</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {help}
      </div>
    );
  }
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className="label">{field.label}</legend>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o.value);
            return (
              <label key={o.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${on ? "border-forest bg-mint text-forest-deep" : "border-line bg-white text-ink-soft"} ${disabled ? "opacity-60" : ""}`}>
                <input type="checkbox" className="sr-only" disabled={disabled} checked={on} onChange={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])} />
                {on ? <Check className="h-4 w-4" /> : null}
                {o.label}
              </label>
            );
          })}
        </div>
        {help}
      </fieldset>
    );
  }
  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea id={id} className="textarea" rows={3} maxLength={2000} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        {help}
      </div>
    );
  }
  return (
    <div>
      {label}
      <input id={id} className="input" maxLength={2000} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      {help}
    </div>
  );
}
