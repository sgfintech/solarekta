import Link from "next/link";
import type { Metadata } from "next";
import { loadCatalogueRecords } from "@/lib/advisor/data";
import { compareNotes, compareRows, toRecordView } from "@/lib/advisor/view";
import { AdvisorBlocks } from "@/components/advisor/result-cards";

export const metadata: Metadata = { title: "Compare solar products" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = "" } = await searchParams;
  const wanted = ids.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 3);
  const records = loadCatalogueRecords();
  const items = wanted.map((id) => records.find((r) => r.productId === id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map((r) => toRecordView(r));

  return (
    <div className="shell max-w-5xl py-8 md:py-12">
      <Link href="/advisor" className="link-action text-sm">← Ask Solar AI</Link>
      <h1 className="display-md mt-3 text-forest-deep">Compare products</h1>
      {items.length < 2 ? (
        <div className="card card-pad mt-6">
          <p className="text-ink-soft">Choose at least two listed products to compare. Use “Compare” on the result cards in Ask Solar AI, or browse the catalogue.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/advisor" className="btn btn-primary btn-sm">Ask Solar AI</Link>
            <Link href="/equipment" className="btn btn-secondary btn-sm">Browse equipment</Link>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <AdvisorBlocks blocks={[{ type: "compare", items, rows: compareRows(items), notes: compareNotes(items) }]} />
          <p className="mt-4 text-xs text-muted">Values are copied from each reviewed listing. “Not stated” means the supplier did not provide it; we do not fill gaps.</p>
        </div>
      )}
    </div>
  );
}
