import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { compareQuote, getQuoteReview, reviewData } from "@/lib/advisor/quote-reviews";
import { describeSummary } from "@/lib/advisor/view";
import { deleteQuoteReviewAction } from "@/app/actions/advisor";
import { QuoteEditor } from "@/components/advisor/quote-editor";
import { RecordCard } from "@/components/advisor/result-cards";
import { Alert, Lock } from "@/components/icons";

export const metadata: Metadata = { title: "Quotation review" };

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

export default async function QuoteReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/advisor/quote/${id}`);
  const review = getQuoteReview(id, user.id);
  if (!review) notFound();
  const data = reviewData(review);
  const { analysis, items } = compareQuote(data);

  return (
    <div className="shell max-w-4xl py-8 md:py-12">
      <Link href="/advisor/quote" className="link-action text-sm">← Your quotations</Link>
      <h1 className="display-md mt-3 text-forest-deep">Quotation review</h1>
      <p className="mt-2 flex gap-2 text-sm text-ink-soft"><Lock className="mt-0.5 h-4 w-4 shrink-0" /> Private to you. Not shared with suppliers or added to the catalogue.</p>

      {review.status !== "confirmed" ? (
        <p className="mt-4 flex gap-2 rounded-xl border border-[#f1d28a] bg-[#fdf3d7] px-4 py-3 text-sm text-[#5f4300]">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          {review.extraction_source === "ai"
            ? "These values were read automatically. Check each one against your document and correct anything wrong, then save."
            : review.extraction_note ?? "Enter the quotation lines, then save to compare."}
        </p>
      ) : null}
      {query.saved ? <p role="status" className="mt-4 rounded-xl bg-mint px-4 py-2 text-sm text-forest-deep">Saved. The comparison below uses your corrected values.</p> : null}
      {review.file_id ? <a href={`/api/files/${review.file_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-4">Open the original file</a> : null}

      <div className="mt-6">
        <QuoteEditor reviewId={review.id} initial={data} />
      </div>

      {data.items.length ? (
        <section id="comparison" className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold text-forest-deep">Checks and comparison</h2>
          <div className="card card-pad grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted">Sum of priced lines + charges</p><p className="text-lg font-semibold">{analysis.computedTotalPhp != null ? peso(analysis.computedTotalPhp) : "Not all lines priced"}</p></div>
            <div><p className="text-xs text-muted">Stated total</p><p className="text-lg font-semibold">{analysis.statedTotalPhp != null ? peso(analysis.statedTotalPhp) : "Not stated"}</p></div>
            <div><p className="text-xs text-muted">Difference</p><p className="text-lg font-semibold">{analysis.totalDifferencePhp != null ? peso(analysis.totalDifferencePhp) : "—"}</p></div>
          </div>

          {analysis.missing.length ? (
            <div className="rounded-xl border border-[#f1d28a] bg-[#fdf3d7] p-4 text-sm text-[#5f4300]">
              <p className="font-semibold">Missing information that affects comparison</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{analysis.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ) : null}

          {items.map((c) => {
            const a = analysis.items[c.index];
            if (!a.category || !["panel", "inverter", "battery"].includes(a.category)) return null;
            return (
              <div key={c.index} className="card card-pad space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-forest-deep">Line {c.index + 1}: {a.item.description}</h3>
                  <p className="text-sm">Your quote: <strong>{c.quoteUnitPricePhp != null ? `${peso(c.quoteUnitPricePhp)} each` : "no price"}</strong> × {a.item.quantity}</p>
                </div>
                {a.nominalKwh ? <p className="text-sm text-ink-soft">Nominal capacity from the description: {a.nominalKwh} kWh per unit (calculated, not usable capacity).</p> : null}
                {c.reason ? <p className="text-sm text-[#5f4300]">{c.reason}</p> : null}
                {c.catalogue ? (
                  <p className="rounded-xl bg-paper px-3 py-2 text-sm"><span className="font-semibold">Verified catalogue, exact matches:</span> {describeSummary(c.catalogue)}</p>
                ) : c.comparable || !c.reason ? (
                  <p className="text-sm text-ink-soft">No exact catalogue match with a listed price. {c.alternatives.length ? "Nearby alternatives are shown for reference only." : ""}</p>
                ) : null}
                {c.exactListings.length + c.alternatives.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {c.exactListings.map((r) => <RecordCard key={r.ref} record={r} match={{ record: r, kind: "exact", differences: [], missing: [] }} />)}
                    {c.alternatives.map((m) => <RecordCard key={m.record.ref} record={m.record} match={m} />)}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-muted">Catalogue prices are equipment-only listings from verified suppliers, compared only with equipment lines when installation is priced separately. They are observations, not offers.</p>
          <Link href={`/advisor?q=What%20is%20included%20in%20this%20quotation%3F&review=${review.id}`} className="btn btn-secondary btn-sm">Ask Solar AI about this quotation</Link>
        </section>
      ) : null}

      <form action={deleteQuoteReviewAction} className="mt-10 border-t border-line pt-4">
        <input type="hidden" name="reviewId" value={review.id} />
        <button type="submit" className="link-action link-danger text-sm">Delete this quotation and its file</button>
      </form>
    </div>
  );
}
