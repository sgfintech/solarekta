import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseAreas } from "@/lib/marketplace-data";
import { SUPPLIER_TYPE_LABEL } from "@/lib/marketplace";
import { decideSupplierAction } from "@/app/actions/admin";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { Check } from "@/components/icons";
import { shortDate, statusTone } from "@/lib/format";
import type { SupplierRow } from "@/lib/types";

export const metadata = { title: "Supplier review" };

export default async function AdminSuppliersPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  await requireUser(["admin"]);
  const query = await searchParams;
  const suppliers = db
    .prepare("SELECT * FROM suppliers ORDER BY CASE verification_status WHEN 'pending' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END, updated_at DESC")
    .all() as SupplierRow[];
  const docs = db.prepare("SELECT d.*, f.original_name FROM supplier_documents d JOIN files f ON f.id = d.file_id").all() as {
    supplier_id: string; file_id: string; kind: string; original_name: string; status: string;
  }[];

  return (
    <>
      <PageHeader eyebrow="Verification" title="Supplier review" description="Check registration and distributor documents before a supplier’s products can appear publicly." />
      {query.done ? <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep"><Check className="mt-0.5 h-4 w-4" /> Decision recorded and the supplier was notified.</p> : null}
      {suppliers.length === 0 ? <p className="card card-pad text-sm text-muted">No supplier applications yet.</p> : null}
      <div className="space-y-4">
        {suppliers.map((s) => {
          const supplierDocs = docs.filter((d) => d.supplier_id === s.id);
          return (
            <article key={s.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg text-forest-deep">{s.business_name} {s.is_demo ? <span className="badge badge-neutral ml-1">Demo</span> : null}</h2>
                  <p className="text-sm text-muted">{SUPPLIER_TYPE_LABEL[s.supplier_type]} · {s.years_in_business ?? "?"} yrs · {s.registration_no || "No registration no."} · updated {shortDate(s.updated_at)}</p>
                </div>
                <span className={`badge badge-${statusTone(s.verification_status)}`}>{s.verification_status}</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{s.about}</p>
              <p className="mt-1 text-xs text-muted">Delivers to: {parseAreas(s.delivery_areas_json).join(", ")}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {supplierDocs.length === 0 ? <li className="text-xs text-clay">No documents uploaded</li> : null}
                {supplierDocs.map((d) => (
                  <li key={d.file_id}><a href={`/api/files/${d.file_id}`} target="_blank" rel="noreferrer" className="badge inline-flex min-h-7 max-w-full whitespace-normal break-words text-left underline">{d.kind.replace(/_/g, " ")}: {d.original_name}</a></li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={decideSupplierAction} submitLabel="Record decision" className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                  <input type="hidden" name="supplierId" value={s.id} />
                  <div>
                    <label htmlFor={`a-${s.id}`} className="label">Decision</label>
                    <select id={`a-${s.id}`} name="action" className="select" defaultValue={s.verification_status === "verified" ? "suspend" : "approve"}>
                      <option value="approve">Approve</option>
                      <option value="reject">Reject</option>
                      <option value="suspend">Suspend</option>
                      <option value="reinstate">Reinstate</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`n-${s.id}`} className="label">Note to supplier</label>
                    <input id={`n-${s.id}`} name="notes" className="input" placeholder="Required when rejecting or suspending" />
                  </div>
                </ActionForm>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
