import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ArrowRight, Check, Shield, SunIcon } from "@/components/icons";
import { peso, shortDate, statusTone, titleCase } from "@/lib/format";

export const metadata = { title: "Pipeline" };

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

export default async function InstallerHomePage() {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);

  const leads = installer
    ? (db
        .prepare(
          `SELECT qi.id AS invite_id, qi.status AS invite_status, qr.id AS request_id,
             qr.status AS request_status, qr.created_at, qr.share_contact,
             s.name AS site_name, s.city, s.property_type, s.roof_area_m2,
             q.status AS quote_status, q.price_php
           FROM quote_invites qi
           JOIN quote_requests qr ON qr.id = qi.quote_request_id
           JOIN sites s ON s.id = qr.site_id
           LEFT JOIN installer_quotes q ON q.invite_id = qi.id
           WHERE qi.installer_id = ?
           ORDER BY qr.created_at DESC`,
        )
        .all(installer.id) as LeadRow[])
    : [];

  const latestEvent = installer
    ? (db
        .prepare("SELECT * FROM verification_events WHERE installer_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(installer.id) as { action: string; notes: string | null; created_at: string } | undefined)
    : undefined;

  const openLeads = leads.filter((lead) => ["invited", "viewed"].includes(lead.invite_status));
  const quoted = leads.filter((lead) => lead.invite_status === "quoted");
  const declined = leads.filter((lead) => lead.invite_status === "declined");
  const responded = quoted.length + declined.length;
  const responseRate = responded + openLeads.length > 0 ? Math.round((responded / (responded + openLeads.length)) * 100) : null;

  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 4")
    .all(user.id) as { id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }[];

  return (
    <>
      <PageHeader
        eyebrow="Installer workspace"
        title={installer ? installer.business_name : `Kumusta, ${user.name.split(" ")[0]}.`}
        description="Review opted-in leads, submit itemised quotes against the customer's own assessment, and keep your verification current."
        actions={
          installer ? (
            <Link href="/installer/profile" className="btn btn-secondary btn-sm">
              Business profile
            </Link>
          ) : (
            <Link href="/installer/onboarding" className="btn btn-primary btn-sm">
              Start onboarding
            </Link>
          )
        }
      />

      {!installer ? (
        <div className="mb-6 rounded-2xl border border-[#f5d68a] bg-sun-soft/60 p-5">
          <h2 className="text-lg text-forest-deep">Finish your business profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Add your business details and service areas, then upload supporting documents. A SOLARekta admin reviews
            every application manually. You cannot receive leads or submit quotes until verification is approved.
          </p>
          <Link href="/installer/onboarding" className="btn btn-primary btn-sm mt-4">
            Start onboarding <ArrowRight />
          </Link>
        </div>
      ) : installer.verification_status !== "verified" ? (
        <div
          className={`mb-6 rounded-2xl border p-5 ${
            installer.verification_status === "pending"
              ? "border-[#f5d68a] bg-sun-soft/60"
              : "border-[#ebb7a6] bg-[#f9e0d8]/70"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="h-5 w-5 text-forest" />
            <h2 className="text-lg text-forest-deep">
              {installer.verification_status === "pending"
                ? "Application under manual review"
                : installer.verification_status === "suspended"
                  ? "Account suspended from leads"
                  : installer.verification_status === "rejected"
                    ? "Application not approved yet"
                    : "Verification required"}
            </h2>
            <span className={`badge badge-${statusTone(installer.verification_status)}`}>{installer.verification_status}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            {installer.verification_status === "pending"
              ? "We review business registration, permits and licence details before activating leads. You can still update your profile and upload additional documents."
              : "Update your profile and documents, then resubmit for review. Verification decisions are always made by a human admin."}
          </p>
          {latestEvent ? (
            <p className="mt-2 text-xs text-muted">
              Latest event: {titleCase(latestEvent.action)} · {shortDate(latestEvent.created_at)}
              {latestEvent.notes ? ` — ${latestEvent.notes}` : ""}
            </p>
          ) : null}
          <Link href="/installer/profile" className="btn btn-secondary btn-sm mt-4">
            Open profile &amp; documents
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open leads", value: installer?.verification_status === "verified" ? String(openLeads.length) : "—", sub: "awaiting your response" },
          { label: "Quotes submitted", value: installer?.verification_status === "verified" ? String(quoted.length) : "—", sub: "including revisions" },
          { label: "Response rate", value: responseRate == null ? "—" : `${responseRate}%`, sub: "quoted or declined" },
          { label: "Verification", value: titleCase(installer?.verification_status ?? "not started"), sub: installer?.verified_at ? `since ${shortDate(installer.verified_at)}` : "manual review" },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-xs font-semibold text-muted">{stat.label}</p>
            <p className="mt-1.5 font-display font-bold tracking-tight text-[1.85rem] leading-none text-forest-deep">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-forest-deep">Recent leads</h2>
            <Link href="/installer/leads" className="link-action text-sm">
              Open lead inbox
            </Link>
          </div>

          {!installer || installer.verification_status !== "verified" ? (
            <EmptyState
              title="Leads unlock after verification"
              body="We only send opted-in customer requests to installers whose business details and documents have been reviewed by an admin."
              action={<Link href="/installer/profile" className="btn btn-secondary">Review profile</Link>}
            />
          ) : leads.length === 0 ? (
            <EmptyState
              title="No leads yet"
              body="When a customer requests quotes and selects your business, the request appears here with their assessment summary."
            />
          ) : (
            <div className="space-y-3">
              {leads.slice(0, 5).map((lead) => (
                <article key={lead.invite_id} className="card card-pad">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg text-forest-deep">{lead.site_name}</h3>
                      <p className="text-sm text-muted">
                        {lead.city} · {titleCase(lead.property_type)} · {lead.roof_area_m2} m² roof
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge badge-${statusTone(lead.invite_status)}`}>{lead.invite_status}</span>
                      {lead.quote_status ? <span className={`badge badge-${statusTone(lead.quote_status)}`}>{lead.quote_status}</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3">
                    <p className="text-xs text-muted">
                      Requested {shortDate(lead.created_at)} · {lead.share_contact ? "Contact shared" : "Contact hidden"}
                      {lead.price_php != null ? ` · Quote ${peso(lead.price_php)}` : ""}
                    </p>
                    <Link href={`/installer/leads/${lead.request_id}`} className="btn btn-secondary btn-sm">
                      Open lead <ArrowRight />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="card card-pad bg-forest text-[#ffffff]">
            <SunIcon className="h-6 w-6 text-sun" />
            <h2 className="mt-3 text-xl text-[#ffffff]">Quote on the customer&apos;s terms</h2>
            <p className="mt-2 text-sm text-[#d6ead0]">
              Every lead includes the deterministic assessment the customer already saw. Quote capacity, expected
              production and price honestly — customers compare bids on the same fields.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#e4f2d8]">
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sun" /> Itemise panels, inverter, labour and other costs.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sun" /> State exclusions such as permits, net-metering fees or roof works.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sun" /> SOLARekta never edits your price or promises savings for you.</li>
            </ul>
          </div>

          <div className="card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg text-forest-deep">Notifications</h2>
            </div>
            {notifications.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {notifications.map((notification) => (
                  <li key={notification.id} className="px-5 py-3">
                    <Link href={notification.href ?? "/installer"} className="block hover:underline">
                      <p className={`text-sm ${notification.read_at ? "text-ink-soft" : "font-semibold text-ink"}`}>{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.body}</p>
                      <p className="mt-1 text-xs text-muted">{shortDate(notification.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-[#ffffff] p-4 text-xs leading-relaxed text-ink-soft">
            <strong className="text-ink">Verification is not an endorsement.</strong> SOLARekta reviews documents for
            completeness, but does not guarantee workmanship, pricing or savings. Customers must still check licences,
            insurance and contracts.
          </div>
        </aside>
      </div>
    </>
  );
}
