import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ArrowRight } from "@/components/icons";
import { peso, shortDate, statusTone, titleCase } from "@/lib/format";

export const metadata = { title: "Lead inbox" };

interface LeadRow {
  invite_id: string;
  invite_status: string;
  request_id: string;
  request_status: string;
  created_at: string;
  share_contact: number;
  site_name: string;
  city: string;
  property_type: string;
  roof_area_m2: number;
  quote_status: string | null;
  price_php: number | null;
}

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "quoted", label: "Quoted" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
] as const;

export default async function InstallerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);
  const query = await searchParams;
  const filter = FILTERS.some((item) => item.key === query.status) ? (query.status as string) : "open";

  let leads: LeadRow[] = [];
  if (installer) {
    const statusClause =
      filter === "open"
        ? "AND qi.status IN ('invited','viewed')"
        : filter === "quoted"
          ? "AND qi.status = 'quoted'"
          : filter === "declined"
            ? "AND qi.status = 'declined'"
            : "";
    leads = db
      .prepare(
        `SELECT qi.id AS invite_id, qi.status AS invite_status, qr.id AS request_id,
           qr.status AS request_status, qr.created_at, qr.share_contact,
           s.name AS site_name, s.city, s.property_type, s.roof_area_m2,
           q.status AS quote_status, q.price_php
         FROM quote_invites qi
         JOIN quote_requests qr ON qr.id = qi.quote_request_id
         JOIN sites s ON s.id = qr.site_id
         LEFT JOIN installer_quotes q ON q.invite_id = qi.id
         WHERE qi.installer_id = ? ${statusClause}
         ORDER BY qr.created_at DESC`,
      )
      .all(installer.id) as LeadRow[];
  }

  const isVerified = installer?.verification_status === "verified";

  return (
    <>
      <PageHeader
        eyebrow="Lead inbox"
        title="Customer requests"
        description="Only requests where the customer selected your business appear here. Contact details are shown only when the customer opted in."
      />

      {!isVerified ? (
        <div className="mb-5 rounded-xl border border-[#f5d68a] bg-sun-soft/60 px-4 py-3 text-sm text-[#6b4708]">
          Your business must be verified before leads and quoting unlock.{" "}
          <Link href="/installer/profile" className="font-semibold underline">Review your verification status</Link>.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/installer/leads?status=${item.key}`}
            className={`btn btn-sm ${filter === item.key ? "btn-primary" : "btn-secondary"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No open leads" : "Nothing here yet"}
          body={
            isVerified
              ? "When a customer requests a quote and selects your business, the request appears here with their assessment summary."
              : "Complete verification first. Leads are only sent to installers approved by a SOLARekta admin."
          }
          action={<Link href="/installer" className="btn btn-secondary">Back to pipeline</Link>}
        />
      ) : (
        <div className="card table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="table">
            <caption className="sr-only">Your assigned quote requests</caption>
            <thead>
              <tr>
                <th>Site</th><th>City</th><th>Requested</th><th>Lead</th><th>Request</th>
                <th className="text-right">Your quote</th><th>Contact</th><th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.invite_id}>
                  <td>
                    <p className="font-medium text-ink">{lead.site_name}</p>
                    <p className="text-xs text-muted">{titleCase(lead.property_type)} · {lead.roof_area_m2} m² roof</p>
                  </td>
                  <td className="text-sm text-ink-soft">{lead.city}</td>
                  <td className="text-sm text-ink-soft">{shortDate(lead.created_at)}</td>
                  <td><span className={`badge badge-${statusTone(lead.invite_status)}`}>{lead.invite_status}</span></td>
                  <td><span className={`badge badge-${statusTone(lead.request_status)}`}>{lead.request_status}</span></td>
                  <td className="table-num text-right">{lead.price_php != null ? peso(lead.price_php) : "—"}</td>
                  <td className="text-xs text-muted">{lead.share_contact ? "Shared" : "Hidden"}</td>
                  <td className="text-right">
                    <Link href={`/installer/leads/${lead.request_id}`} className="link-action text-xs">
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
