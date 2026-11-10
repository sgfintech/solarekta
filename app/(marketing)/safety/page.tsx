import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Safety, AI and data handling",
  description: "How SOLARekta keeps AI in its lane, protects uploaded bills and handles personal data.",
};

export default function SafetyPage() {
  return (
    <div className="shell max-w-4xl py-14 md:py-20">
      <p className="eyebrow">Trust centre</p>
      <h1 className="display-xl mt-3 text-forest-deep">Solar advice with clear limits.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-soft">
        Rooftop solar involves real money, electrical work and personal data. Here is what the platform does, what it
        deliberately refuses to do, and how you can check it.
      </p>

      <div className="prose-copy mt-10 max-w-3xl">
        <h2>Engineering boundaries</h2>
        <ul>
          <li>SOLARekta is not a licensed engineering firm and does not certify roofs, wiring or structural safety.</li>
          <li>No photograph or bill can prove a roof is suitable. Every installation needs a site survey by a qualified installer or engineer.</li>
          <li>Production and savings are scenarios, not guarantees. Weather, shading, equipment, tariffs and usage change outcomes.</li>
          <li>The platform does not promise DOE, ERC, LGU or distribution-utility approval, nor net-metering eligibility.</li>
        </ul>

        <h2>How AI is used</h2>
        <p>
          AI is an assistant, not the calculator. It may suggest bill fields from an uploaded image and draft a short
          explanation of a result. It cannot set prices, production, savings, payback, installer verification or final
          design. AI output is validated against a strict schema and shown for human correction before it affects an
          assessment.
        </p>
        <ul>
          <li>We send the bill image, not your account name or contact details, to the AI provider when extraction is enabled.</li>
          <li>Bill images are treated as untrusted data; instructions embedded in them are ignored by prompt design and output validation.</li>
          <li>If AI is disabled, unavailable or returns invalid output, manual entry and deterministic explanations keep working.</li>
          <li>No AI component can create payments, disclose files, verify an installer or change an assessment without server-side authorization.</li>
        </ul>

        <h2>Account and data protection</h2>
        <ul>
          <li>Passwords are salted and hashed with scrypt. Session cookies are HTTP-only, same-site and secure in production.</li>
          <li>Every database query that returns customer, bill, assessment or quote data enforces ownership or an admin role on the server.</li>
          <li>Uploaded bills are stored outside the public web root and served only through an authenticated route.</li>
          <li>Uploads are limited to 8 MB and PDF/JPG/PNG/WEBP, with content-signature checks — not just a filename extension.</li>
          <li>Audit events record sensitive actions such as verification decisions, quote submissions and data requests.</li>
          <li>Contact details are hidden from installers until you explicitly consent on a quote request.</li>
        </ul>

        <h2>Known pilot limitations</h2>
        <ul>
          <li>Malware scanning is not yet connected. Do not upload files you do not trust.</li>
          <li>Rate limiting runs in memory and is per instance; a multi-instance deployment must move it to shared storage.</li>
          <li>Email and SMS notifications are in-app only in this MVP.</li>
          <li>Payments and lead fees are not enabled.</li>
          <li>The indicative yield table must be validated against an engineering data source before precise production claims.</li>
        </ul>

        <h2>Your choices</h2>
        <p>
          You can revoke marketing consent, request a copy of your data, or request deletion from{" "}
          <Link href="/app/settings">account settings</Link>. Deletion requests are reviewed so that records needed for
          a live dispute, fraud prevention or legal obligation are handled deliberately rather than silently destroyed.
          See the <Link href="/privacy">privacy notice</Link> for retention details.
        </p>

        <h2>Reporting a concern</h2>
        <p>
          If you believe an installer, quote or assessment is misleading, contact the pilot team through the support
          channel provided in your account. Do not rely on a verification badge as an endorsement: always ask for the
          installer’s own licences, insurance and a written contract.
        </p>

        <div className="not-prose mt-8 rounded-2xl bg-sun-soft/70 p-5 text-sm text-[#6b4708]">
          <strong>Plain-language promise:</strong> we will show you the assumptions, keep your bill private, and never
          pretend a scenario is a guarantee.
        </div>
      </div>
    </div>
  );
}
