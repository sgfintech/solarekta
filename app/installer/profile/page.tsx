import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId, parseServiceAreas } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/page-header";
import { InstallerProfileForm, DocumentUploadForm } from "@/components/installer/installer-profile-form";
import { Alert, Check, Shield } from "@/components/icons";
import { dateTime, shortDate, statusTone, titleCase } from "@/lib/format";
import type { InstallerRow } from "@/lib/types";

export const metadata = { title: "Business profile" };

interface DocumentRow {
  id: string;
  kind: string;
  status: string;
  notes: string | null;
  created_at: string;
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

export default async function InstallerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser(["installer"]);
  const query = await searchParams;
  const installer = getInstallerByUserId(user.id);

  if (!installer) {
    return (
      <>
        <PageHeader eyebrow="Business profile" title="Add your business details" />
        <EmptyState
          title="No installer profile yet"
          body="Complete the onboarding form to create your business profile and submit it for manual review."
          action={<Link href="/installer/onboarding" className="btn btn-primary">Start onboarding</Link>}
        />
      </>
    );
  }

  const documents = db
    .prepare(
      `SELECT d.id, d.kind, d.status, d.notes, d.created_at, f.id AS file_id,
         f.original_name, f.mime_type, f.size_bytes
       FROM installer_documents d JOIN files f ON f.id = d.file_id
       WHERE d.installer_id = ? ORDER BY d.created_at DESC`,
    )
    .all(installer.id) as DocumentRow[];

  const events = db
    .prepare("SELECT * FROM verification_events WHERE installer_id = ? ORDER BY created_at DESC LIMIT 8")
    .all(installer.id) as { id: string; action: string; notes: string | null; created_at: string }[];

  const areas = parseServiceAreas(installer.service_areas_json);

  return (
    <>
      <PageHeader
        eyebrow="Business profile"
        title={installer.business_name}
        description="Keep your service areas and contact details accurate. Changes to a rejected or draft profile resubmit it for review."
        actions={
          <>
            <span className={`badge badge-${statusTone(installer.verification_status)}`}>{installer.verification_status}</span>
            <Link href="/installer" className="btn btn-ghost btn-sm">Back to pipeline</Link>
          </>
        }
      />

      {query.saved ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          {query.saved === "document" ? "Document uploaded and queued for review." : "Business profile saved."}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Profile details</h2>
            <p className="mt-1 text-sm text-ink-soft">Customers see this summary when choosing installers.</p>
            <div className="mt-5">
              <InstallerProfileForm installer={installer} />
            </div>
          </section>

          <section className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl text-forest-deep">Verification documents</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  PDF, JPG, PNG or WEBP up to 8 MB. Files are stored privately and served only to you and reviewing admins.
                </p>
              </div>
              <span className="badge">{documents.length} uploaded</span>
            </div>

            <div className="mt-4">
              <DocumentUploadForm />
            </div>

            {documents.length > 0 ? (
              <div className="mt-6 table-scroll border-t border-line pt-4" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="table">
                  <caption className="sr-only">Uploaded verification documents</caption>
                  <thead>
                    <tr><th>Document</th><th>Type</th><th>Uploaded</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <a href={`/api/files/${document.file_id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-7 items-center font-medium text-forest underline underline-offset-2">
                            {document.original_name}
                          </a>
                          <p className="text-xs text-muted">{Math.max(1, Math.round(document.size_bytes / 1024))} KB</p>
                        </td>
                        <td className="text-sm text-ink-soft">{titleCase(document.kind)}</td>
                        <td className="text-xs text-ink-soft">{shortDate(document.created_at)}</td>
                        <td><span className={`badge badge-${statusTone(document.status)}`}>{document.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-line bg-paper-deep/40 px-4 py-3 text-sm text-ink-soft">
                No documents uploaded yet. Add at least one registration or permit document so an admin can review your
                application.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-forest" />
              <h2 className="text-lg text-forest-deep">Verification status</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {installer.verification_status === "verified"
                ? "Your business is verified. You can receive leads and submit quotes while your documents stay current."
                : installer.verification_status === "pending"
                  ? "An admin is reviewing your profile and documents. You will receive a notification when a decision is recorded."
                  : installer.verification_status === "rejected"
                    ? "Your application was not approved. Review the notes below, update your profile and resubmit."
                    : installer.verification_status === "suspended"
                      ? "Your business is suspended from new leads. Contact support before submitting new quotes."
                      : "Submit your profile to start manual review."}
            </p>
            {installer.verified_at ? (
              <p className="mt-2 text-xs text-muted">Verified {dateTime(installer.verified_at)}</p>
            ) : null}
            {events.length > 0 ? (
              <ol className="mt-4 space-y-3 border-t border-line pt-4">
                {events.map((event) => (
                  <li key={event.id} className="text-xs">
                    <p className="font-semibold text-ink">{titleCase(event.action)}</p>
                    <p className="text-muted">{dateTime(event.created_at)}</p>
                    {event.notes ? <p className="mt-0.5 text-ink-soft">{event.notes}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Public listing preview</h2>
            <p className="mt-1 text-xs text-muted">Only verified installers appear in the public directory.</p>
            <div className="mt-3 rounded-xl border border-line bg-paper-deep/40 p-4">
              <p className="font-semibold text-ink">{installer.business_name}</p>
              <p className="mt-1 text-xs text-muted">
                {areas.length > 0 ? areas.join(" · ") : "No service areas listed"}
                {installer.years_experience != null ? ` · ${installer.years_experience} yrs experience` : ""}
              </p>
              {installer.about ? <p className="mt-2 line-clamp-4 text-xs text-ink-soft">{installer.about}</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-[#ffffff] p-4 text-xs leading-relaxed text-ink-soft">
            <p className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              Never share customer bills or personal data outside the platform. Quote only on leads assigned to you.
            </p>
            <p className="mt-2 flex gap-2">
              <Alert className="mt-0.5 h-4 w-4 shrink-0 text-[#b24a2f]" />
              SOLARekta cannot verify workmanship or savings. Customers are told to check licences, insurance and
              contracts independently.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
