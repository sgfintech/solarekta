import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { setMarketingConsentAction } from "@/app/actions/settings";
import { PageHeader } from "@/components/page-header";
import { DataRequestForm, PasswordForm, ProfileSettingsForm } from "@/components/forms/settings-forms";
import { dateTime, statusTone, titleCase } from "@/lib/format";
import type { UserRow } from "@/lib/types";

export const metadata = { title: "Settings & privacy" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireUser(["customer"]);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.id) as UserRow;
  const query = await searchParams;

  const consents = db
    .prepare("SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at DESC")
    .all(user.id) as {
    id: string;
    kind: string;
    version: string;
    granted_at: string | null;
    revoked_at: string | null;
  }[];
  const marketing = consents.find((c) => c.kind === "marketing" && !c.revoked_at);

  const requests = db
    .prepare("SELECT * FROM data_requests WHERE user_id = ? ORDER BY created_at DESC")
    .all(user.id) as { id: string; kind: string; status: string; created_at: string; resolved_at: string | null }[];

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings & privacy"
        description="Control your profile security, marketing consent and data rights. Bill-processing consent is part of your account agreement."
      />

      {query.saved ? (
        <div className="mb-5 rounded-xl border border-[#bfdcaa] bg-mint px-4 py-3 text-sm text-forest-deep">
          {query.saved === "profile"
            ? "Profile updated."
            : query.saved === "password"
              ? "Password changed."
              : query.saved === "consent"
                ? "Consent preference updated."
                : "Data request submitted. You can track its status below."}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Profile</h2>
            <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
            <div className="mt-4">
              <ProfileSettingsForm name={user.name} phone={user.phone ?? ""} />
            </div>
          </section>

          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Password</h2>
            <p className="mt-1 text-sm text-ink-soft">Use at least 10 characters with a letter and a number.</p>
            <div className="mt-4"><PasswordForm /></div>
          </section>

          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Consent history</h2>
            <p className="mt-1 text-sm text-ink-soft">Every grant and withdrawal is recorded with a policy version.</p>
            <div className="mt-4 table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
              <table className="table">
                <thead><tr><th>Purpose</th><th>Version</th><th>Granted</th><th>Revoked</th></tr></thead>
                <tbody>
                  {consents.map((consent) => (
                    <tr key={consent.id}>
                      <td className="text-ink">{titleCase(consent.kind)}</td>
                      <td>{consent.version}</td>
                      <td className="text-xs">{dateTime(consent.granted_at)}</td>
                      <td className="text-xs">{consent.revoked_at ? dateTime(consent.revoked_at) : "—"}</td>
                    </tr>
                  ))}
                  {consents.length === 0 ? <tr><td colSpan={4} className="text-muted">No consent records.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <form action={setMarketingConsentAction} className="mt-5 rounded-xl border border-line bg-paper-deep/40 p-4">
              <label className="flex items-start gap-2.5 text-sm text-ink-soft">
                <input type="checkbox" name="optIn" defaultChecked={Boolean(marketing)} className="mt-0.5 h-5 w-5 accent-[#12601c]" />
                <span>
                  <strong className="text-ink">Product updates and pilot research</strong>
                  <span className="mt-0.5 block text-xs text-muted">
                    Occasional emails about new features or interview requests. Withdraw at any time; this never affects
                    your estimates or quotes.
                  </span>
                </span>
              </label>
              <button type="submit" className="btn btn-secondary btn-sm mt-3">Save consent preference</button>
            </form>
          </section>

          <section className="card card-pad">
            <h2 className="text-xl text-forest-deep">Your data rights</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Download a JSON copy immediately, or ask us to delete your account. See the{" "}
              <Link href="/privacy" className="underline">privacy notice</Link> for retention rules.
            </p>
            <a href="/api/me/export" className="btn btn-secondary btn-sm mt-4">Download my data (JSON)</a>

            <div className="mt-6 border-t border-line pt-5">
              <DataRequestForm />
            </div>

            {requests.length > 0 ? (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-sm font-semibold text-ink">Your requests</h3>
                <ul className="mt-2 space-y-2">
                  {requests.map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-soft">{titleCase(request.kind)} · {dateTime(request.created_at)}</span>
                      <span className={`badge badge-${statusTone(request.status)}`}>{request.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">What installers can see</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li>Your site’s city, property type, roof type/area and daytime usage.</li>
              <li>Your assessment summary and a consumption range.</li>
              <li>Your contact details only on requests where you ticked consent.</li>
            </ul>
            <p className="mt-3 text-xs text-muted">Installers never receive your uploaded bill document or full address through SOLARekta.</p>
          </div>
          <div className="card card-pad">
            <h2 className="text-lg text-forest-deep">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Role</dt><dd className="font-medium">{titleCase(user.role)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Member since</dt><dd className="font-medium">{dateTime(user.created_at)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><span className={`badge badge-${statusTone(user.status)}`}>{user.status}</span></dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted">To log out, use the button in the sidebar.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
