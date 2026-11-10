import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getBill } from "@/lib/data";
import { deleteBillAction } from "@/app/actions/sites";
import { PageHeader } from "@/components/page-header";
import { ConfirmBillForm } from "@/components/forms/confirm-bill-form";
import { Alert, Bill, Lock } from "@/components/icons";
import { peso, shortDate, statusTone, titleCase } from "@/lib/format";
import type { SiteRow } from "@/lib/types";
import { billChecks } from "@/lib/bills";

export const metadata = { title: "Bill review" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const bill = getBill(id, user.id);
  if (!bill) notFound();
  const site = db.prepare("SELECT * FROM sites WHERE id = ?").get(bill.site_id) as SiteRow;

  const extraction = db
    .prepare("SELECT * FROM bill_extractions WHERE bill_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(bill.id) as
    | { status: string; confidence: number | null; error: string | null; raw_json: string | null; provider: string; model: string | null }
    | undefined;

  const isDraft = bill.status === "draft";
  const issues = billChecks({
    monthlyKwh: bill.monthly_kwh,
    totalPhp: bill.total_php,
    generationChargePhp: bill.generation_charge_php,
    fixedChargesPhp: bill.fixed_charges_php,
    periodStart: bill.billing_period_start,
    periodEnd: bill.billing_period_end,
  });
  const file = bill.file_id
    ? (db.prepare("SELECT mime_type FROM files WHERE id = ? AND owner_user_id = ?").get(bill.file_id, user.id) as { mime_type: string } | undefined)
    : undefined;
  const isImage = Boolean(file && file.mime_type.startsWith("image/"));
  let notes: string | null = null;
  if (extraction?.raw_json) {
    try {
      const parsed = JSON.parse(extraction.raw_json) as { notes?: string | null };
      notes = parsed.notes ?? null;
    } catch {
      notes = null;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={site.name}
        title={isDraft ? "Check your bill values" : "Bill details"}
        description={
          isDraft
            ? "Compare each field with your bill. Nothing is used for an estimate until you confirm."
            : "This confirmed bill is the starting point for estimates on this property."
        }
        actions={
          <Link href={`/app/sites/${site.id}`} className="btn btn-ghost">
            Back to property
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card card-pad">
          <div className="flex items-center gap-2">
            <Bill className="h-5 w-5 text-forest" />
            <h2 className="text-xl text-forest-deep">{isDraft ? "Confirm the values" : "Correct or review values"}</h2>
          </div>
          <div className="mt-5">
            {isDraft && issues.length > 0 ? (
              <div role="status" className="mb-5 rounded-xl border border-[#f5d68a] bg-sun-soft px-4 py-3 text-sm text-[#6b4708]">
                <p className="font-semibold">Please check {issues.length === 1 ? "one value" : `${issues.length} values`} before confirming</p>
                <p className="mt-0.5 text-xs">Highlighted fields were missing or look unusual. Compare them with your bill.</p>
              </div>
            ) : null}
            <ConfirmBillForm bill={bill} issues={issues} />
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <form action={deleteBillAction}>
              <input type="hidden" name="billId" value={bill.id} />
              <button
                type="submit"
                className="link-action link-danger text-xs underline"
                formNoValidate
              >
                Delete this bill and its private file
              </button>
            </form>
          </div>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {isImage && bill.file_id ? (
            <figure className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated file route; not optimisable */}
              <img src={`/api/files/${bill.file_id}`} alt="Your uploaded bill" className="max-h-[28rem] w-full bg-paper object-contain" />
              <figcaption className="border-t border-line px-4 py-2 text-xs text-muted">Compare each value with your bill. Only you can see this image.</figcaption>
            </figure>
          ) : null}
          <div className="card card-pad">
            <p className="label">Current record</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><span className={`badge badge-${statusTone(bill.status)}`}>{bill.status}</span></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Source</dt><dd className="font-medium">{titleCase(bill.source)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd className="font-medium">{bill.provider}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Consumption</dt><dd className="font-medium">{bill.monthly_kwh ? `${bill.monthly_kwh.toLocaleString("en-PH")} kWh` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Total</dt><dd className="font-medium">{bill.total_php ? peso(bill.total_php) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Effective rate</dt><dd className="font-medium">{bill.effective_rate_php ? `₱${bill.effective_rate_php.toFixed(2)}/kWh` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Added</dt><dd className="font-medium">{shortDate(bill.created_at)}</dd></div>
            </dl>
            {bill.file_id ? (
              <a href={`/api/files/${bill.file_id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm mt-4 w-full">
                Open private bill file
              </a>
            ) : null}
            <p className="mt-3 flex items-start gap-2 text-xs text-muted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Access is restricted to your account and audited.
            </p>
          </div>

          {extraction ? (
            <div className="card card-pad">
              <p className="label">AI extraction record</p>
              <p className="text-sm text-ink-soft">
                {extraction.provider}{extraction.model ? ` · ${extraction.model}` : ""}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge badge-${statusTone(extraction.status)}`}>{extraction.status}</span>
                {extraction.confidence != null ? <span className="text-xs text-muted">Model-reported confidence: {extraction.confidence >= 0.8 ? "high" : extraction.confidence >= 0.5 ? "medium" : "low"}</span> : null}
              </div>
              {extraction.error ? (
                <p className="mt-3 flex gap-2 rounded-lg bg-sun-soft/60 p-3 text-xs text-[#6b4708]">
                  <Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {extraction.error}
                </p>
              ) : null}
              {notes ? <p className="mt-3 text-xs text-ink-soft">Extractor note: {notes}</p> : null}
              <p className="mt-3 text-xs text-muted">
                Confidence is the model’s own rough guess, not a measured accuracy. What you confirm is what we use.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-paper-deep/60 p-4 text-xs text-muted">
              This bill was entered manually. No document was sent to an AI provider.
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
