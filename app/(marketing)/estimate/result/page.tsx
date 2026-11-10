import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { draftToInputs, getDraftByToken, GUEST_DRAFT_COOKIE } from "@/lib/guest-drafts";
import { assessSolar } from "@/lib/solar/engine";
import { summarizeResult } from "@/lib/solar/view";
import { saveEstimateToAccountAction, startOverEstimateAction } from "@/app/actions/estimate";
import { NextActionCard, ResultDetails, ResultHeadline, SizingNotice } from "@/components/results/result-summary";
import { ArrowRight, Check, Shield } from "@/components/icons";

export const metadata: Metadata = { title: "Your preliminary solar estimate", robots: { index: false } };

export default async function EstimateResultPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const store = await cookies();
  const draft = getDraftByToken(store.get(GUEST_DRAFT_COOKIE)?.value);
  if (!draft) redirect("/estimate");
  if (!draft.completed) redirect(`/estimate?step=${Math.min(draft.step, 4)}`);

  const user = await getSessionUser();
  const query = await searchParams;
  // Computed on request from the stored inputs; nothing is persisted until the user saves it.
  const result = assessSolar(draftToInputs(draft.data));
  const s = summarizeResult(result);
  const place = [draft.data.city, draft.data.province].filter(Boolean).join(", ");

  const saveAction =
    user?.role === "customer" ? (
      <form action={saveEstimateToAccountAction}>
        <button type="submit" className="btn btn-primary w-full sm:w-auto">
          Save to my account <ArrowRight />
        </button>
      </form>
    ) : user ? null : (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/signup?from=estimate" className="btn btn-primary">
          Save my estimate <ArrowRight />
        </Link>
        <Link href="/login?from=estimate" className="btn btn-secondary">
          Log in
        </Link>
      </div>
    );

  return (
    <div className="shell max-w-5xl py-10 md:py-14">
      <div className="intro">
        <p className="eyebrow">Preliminary estimate{place ? ` for ${place}` : ""}</p>
        <h1 className="display-lg mt-2 text-forest-deep">
          {s.hasSystem ? "Here’s what solar could do for you" : "We need a little more information"}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Based on your answers and typical Philippine sunshine. It is an estimate, not a quotation or a promise of
          savings.
        </p>
      </div>

      {query.error === "role" ? (
        <p role="alert" className="alert-error mt-5">
          Estimates can be saved to customer accounts only. Log out and continue as a homeowner or business.
        </p>
      ) : null}

      <div className="mt-6 space-y-5">
        <SizingNotice
          result={result}
          action={
            s.status === "roof_unchecked" || s.status === "insufficient_roof" ? (
              <Link href="/estimate?step=3" className="btn btn-secondary btn-sm">Edit roof details</Link>
            ) : undefined
          }
        />
        <ResultHeadline result={result} />

        {saveAction ? (
          <NextActionCard
            title={user ? "Keep this estimate" : "Save it and compare providers"}
            body={
              user
                ? "Save it to your account to add roof details and request quotes from verified installers."
                : "Create a free account to keep this estimate, refine your roof details and request quotes from verified installers in your area."
            }
            action={saveAction}
          />
        ) : null}

        <ResultDetails result={result} showCashflow={false} />
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Link href="/estimate?step=1" className="btn btn-ghost">Edit my answers</Link>
          <form action={startOverEstimateAction}>
            <button type="submit" className="btn btn-ghost">Start over</button>
          </form>
        </div>
        <ul className="space-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> No name, address or bill file was collected.</li>
          <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Your answers are kept for 7 days so you can return.</li>
        </ul>
      </div>
    </div>
  );
}
