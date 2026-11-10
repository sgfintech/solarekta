# Product Requirements — SOLARekta MVP

**Status:** implemented MVP baseline for a controlled Philippine pilot  
**Source of truth:** `SOLARekta_CURSOR_IMPLEMENTATION_PROMPT.md`  
**Last updated:** 8 November 2026

## 1. Product statement

SOLARekta is an asset-light, mobile-friendly marketplace that helps Philippine homeowners and small
businesses understand a possible rooftop solar system from their own electricity bill, then request
and compare structured quotes from manually reviewed installers.

The product must be honest about uncertainty. It provides preliminary, non-binding scenarios. It is
not an engineering certification body, a utility, a lender or a guarantee of savings.

## 2. Users and jobs to be done

### Customer (homeowner or small business)
- “I have a high electric bill. Is solar worth exploring for my roof?”
- “I do not trust a single salesperson's number. Show me the assumptions.”
- “Help me compare installers on the same fields, not just the cheapest headline price.”
- “Keep my bill and contact details private until I choose to share them.”

### Installer
- “Give me qualified, opted-in leads without paying for junk.”
- “Let me submit an itemised, professional quote quickly.”
- “Make clear what SOLARekta has and has not verified about my business.”

### Admin / trust & safety
- “Review installer documents consistently and record why.”
- “Remove misleading quotes and keep an auditable trail.”
- “Handle data export/deletion requests and see platform activity.”

## 3. MVP scope

### In scope
- Customer and installer self-service accounts with role-based access.
- Customer site profiles and private bill capture with manual correction.
- Deterministic solar/finance assessment with low/base/high scenarios and versioned assumptions.
- Optional AI bill extraction and plain-language explanation with deterministic fallback.
- Installer onboarding, document upload and manual verification.
- Quote requests, invitations, itemised quotes, revisions and side-by-side comparison.
- In-app notifications, consent history, data export and deletion requests.
- Admin verification, quote moderation, data-request handling and audit log.
- Responsive, accessible marketing and authenticated UI.

### Out of scope for this MVP
- Automated satellite/drone roof measurement or structural certification.
- Battery dispatch optimisation, IoT monitoring, predictive maintenance.
- Financing, loans, payments, escrow or lead-fee billing.
- Automated installer verification or government-approval claims.
- Native iOS/Android apps, nationwide logistics or complex subscriptions.
- Transactional email/SMS (in-app notifications only at this baseline).

## 4. Core journeys and acceptance criteria

### 4.1 Customer assessment journey

1. Visitor signs up as a customer and accepts terms/privacy (bill-processing consent recorded).
2. Customer creates a site with city, property type, ownership, roof type/area, daytime usage and
   optional budget and utility.
3. Customer uploads a bill or enters values manually. Uploaded values remain a draft until reviewed.
4. Customer confirms the bill, which becomes the sole input for an assessment.
5. Customer chooses net metering or zero export and runs the assessment.
6. The assessment page shows three scenarios, cashflow, assumptions, sources, warnings and a
   non-binding disclaimer, and can generate a plain-language explanation.
7. Customer can print the assessment or archive it.

**Acceptance**
- Assessment cannot run without a confirmed bill owned by the session user.
- Every displayed number is reproducible from the stored inputs, model version and assumptions.
- AI unavailability never blocks assessment.
- The UI never says the roof is structurally suitable or that savings are guaranteed.

### 4.2 Quote request and comparison

1. Customer selects 1–5 verified installers and chooses whether to share contact details.
2. If contact sharing is on, a contact name and phone number are required.
3. Each selected installer receives an in-app notification and a lead visible only to them.
4. Installer sees the assessment snapshot but never the uploaded bill file or full address.
5. Installer submits capacity, total price, warranties, timeline, expected production and at least
   one itemised line consistent with the total (within 5% or ₱1,000).
6. Customer compares quotes with normalised price/kWp, production delta and estimated payback.
7. Customer can close the request; open invites are withdrawn and installers are notified.

**Acceptance**
- An installer cannot read a lead unless an invite exists for that installer.
- Contact details render only when `share_contact = 1`; the UI repeats the consent scope.
- Quote totals and line items are validated server-side.
- Normalised savings/payback are labelled as SOLARekta estimates, not installer promises.

