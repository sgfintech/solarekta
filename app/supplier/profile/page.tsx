import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSupplierByUserId, parseAreas } from "@/lib/marketplace-data";
import { saveSupplierProfileAction, uploadSupplierDocumentAction } from "@/app/actions/supplier";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/marketplace/action-form";
import { Check, Shield } from "@/components/icons";
import { shortDate, statusTone, titleCase } from "@/lib/format";

export const metadata = { title: "Company profile" };

const DOC_KINDS = [
  ["business_registration", "DTI / SEC registration"],
  ["mayors_permit", "Mayor’s or business permit"],
  ["distributor_certificate", "Distributor or brand authorisation"],
  ["product_certification", "Product certification (e.g. IEC, BPS)"],
  ["other", "Other"],
] as const;

export default async function SupplierProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  const query = await searchParams;
  const docs = supplier
    ? (db.prepare("SELECT d.*, f.original_name FROM supplier_documents d JOIN files f ON f.id = d.file_id WHERE d.supplier_id = ? ORDER BY d.created_at DESC").all(supplier.id) as {
        id: string; kind: string; status: string; file_id: string; original_name: string; created_at: string; notes: string | null;
      }[])
    : [];
  const events = supplier
    ? (db.prepare("SELECT action, notes, created_at FROM supplier_verification_events WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 10").all(supplier.id) as { action: string; notes: string | null; created_at: string }[])
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Company profile"
        description="Buyers and installers see this on your storefront. An admin reviews it with your documents before your products go live."
      />
      {query.saved ? (
        <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> {query.saved === "document" ? "Document uploaded for review." : "Profile saved and sent for review."}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card card-pad">
          <h2 className="text-xl text-forest-deep">Company details</h2>
          <div className="mt-4">
            <ActionForm action={saveSupplierProfileAction} submitLabel={supplier ? "Save changes" : "Submit for review"}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="businessName" className="label">Company name</label>
                  <input id="businessName" name="businessName" className="input" defaultValue={supplier?.business_name ?? ""} required />
                </div>
                <div>
                  <label htmlFor="supplierType" className="label">Type of supplier</label>
                  <select id="supplierType" name="supplierType" className="select" defaultValue={supplier?.supplier_type ?? "distributor"}>
                    <option value="distributor">Distributor</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="retailer">Retailer</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="yearsInBusiness" className="label">Years in business</label>
                  <input id="yearsInBusiness" name="yearsInBusiness" type="number" min={0} className="input" defaultValue={supplier?.years_in_business ?? ""} required />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="about" className="label">About your company</label>
                  <textarea id="about" name="about" className="textarea" defaultValue={supplier?.about ?? ""} placeholder="Brands you carry, warehouse location, after-sales support…" required />
                </div>
                <div>
                  <label htmlFor="phone" className="label">Business phone</label>
                  <input id="phone" name="phone" type="tel" className="input" defaultValue={supplier?.phone ?? ""} required />
                </div>
                <div>
                  <label htmlFor="registrationNo" className="label">DTI / SEC number <span className="font-normal text-muted">(optional)</span></label>
                  <input id="registrationNo" name="registrationNo" className="input" defaultValue={supplier?.registration_no ?? ""} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="deliveryAreas" className="label">Where you deliver</label>
                  <textarea id="deliveryAreas" name="deliveryAreas" className="textarea" style={{ minHeight: "4.5rem" }} defaultValue={supplier ? parseAreas(supplier.delivery_areas_json).join(", ") : ""} placeholder="Metro Manila, Cavite, Laguna, Nationwide…" required />
                  <p className="help">Separate with commas. Buyers see this before ordering.</p>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="website" className="label">Website <span className="font-normal text-muted">(optional)</span></label>
                  <input id="website" name="website" type="url" className="input" defaultValue={supplier?.website ?? ""} placeholder="https://" />
                </div>
              </div>
            </ActionForm>
          </div>
        </section>
        <aside className="space-y-5">
          <div className="card card-pad">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg text-forest-deep">Verification</h2>
              {supplier ? <span className={`badge badge-${statusTone(supplier.verification_status)}`}>{supplier.verification_status}</span> : null}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-forest" /> An admin checks your registration and documents. Nothing is auto-approved.</li>
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-forest" /> Each product is reviewed too, including its warranty and certification claims.</li>
            </ul>
            {events.length ? (
              <ul className="mt-4 space-y-2 border-t border-line pt-3 text-xs text-muted">
                {events.map((e) => (
                  <li key={e.created_at + e.action}><strong className="text-ink">{titleCase(e.action)}</strong> · {shortDate(e.created_at)}{e.notes ? ` · ${e.notes}` : ""}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Documents</h2>
            {supplier ? (
              <>
                <ul className="mt-3 space-y-2">
                  {docs.length === 0 ? <li className="text-sm text-muted">No documents yet.</li> : null}
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                      <a href={`/api/files/${doc.file_id}`} className="inline-flex min-h-7 max-w-full items-center truncate text-forest underline" target="_blank" rel="noreferrer">{doc.original_name}</a>
                      <span className={`badge badge-${statusTone(doc.status)}`}>{doc.status}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-line pt-4">
                  <ActionForm action={uploadSupplierDocumentAction} submitLabel="Upload document" pendingLabel="Uploading…" submitClassName="btn btn-secondary btn-sm" className="space-y-3">
                    <div>
                      <label htmlFor="kind" className="label">Document type</label>
                      <select id="kind" name="kind" className="select">
                        {DOC_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="file" className="label">File (PDF or image, up to 8 MB)</label>
                      <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" />
                    </div>
                  </ActionForm>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">Save your company details first, then upload documents here.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
