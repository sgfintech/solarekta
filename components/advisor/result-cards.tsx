"use client";

import Link from "next/link";
import { Alert, Check, Shield } from "@/components/icons";
import { PRICE_BASIS_LABEL } from "@/lib/advisor/match";
import { describeSummary, type AdvisorBlock, type MatchView, type RecordView } from "@/lib/advisor/view";

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const checkedLabel = (r: RecordView) =>
  `${new Date(r.checkedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}${r.ageDays === 0 ? " (today)" : r.ageDays === 1 ? " (1 day ago)" : ` (${r.ageDays} days ago)`}`;

export function SampleBadge() {
  return <span className="badge badge-warn" title="Clearly labelled sample data for development and demos">Sample data</span>;
}

export interface CompareControls {
  selected: string[];
  toggle: (productId: string) => void;
}

/** One price record: equipment, specs, capacity, price, inclusions, supplier, source and date checked. */
export function RecordCard({ record, match, compare }: { record: RecordView; match?: MatchView; compare?: CompareControls }) {
  const r = record;
  const selected = r.productId ? compare?.selected.includes(r.productId) : false;
  return (
    <article className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {r.categoryLabel} · {r.brand}
          </p>
          <h4 className="font-semibold text-forest-deep">{r.title}</h4>
          <p className="text-xs text-muted">Model {r.model}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {match ? <span className={`badge ${match.kind === "exact" ? "badge-good" : "badge-neutral"}`}>{match.kind === "exact" ? "Exact match" : "Alternative"}</span> : null}
          {r.sample ? <SampleBadge /> : null}
        </div>
      </div>

      {r.specChips.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.specChips.map((chip) => (
            <span key={chip} className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {r.nominalKwh ? (
        <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">
          <p>
            <span className="font-semibold text-ink">{r.nominalKwh} kWh nominal</span>
            {r.nominalCalc ? <span className="text-ink-soft"> · {r.nominalCalc}</span> : <span className="text-ink-soft"> · as listed</span>}
          </p>
          {r.usable ? (
            <p className="mt-0.5 text-ink-soft">
              {r.usable.usableKwh} kWh usable — {r.usable.assumptions.join(" ")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">Usable capacity not stated, so it is not estimated.</p>
          )}
        </div>
      ) : null}

      {match && (match.differences.length || match.missing.length) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[#7a5200]">
          {match.differences.length ? <li>Differs: {match.differences.join("; ")}</li> : null}
          {match.missing.length ? <li>Not stated on the listing: {match.missing.join(", ")}</li> : null}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-line pt-3">
        <div>
          <p className="font-display text-xl font-bold text-ink">{r.pricePhp != null ? peso(r.pricePhp) : "Price on request"}</p>
          <p className="text-xs text-muted">
            {r.pricePhp != null ? `per ${r.unit} · ` : ""}
            {r.priceBasisLabel}
            {r.pricePerKwh != null ? ` · ${peso(r.pricePerKwh)} per nominal kWh` : ""}
          </p>
        </div>
        <div className="text-right text-xs text-ink-soft">
          <p>
            {r.supplierName}
            {r.external ? " (external source)" : " · verified supplier"}
          </p>
          <p>
            Price checked {checkedLabel(r)}
            {r.stale ? <span className="font-semibold text-[#7a5200]"> · may be outdated</span> : null}
          </p>
        </div>
      </div>

      {r.inclusions.length || r.exclusions.length ? (
        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {r.inclusions.length ? <p><span className="font-semibold text-ink">Includes:</span> {r.inclusions.join(", ")}</p> : null}
          {r.exclusions.length ? <p><span className="font-semibold text-ink">Excludes:</span> {r.exclusions.join(", ")}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Inclusions not stated by the supplier.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.external ? (
          <a href={r.sourceUrl} target="_blank" rel="noreferrer nofollow" className="btn btn-secondary btn-sm">Source</a>
        ) : (
          <Link href={r.sourceUrl} className="btn btn-secondary btn-sm">Listing</Link>
        )}
        {r.supplierSlug ? <Link href={`/suppliers/${r.supplierSlug}`} className="btn btn-ghost btn-sm">View supplier</Link> : null}
        {r.productId ? <Link href={`/advisor/request?product=${r.productId}`} className="btn btn-ghost btn-sm">Request supplier quotation</Link> : null}
        {r.productId && compare ? (
          <button type="button" className={`btn btn-sm ${selected ? "btn-primary" : "btn-ghost"}`} aria-pressed={selected} onClick={() => compare.toggle(r.productId!)}>
            {selected ? "Added to compare" : "Compare"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function PriceBlockView({ block, compare }: { block: Extract<AdvisorBlock, { type: "price" }>; compare?: CompareControls }) {
  return (
    <div className="space-y-4">
      {block.requested ? (
        <p className="rounded-xl bg-mint px-3 py-2 text-sm text-forest-deep">
          <span className="font-semibold">Requested capacity:</span> {block.requested.calc}. Usable capacity depends on the battery’s stated depth of discharge.
        </p>
      ) : null}

      {block.summaries.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.summaries.map((s) => (
            <div key={`${s.basis}-${s.unit}`} className="rounded-xl border border-line bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Observed price · {PRICE_BASIS_LABEL[s.basis]}</p>
              <p className="mt-1 font-display text-lg font-bold text-ink">
                {s.kind === "range" ? `${peso(s.minPhp)} – ${peso(s.maxPhp)}` : s.kind === "single" ? peso(s.pricePhp) : "Price on request"}
              </p>
              <p className="text-xs text-ink-soft">{describeSummary(s)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {block.exact.length ? (
        <section>
          <h4 className="text-sm font-semibold text-forest-deep">Exact specification matches ({block.exact.length})</h4>
          <div className="mt-2 space-y-3">
            {block.exact.map((m) => <RecordCard key={m.record.ref} record={m.record} match={m} compare={compare} />)}
          </div>
        </section>
      ) : null}

      {block.alternatives.length ? (
        <section>
          <h4 className="text-sm font-semibold text-forest-deep">Nearby alternatives — not exact matches ({block.alternatives.length})</h4>
          <p className="text-xs text-muted">Not included in the price range above.</p>
          <div className="mt-2 space-y-3">
            {block.alternatives.map((m) => <RecordCard key={m.record.ref} record={m.record} match={m} compare={compare} />)}
          </div>
        </section>
      ) : null}

      {block.missingInfo.length ? (
        <p className="flex gap-2 rounded-xl border border-[#f1d28a] bg-[#fdf3d7] px-3 py-2 text-sm text-[#5f4300]">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> To narrow this down, add {block.missingInfo.join(" and ")}.
        </p>
      ) : null}

      {block.quoteSuppliers.length ? (
        <div className="rounded-xl border border-line bg-paper p-3 text-sm">
          <p className="font-semibold text-ink">No reliable listed price. Ask a verified supplier:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {block.quoteSuppliers.map((s) =>
              s.productId ? (
                <Link key={s.supplierId} href={`/advisor/request?product=${s.productId}`} className="btn btn-secondary btn-sm">Request quotation · {s.supplierName}</Link>
              ) : (
                <Link key={s.supplierId} href={`/suppliers`} className="btn btn-secondary btn-sm">Browse suppliers</Link>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompareBlockView({ block }: { block: Extract<AdvisorBlock, { type: "compare" }> }) {
  return (
    <div className="space-y-3">
      <div className="table-scroll rounded-xl border border-line bg-white" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
        <table className="table min-w-[520px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-36"><span className="sr-only">Attribute</span></th>
              {block.items.map((i) => (
                <th key={i.ref} scope="col">
                  <span className="block text-forest-deep">{i.brand} {i.model}</span>
                  {i.sample ? <SampleBadge /> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="text-xs font-semibold text-muted">{row.label}</th>
                {row.values.map((v, idx) => <td key={idx}>{v}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="text-xs font-semibold text-muted">Source</th>
              {block.items.map((i) => (
                <td key={i.ref}>
                  {i.external ? <a href={i.sourceUrl} target="_blank" rel="noreferrer nofollow" className="text-forest underline">External source</a> : <Link href={i.sourceUrl} className="text-forest underline">Catalogue listing</Link>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {block.notes.length ? (
        <ul className="space-y-1 text-sm text-[#5f4300]">
          {block.notes.map((n) => <li key={n} className="flex gap-2"><Alert className="mt-0.5 h-4 w-4 shrink-0" /> {n}</li>)}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {block.items.filter((i) => i.productId).map((i) => (
          <Link key={i.ref} href={`/advisor/request?product=${i.productId}`} className="btn btn-ghost btn-sm">Request quotation · {i.model}</Link>
        ))}
      </div>
    </div>
  );
}

const RESULT_STYLE = {
  ok: { label: "Matches", cls: "text-leaf" },
  conflict: { label: "Conflict", cls: "text-[#9c2f12]" },
  unknown: { label: "Not stated", cls: "text-muted" },
} as const;

function CompatibilityView({ block }: { block: Extract<AdvisorBlock, { type: "compatibility" }> }) {
  const tone = block.status === "verified" ? "badge-good" : block.status === "conflict" ? "badge-bad" : "badge-warn";
  const label = { verified: "Manufacturer-listed compatibility", unverified: "Unverified assessment", conflict: "Conflict in listed specs", need_models: "Exact models needed" }[block.status];
  return (
    <div className="space-y-3">
      <span className={`badge ${tone}`}>{label}</span>
      <p className="text-sm text-ink">{block.message}</p>
      {block.checks.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {block.checks.map((c) => (
            <li key={c.label} className="flex gap-3 px-3 py-2 text-sm">
              <span className={`w-20 shrink-0 text-xs font-semibold ${RESULT_STYLE[c.result].cls}`}>{RESULT_STYLE[c.result].label}</span>
              <span><span className="font-medium text-ink">{c.label}:</span> <span className="text-ink-soft">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      ) : null}
      {block.status === "need_models" ? (
        <p className="text-sm text-ink-soft">Example: “Will the Imbak IB-5.1 work with the Kidlat KH-6K?”</p>
      ) : (
        <p className="flex gap-2 text-xs text-muted"><Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Voltage alone never confirms compatibility. A licensed installer must check the BMS settings, firmware and wiring.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {block.battery ? <RecordCard record={block.battery} /> : null}
        {block.inverter ? <RecordCard record={block.inverter} /> : null}
      </div>
    </div>
  );
}

function QuoteContentsView({ block }: { block: Extract<AdvisorBlock, { type: "quote_contents" }> }) {
  if (block.needsUpload) {
    return (
      <div className="rounded-xl border border-line bg-paper p-3 text-sm">
        <p>Quotations stay private to your account and are never shared with suppliers or added to the catalogue.</p>
        <Link href="/advisor/quote" className="btn btn-primary btn-sm mt-2">Upload a quotation</Link>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-3">
          <p className="font-semibold text-ink">Stated as included</p>
          {block.inclusions.length ? <ul className="mt-1 space-y-0.5">{block.inclusions.map((t) => <li key={t} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />{t}</li>)}</ul> : <p className="mt-1 text-muted">No inclusions stated explicitly.</p>}
        </div>
        <div className="rounded-xl border border-line bg-white p-3">
          <p className="font-semibold text-ink">Stated as excluded</p>
          {block.exclusions.length ? <ul className="mt-1 list-disc pl-4">{block.exclusions.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="mt-1 text-muted">No exclusions stated.</p>}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-white p-3">
        <p className="font-semibold text-ink">Lines{block.supplierName ? ` · ${block.supplierName}` : ""}</p>
        <ul className="mt-1 space-y-0.5">
          {block.items.map((i, idx) => <li key={idx} className="flex justify-between gap-2"><span>{i.quantity} × {i.description}</span><span className="tabular-nums">{i.lineTotalPhp != null ? peso(i.lineTotalPhp) : "—"}</span></li>)}
          {block.installationPhp != null ? <li className="flex justify-between gap-2"><span>Installation</span><span>{peso(block.installationPhp)}</span></li> : null}
          {block.totalPhp != null ? <li className="flex justify-between gap-2 border-t border-line pt-1 font-semibold"><span>Stated total</span><span>{peso(block.totalPhp)}</span></li> : null}
        </ul>
        {block.warranties.length ? <p className="mt-2 text-xs text-ink-soft">Warranties stated: {block.warranties.map((w) => `${w.item}${w.years ? ` ${w.years} yrs` : ""}`).join("; ")}</p> : null}
      </div>
      {block.missing.length ? (
        <div className="rounded-xl border border-[#f1d28a] bg-[#fdf3d7] p-3 text-[#5f4300]">
          <p className="font-semibold">Missing or unclear</p>
          <ul className="mt-1 list-disc pl-4">{block.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      ) : null}
      {block.reviewId ? <Link href={`/advisor/quote/${block.reviewId}`} className="btn btn-secondary btn-sm">Open quotation review</Link> : null}
    </div>
  );
}

export function AdvisorBlocks({ blocks, compare, onSuggest }: { blocks: AdvisorBlock[]; compare?: CompareControls; onSuggest?: (q: string) => void }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        if (block.type === "price") return <PriceBlockView key={idx} block={block} compare={compare} />;
        if (block.type === "compare") return <CompareBlockView key={idx} block={block} />;
        if (block.type === "compatibility") return <CompatibilityView key={idx} block={block} />;
        if (block.type === "quote_contents") return <QuoteContentsView key={idx} block={block} />;
        return (
          <div key={idx} className="flex flex-wrap gap-2">
            {block.suggestions.map((s) => (
              <button key={s} type="button" className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-sm text-forest-deep hover:border-forest" onClick={() => onSuggest?.(s)}>
                {s}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
