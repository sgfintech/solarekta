import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { InstallerDecisionForm } from "@/components/admin/installer-decision-form";
import { dateTime, shortDate, statusTone, titleCase } from "@/lib/format";
import { parseServiceAreas } from "@/lib/service-areas";
import type { InstallerRow } from "@/lib/types";

export const metadata = { title: "Installer review" };

interface InstallerAdminRow extends InstallerRow {
  email: string;
  account_name: string;
  user_status: string;
  doc_count: number;
  lead_count: number;
  quote_count: number;
}

const FILTERS = [
  { key: "queue", label: "Needs review" },
  { key: "verified", label: "Verified" },
  { key: "suspended", label: "Suspended" },
  { key: "all", label: "All" },
] as const;

export default async function AdminInstallersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; done?: string }>;
}) {
  await requireUser(["admin"]);
  const query = await searchParams;
  const filter = FILTERS.some((item) => item.key === query.status) ? query.status : "queue";

  const where =
    filter === "queue"
      ? "WHERE i.verification_status IN ('draft','pending','rejected')"
      : filter === "verified"
        ? "WHERE i.verification_status = 'verified'"
        : filter === "suspended"
          ? "WHERE i.verification_status = 'suspended'"
          : "";

  const installers = db
    .prepare(
      `SELECT i.*, u.email, u.name AS account_name, u.status AS user_status,
         (SELECT COUNT(*) FROM installer_documents d WHERE d.installer_id = i.id) AS doc_count,
         (SELECT COUNT(*) FROM quote_invites qi WHERE qi.installer_id = i.id) AS lead_count,
         (SELECT COUNT(*) FROM installer_quotes q WHERE q.installer_id = i.id) AS quote_count
       FROM installers i JOIN users u ON u.id = i.user_id
       ${where}
       ORDER BY CASE i.verification_status WHEN 'pending' THEN 0 WHEN 'draft' THEN 1 WHEN 'rejected' THEN 2 WHEN 'suspended' THEN 3 ELSE 4 END,
         i.updated_at DESC`,
    )
    .all() as InstallerAdminRow[];

  return (
    <>
      <PageHeader
        eyebrow="Trust & safety"
        title="Installer review"
        description="Approve, reject or suspend installer accounts after reviewing their business details and uploaded documents. Decisions are visible to the installer and written to the audit log."
      />

      {query.done ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          Decision recorded: {titleCase(query.done)}. The installer has been notified.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/installers?status=${item.key}`}
            className={`btn btn-sm ${filter === item.key ? "btn-primary" : "btn-secondary"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {installers.length === 0 ? (
        <EmptyState
          title="Nothing in this queue"
          body="There are no installer applications matching this filter. New submissions notify all active admins."
          action={<Link href="/admin" className="btn btn-secondary">Back to operations</Link>}
        />
      ) : (
        <div className="space-y-5">
          {installers.map((installer) => {
            const areas = parseServiceAreas(installer.service_areas_json);
            const documents = db
              .prepare(
                `SELECT d.id, d.kind, d.status, d.created_at, f.id AS file_id, f.original_name, f.size_bytes
                 FROM installer_documents d JOIN files f ON f.id = d.file_id
                 WHERE d.installer_id = ? ORDER BY d.created_at DESC`,
              )
              .all(installer.id) as {
              id: string;
              kind: string;
              status: string;
              created_at: string;
              file_id: string;
              original_name: string;
              size_bytes: number;
            }[];
            const events = db
              .prepare("SELECT * FROM verification_events WHERE installer_id = ? ORDER BY created_at DESC LIMIT 5")
              .all(installer.id) as { id: string; action: string; notes: string | null; created_at: string }[];

            return (
              <article key={installer.id} id={`installer-${installer.id}`} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl text-forest-deep">{installer.business_name}</h2>
                      <span className={`badge badge-${statusTone(installer.verification_status)}`}>{installer.verification_status}</span>
                      {installer.user_status !== "active" ? <span className="badge badge-bad">account {installer.user_status}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {installer.account_name} · {installer.email}
                      {installer.phone ? ` · ${installer.phone}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>Applied {shortDate(installer.created_at)}</p>
                    <p>{installer.years_experience ?? "—"} yrs · {installer.doc_count} docs · {installer.lead_count} leads · {installer.quote_count} quotes</p>
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.15fr_1fr]">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Business details</h3>
                    <p className="mt-1 text-sm text-ink-soft">{installer.about || "No description provided."}</p>
                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-muted">Service areas</dt><dd className="text-right font-medium text-ink">{areas.length ? areas.join(", ") : "—"}</dd></div>
                      <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-muted">Licence</dt><dd className="text-right font-medium text-ink">{installer.license_no || "—"}</dd></div>
                      <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-muted">Website</dt><dd className="text-right font-medium text-ink">{installer.website ? <a href={installer.website} target="_blank" rel="noreferrer" className="text-forest underline">{installer.website.replace(/^https?:\/\//, "")}</a> : "—"}</dd></div>
                      <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-muted">Verified</dt><dd className="text-right font-medium text-ink">{installer.verified_at ? dateTime(installer.verified_at) : "—"}</dd></div>
                    </dl>

                    <h3 className="mt-5 text-sm font-semibold text-ink">Documents</h3>
                    {documents.length === 0 ? (
                      <p className="mt-1 rounded-lg bg-sun-soft/50 px-3 py-2 text-xs text-[#6b4708]">
                        No documents uploaded. Do not approve verification without supporting documents unless your policy
                        explicitly allows an exception.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {documents.map((document) => (
                          <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                            <a href={`/api/files/${document.file_id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-7 items-center font-medium text-forest underline underline-offset-2">
                              {document.original_name}
                            </a>
                            <span className="text-muted">{titleCase(document.kind)} · {Math.max(1, Math.round(document.size_bytes / 1024))} KB</span>
                            <span className={`badge badge-${statusTone(document.status)}`}>{document.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {events.length > 0 ? (
                      <details className="mt-4 border-t border-line pt-3">
                        <summary className="link-action text-xs">Verification history</summary>
                        <ol className="mt-2 space-y-2">
                          {events.map((event) => (
                            <li key={event.id} className="text-xs">
                              <p className="font-medium text-ink">{titleCase(event.action)} · {dateTime(event.created_at)}</p>
                              {event.notes ? <p className="text-ink-soft">{event.notes}</p> : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-line bg-paper-deep/40 p-4">
                    <h3 className="text-sm font-semibold text-ink">Record a decision</h3>
                    <p className="mt-1 text-xs text-muted">
                      The installer sees your notes. Approving confirms only that documents were reviewed — not workmanship,
                      pricing or savings.
                    </p>
                    <div className="mt-3">
                      <InstallerDecisionForm installerId={installer.id} status={installer.verification_status} />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
