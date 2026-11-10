import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getDraftByToken, GUEST_DRAFT_COOKIE } from "@/lib/guest-drafts";
import { EstimateWizard } from "@/components/estimate/estimate-wizard";
import { startOverEstimateAction } from "@/app/actions/estimate";

export const metadata: Metadata = {
  title: "Get a free solar estimate",
  description: "Four short steps. No account needed for your first estimate.",
};

export default async function EstimatePage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const store = await cookies();
  const draft = getDraftByToken(store.get(GUEST_DRAFT_COOKIE)?.value);
  const user = await getSessionUser();
  const query = await searchParams;
  const requested = Number(query.step);
  const step = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? Math.min(requested, draft?.step ?? 1) : Math.min(draft?.step ?? 1, 4);

  return (
    <div className="relative overflow-hidden border-b border-line">
      <div className="pointer-events-none absolute inset-0 sun-arc opacity-70" aria-hidden="true" />
      <div className="shell relative py-10 md:py-14">
        <div className="mx-auto mb-8 max-w-2xl">
          <h1 className="display-lg text-forest-deep">Your free solar estimate</h1>
          <p className="mt-3 text-ink-soft">
            Four short steps, about two minutes.{" "}
            {user ? "We will save the result to your account." : "No account needed to see your first result."}
          </p>
          {draft ? (
            <form action={startOverEstimateAction} className="mt-2">
              <button type="submit" className="text-sm font-semibold text-forest underline underline-offset-2">
                Start over with a blank estimate
              </button>
            </form>
          ) : null}
        </div>
        <EstimateWizard initial={draft?.data ?? {}} initialStep={step} signedInCustomer={user?.role === "customer"} />
      </div>
    </div>
  );
}
