import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <div className="shell max-w-3xl py-14 md:py-20">
      <p className="eyebrow">Terms</p>
      <h1 className="display-xl mt-3 text-forest-deep">Terms of use</h1>
      <p className="mt-4 text-sm text-muted">Version 2026-01 · Philippine pilot</p>

      <div className="prose-copy mt-8">
        <p>
          These terms govern your use of the SOLARekta pilot. By creating an account you agree to them and to the{" "}
          <a href="/privacy">privacy notice</a>. If you do not agree, do not use the service.
        </p>

        <h2>1. What SOLARekta is</h2>
        <p>
          SOLARekta provides preliminary, scenario-based solar assessments and a marketplace that lets customers request
          quotes from independent installers. SOLARekta is not an installer, engineer, lender, utility or government
          agency. It does not perform installation work, certify structures or guarantee any outcome.
        </p>

        <h2>2. Estimates are not offers</h2>
        <p>
          Assessments, savings figures, payback periods, production estimates and installer verification badges are
          informational. They are not engineering designs, quotations, guarantees or financial advice. Only a written
          contract with a licensed installer creates obligations for installation work.
        </p>

        <h2>3. Your responsibilities</h2>
        <ul>
          <li>Provide accurate account, site and bill information, and correct AI-suggested values before relying on them.</li>
          <li>Upload only documents you are entitled to share; do not upload another person’s bill without consent.</li>
          <li>Do not attempt to access other users’ data, probe the service, bypass rate limits or upload malicious files.</li>
          <li>Obtain landlord, structural, electrical and utility approvals required for your property.</li>
          <li>Independently verify an installer’s licences, insurance, contract terms and workmanship.</li>
        </ul>

        <h2>4. Installer accounts</h2>
        <p>
          Installers must provide accurate business information and credentials for manual review. Verification means
          only that the documents supplied were reviewed at a point in time; it is not an endorsement, warranty or
          guarantee of quality, solvency or regulatory standing. We may suspend or reject an installer, remove a quote,
          or close an account that misrepresents credentials, spams customers or breaches these terms.
        </p>

        <h2>5. Customer contact details</h2>
        <p>
          Installers may use contact details shared through a quote request only to respond to that request. They may
          not add customers to unrelated marketing lists, resell details or contact them after a request is withdrawn.
        </p>

        <h2>6. Quotes and disputes</h2>
        <p>
          Quotes are submitted by independent installers. SOLARekta does not collect payment for installation in this
          pilot and is not a party to the installation contract. Complaints should first be raised with the installer;
          platform moderation can record a complaint and suspend an account while it is investigated.
        </p>

        <h2>7. Availability and changes</h2>
        <p>
          The pilot is provided as-is, without uptime commitments. Features, assumptions and model versions may change.
          We aim to preserve the version used for each stored assessment. We may suspend the service for maintenance or
          security.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by Philippine law, SOLARekta is not liable for indirect or consequential loss,
          lost savings, installation defects, property damage, utility decisions or acts of independent installers. Nothing
          here excludes liability that cannot lawfully be excluded.
        </p>

        <h2>9. Governing law</h2>
        <p>
          These terms are governed by the laws of the Republic of the Philippines. Disputes are subject to the courts of
          the pilot operator’s place of business, without prejudice to consumer protections that cannot be waived.
        </p>

        <h2>10. Contact</h2>
        <p>Questions about these terms can be raised through the support channel in your account.</p>
      </div>
    </div>
  );
}
