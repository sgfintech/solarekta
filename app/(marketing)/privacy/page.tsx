import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <div className="shell max-w-3xl py-14 md:py-20">
      <p className="eyebrow">Privacy</p>
      <h1 className="display-xl mt-3 text-forest-deep">Privacy notice</h1>
      <p className="mt-4 text-sm text-muted">Version 2026-01 · Applies to the Philippine pilot</p>

      <div className="prose-copy mt-8">
        <p>
          This notice explains what SOLARekta collects, why, and the choices you have. It is written to support
          compliance with the Philippine Data Privacy Act of 2012 (RA 10173). It is a product notice, not legal advice,
          and should be reviewed by counsel before commercial launch.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, email, phone number, password hash, role.</li>
          <li><strong>Site data:</strong> address area, city, roof type and area, ownership, daytime usage, budget and utility provider.</li>
          <li><strong>Bill data:</strong> uploaded file, utility provider, billing period, kWh, charges and effective rate.</li>
          <li><strong>Assessment data:</strong> model inputs, scenarios, assumptions and any explanation generated for you.</li>
          <li><strong>Marketplace data:</strong> installer profiles, quote requests, invitations, quotes and status history.</li>
          <li><strong>Technical data:</strong> session records, IP address, user agent and security audit events.</li>
        </ul>

        <h2>Why we use it</h2>
        <ul>
          <li>To calculate your solar scenarios and display a comparison of installer quotes.</li>
          <li>To verify installer businesses before they receive opted-in leads.</li>
          <li>To protect accounts, prevent abuse, investigate complaints and keep an audit trail.</li>
          <li>To meet legal, tax or dispute-resolution obligations where applicable.</li>
        </ul>

        <h2>Consent and sharing</h2>
        <p>
          Bill processing is based on the consent you give at sign-up. Installers only see your contact name, phone and
          email when you tick the contact-sharing box on a specific quote request. Until then they see the site’s city,
          roof profile, consumption summary and assessment without direct identifiers. You can withdraw contact
          sharing for future requests, but an installer who already received your details must be handled directly.
        </p>
        <p>
          We do not sell personal data. We use service providers for hosting, storage and optional AI extraction under
          confidentiality and data-processing terms. AI extraction receives the bill image only when enabled; avoid
          uploading documents containing unnecessary identifiers.
        </p>

        <h2>Retention</h2>
        <ul>
          <li>Account, site and assessment records: while your account is active, then up to 12 months for recovery and disputes.</li>
          <li>Uploaded bill files: retained while the related bill record is active; deletion requests remove the file and its derived text.</li>
          <li>Audit and security logs: up to 24 months, minimised to what is needed for security and accountability.</li>
          <li>Verification records for installers: retained while verified and up to 24 months after suspension for complaint handling.</li>
        </ul>
        <p>
          These are pilot targets, not fixed statutory periods. Where a legal obligation or active dispute requires
          longer retention, the relevant record is kept only for that purpose.
        </p>

        <h2>Your rights</h2>
        <p>
          You may request access, correction, a portable copy, blocking or erasure, and you may object to processing or
          withdraw consent. Use <Link href="/app/settings">account settings</Link> to open an export or deletion request,
          or contact the pilot team. We may need to verify your identity before acting. You also have the right to
          complain to the National Privacy Commission.
        </p>

        <h2>Security</h2>
        <p>
          We use hashed passwords, server-side authorization, private file storage, signed-in download routes,
          content-type validation, security headers and audit logging. No system is perfectly secure; report a concern
          immediately if you suspect unauthorised access.
        </p>

        <h2>Children</h2>
        <p>The service is intended for adults who can enter a contract. It is not directed to children under 18.</p>

        <h2>Changes</h2>
        <p>
          Material changes to this notice will be shown in-product before they take effect. The version and date above
          identify the notice you accepted.
        </p>
      </div>
    </div>
  );
}