### 4.3 Installer onboarding and verification

1. Installer signs up and completes business profile, service areas and years of experience.
2. Installer uploads supporting documents (registration, permit, licence, insurance, other).
3. Application enters `pending`; admins are notified and see documents plus history.
4. Admin approves, rejects, suspends or reinstates with notes.
5. Installer sees the decision, notes and history; only `verified` installers can quote.
6. Suspended/rejected installers cannot receive new leads or submit quotes.

**Acceptance**
- No user can self-verify.
- Decisions are written to `verification_events` and `audit_events` and notify the installer.
- The copy states that verification covers documents reviewed, not workmanship, pricing or savings.

### 4.4 Privacy and data rights

- Consent grants/withdrawals are stored with policy version and timestamps.
- Bills are private by default; installers never receive the file or full address.
- Customer can download a JSON export immediately.
- Customer can request export or deletion; admins process requests.
- Deletion removes sites/bills/assessments/uploads and anonymises the account while retaining an
  audit trail of the request.

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Email/password auth with scrypt hashing and DB sessions | Must |
| FR-02 | Customer/installer/admin roles enforced server-side | Must |
| FR-03 | Site CRUD scoped to owner | Must |
| FR-04 | Private bill upload with type/size checks and manual entry | Must |
| FR-05 | Deterministic, versioned 25-year solar model | Must |
| FR-06 | Low/base/high scenarios and visible assumptions | Must |
| FR-07 | AI extraction/explanation optional and schema-validated | Should |
| FR-08 | Manual installer verification with document review | Must |
| FR-09 | Quote request, invite, submit, revise, close | Must |
| FR-10 | Side-by-side quote comparison | Must |
| FR-11 | In-app notifications | Should |
| FR-12 | Consent history and data export/deletion requests | Must |
| FR-13 | Audit log with redaction | Must |
| FR-14 | Printable assessment/comparison | Should |
| FR-15 | Public verified-installer directory | Should |

## 6. Non-functional requirements

### Security
- No client-side-only authorisation. Every page/action re-checks session and ownership.
- Uploads validated by magic bytes, capped at 8 MB, stored outside the web root.
- Session cookies `httpOnly`, `sameSite=lax`, `secure` in production.
- Rate limits on signup, login and upload; generic login failure messages.
- Audit metadata redacts keys matching password/token/secret/authorization/cookie.
- CSP, frame denial, nosniff, referrer policy and permissions policy configured.

### Privacy
- Collect only what the assessment/quote flow needs.
- Do not send unnecessary identifiers to AI providers.
- Define retention and deletion; document legal review as pending.
- Never fabricate verification, testimonials, regulatory approval or savings.

### Accessibility and UX
- Semantic landmarks, skip link, visible focus, labelled inputs, table captions, `sr-only` text.
- Mobile-first layouts; tables scroll horizontally where needed.
- Loading, error, empty and success states on every journey.
- Plain English with light Filipino warmth; currency in PHP.

### Performance and operations
- Server-rendered pages; no heavy client state library.
- Deterministic engine is CPU-only and bounded to 25 years.
- Single-process SQLite is documented as a pilot constraint.
- Production build and all quality gates pass.

## 7. Success metrics for the pilot (hypotheses, not forecasts)

- Assessment completion rate and assessment-to-quote-request conversion.
- Median time for first installer quote; quote response rate.
- Customer comparison engagement; installer close rate (reported off-platform).
- Verified installer count and document-review turnaround.
- Data-request turnaround and zero critical access-control incidents.
- Qualitative trust: can customers explain why the estimate is a range?

## 8. Release definition of done

- [x] Customer, installer and admin journeys implemented.
- [x] Deterministic model with golden/sensitivity/validation tests.
- [x] Ownership isolation and schema-constraint tests.
- [x] Typecheck, lint, tests and production build pass.
- [x] Synthetic seed data and demo accounts documented.
- [x] README and architecture/data/backlog/decision docs.
- [ ] Legal/privacy review completed.
- [ ] Email, malware scanning, durable storage and shared rate limiting for production.
- [ ] Manual accessibility and real-device QA recorded.
