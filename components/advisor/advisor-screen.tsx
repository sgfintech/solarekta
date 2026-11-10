import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { sha256 } from "@/lib/ids";
import { aiStatus } from "@/lib/ai/provider";
import { getPublicProduct } from "@/lib/marketplace-data";
import { sampleDataAllowed } from "@/lib/advisor/data";
import { EXAMPLE_QUESTIONS, latestThread, threadTurns, type Owner } from "@/lib/advisor/service";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { Bill, Shield } from "@/components/icons";

export interface AdvisorQuery {
  q?: string;
  product?: string;
  new?: string;
  review?: string;
}

/** Ask Solar AI, rendered on the public site or inside a dashboard. */
export async function AdvisorScreen({ query, variant = "public" }: { query: AdvisorQuery; variant?: "public" | "dashboard" }) {
  const user = await getSessionUser();
  const store = await cookies();
  const guestToken = store.get("solarekta_advisor")?.value;
  const owner: Owner = user ? { userId: user.id, guestKey: null } : { userId: null, guestKey: guestToken ? sha256(guestToken) : null };

  let autoAsk: { question: string; productId?: string; quoteReviewId?: string } | null = null;
  if (query.product && /^[0-9a-f-]{36}$/i.test(query.product)) {
    const product = getPublicProduct(query.product);
    if (product) autoAsk = { question: `Check this price: ${product.brand} ${product.model}`, productId: product.id };
  } else if (query.q) {
    autoAsk = { question: query.q.slice(0, 500), quoteReviewId: query.review && /^[0-9a-f-]{36}$/i.test(query.review) ? query.review : undefined };
  }
  const fresh = Boolean(autoAsk) || query.new === "1";
  const thread = fresh ? undefined : latestThread(owner);
  const turns = thread ? threadTurns(thread) : [];

  return (
    <div className={variant === "public" ? "shell max-w-4xl py-8 md:py-12" : "max-w-4xl"}>
      <div className="max-w-2xl">
        <p className="eyebrow">Ask Solar AI</p>
        <h1 className="display-md mt-2 text-forest-deep">Check a solar price before you buy</h1>
        <p className="mt-3 text-ink-soft">
          Ask about batteries, inverters and panels. You get observed prices from verified supplier listings with the source and date checked, exact matches kept apart from alternatives, and calculated capacity.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/advisor/quote" className="btn btn-secondary btn-sm"><Bill className="h-4 w-4" /> Review a quotation</Link>
          <Link href="/equipment" className="btn btn-ghost btn-sm">Browse the catalogue</Link>
        </div>
      </div>

      {sampleDataAllowed() ? (
        <p className="mt-6 rounded-xl border border-[#f1d28a] bg-[#fdf3d7] px-4 py-2 text-sm text-[#5f4300]">
          Development mode: results may include listings marked <strong>Sample data</strong>. They are fictional and are not used in production.
        </p>
      ) : null}

      <div className="mt-6">
        <AdvisorChat initialTurns={turns} initialThreadId={thread?.id ?? null} examples={EXAMPLE_QUESTIONS} autoAsk={autoAsk} signedIn={Boolean(user)} aiEnabled={aiStatus().enabled} inDashboard={variant === "dashboard"} />
      </div>

      <p className="mt-6 flex gap-2 text-xs text-muted">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Prices are observations from listings, not quotations. Suppliers confirm the final total. SOLARekta does not take payments and never shares your details without your confirmation.
      </p>
    </div>
  );
}
