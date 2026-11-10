import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/provider";
import { listQuoteReviews, reviewData } from "@/lib/advisor/quote-reviews";
import { startManualQuoteAction, uploadQuoteAction } from "@/app/actions/advisor";
import { ActionForm } from "@/components/marketplace/action-form";
import { Lock } from "@/components/icons";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Review a solar quotation" };

export default async function QuoteUploadPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const query = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/advisor/quote");
  const reviews = user.role === "customer" || user.role === "installer" ? listQuoteReviews(user.id) : [];
  const ai = aiStatus().enabled;

  return (
    <div className="shell max-w-3xl py-8 md:py-12">
      <Link href="/advisor" className="link-action text-sm">← Ask Solar AI</Link>
      <h1 className="display-md mt-3 text-forest-deep">Review a quotation</h1>
      <p className="mt-3 text-ink-soft">
        Upload a PDF or photo of a solar quotation. {ai ? "AI reads the equipment, quantities, prices, installation charges and warranties; " : "Enter the lines yourself; "}
        you can correct every value before we compare it with verified catalogue prices.
      </p>
      <p className="mt-3 flex gap-2 rounded-xl bg-mint px-4 py-3 text-sm text-forest-deep">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" /> Private to your account. Never added to the catalogue, never sent to suppliers, and the text is not written to logs. You can delete it at any time.
      </p>
      {query.deleted ? <p role="status" className="mt-4 rounded-xl bg-paper px-4 py-2 text-sm">Quotation deleted.</p> : null}

      {user.role === "customer" || user.role === "installer" ? (
        <>
          <div className="card card-pad mt-6">
            <ActionForm action={uploadQuoteAction} submitLabel="Upload and read" pendingLabel="Reading the quotation…">
              <div>
                <label htmlFor="quotation" className="label">Quotation file</label>
                <input id="quotation" name="quotation" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" required />
                <p className="help">PDF, JPG, PNG or WEBP, up to 8 MB.</p>
              </div>
            </ActionForm>
            <form action={startManualQuoteAction} className="mt-3 border-t border-line pt-3">
              <button type="submit" className="link-action text-sm">No file? Type the quotation in instead</button>
            </form>
          </div>

          {reviews.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-forest-deep">Your quotations</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
                {reviews.map((r) => {
                  const d = reviewData(r);
                  return (
                    <li key={r.id}>
                      <Link href={`/advisor/quote/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 no-underline hover:bg-paper">
                        <span>
                          <span className="block font-medium text-ink">{d.supplierName || "Quotation"} · {d.items.length} lines</span>
                          <span className="text-xs text-muted">Updated {shortDate(r.updated_at)}</span>
                        </span>
                        <span className={`badge ${r.status === "confirmed" ? "badge-good" : "badge-warn"}`}>{r.status === "confirmed" ? "Checked by you" : "Needs checking"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="card card-pad mt-6 text-ink-soft">Quotation review is available for homeowner, business and installer accounts.</p>
      )}
    </div>
  );
}
