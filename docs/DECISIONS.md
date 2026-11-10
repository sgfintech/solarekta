# Decisions — SOLARekta MVP

Recorded assumptions, trade-offs and questions that need founder/legal approval. Items marked
**OPEN** are not settled by code and must not be presented to users as facts.

## 1. Architecture decisions

### D-01 Modular monolith on Next.js
**Decision:** One Next.js app with Server Actions and raw SQL.  
**Why:** Fastest path to a coherent, testable pilot; no API/queue/ORM overhead.  
**Trade-off:** No independent scaling of API and web; SQLite and in-memory limits are single-instance.  
**Revisit:** Before public growth; PostgreSQL/object storage first.

### D-02 SQLite with hand-written SQL
**Decision:** `better-sqlite3`, explicit schema, no ORM.  
**Why:** Transparent queries, trivial local demo, easy ownership predicates, no generated client.  
**Trade-off:** Manual migration path; REAL money; limited concurrency.  
**Revisit:** Postgres migration plan in `docs/DATA_MODEL.md`.

### D-03 Server-side ownership checks, not RLS
**Decision:** Every query includes `user_id`/invite predicates; guards run in pages and actions.  
**Why:** SQLite has no row-level security; explicit predicates are auditable.  
**Trade-off:** A missed predicate is a vulnerability; tests cover the main access paths.  
**Revisit:** Use Postgres RLS as defence in depth after migration.

### D-04 Private files outside the web root
**Decision:** Store uploads in `var/uploads`; stream through `/api/files/[id]` after an auth check.  
**Why:** No public bucket misconfiguration; owner/reviewer checks in one place.  
**Trade-off:** App process serves bytes; no CDN.  
**Revisit:** S3-compatible storage with short-lived signed URLs.

### D-05 AI is optional and never authoritative
**Decision:** Deterministic engine owns all numbers; AI only proposes extraction and rewrites prose.  
**Why:** Safety, reproducibility, offline operation, no dependency on a provider.  
**Trade-off:** AI quality is not on the critical path; extraction still needs customer confirmation.  
**Revisit:** Add provider abstraction/fixtures, but keep the authority boundary.

### D-06 Versioned model snapshots
**Decision:** Store `model_version`, inputs and result JSON; no silent recalculation.  
**Why:** Auditability and reproducibility for customers and disputes.  
**Trade-off:** Historical estimates may use outdated assumptions; UI must show the version.  
**Revisit:** Side-by-side “what changed” view.

## 2. Product assumptions

| ID | Assumption | Status |
|---|---|---|
| A-01 | Customers will share a bill if privacy and correction are clear | Needs pilot evidence |
| A-02 | 1–5 verified installers per request is enough choice | Needs pilot evidence |
| A-03 | Itemised quotes plus normalised metrics improve trust | Needs pilot evidence |
| A-04 | Installers will respond without paid lead fees at pilot stage | Needs pilot evidence |
| A-05 | In-app notifications are sufficient for a demo cohort | Temporary; email is P0 |
| A-06 | English with light Filipino warmth is acceptable | Needs user testing |
| A-07 | Whole-peso REAL amounts are adequate for the pilot | Temporary |

## 3. Solar and financial assumptions

These are **planning estimates**, not engineering data. Source notes live in
`lib/solar/assumptions.ts` and are repeated in the UI.

- Specific yield: rounded city table, national fallback 1,400 kWh/kWp/year. **OPEN:** validate
  against PVGIS/SARAH and publish methodology.
- Usable roof: 72% of gross area, then a roof-type factor (concrete/metal 100%, tile 85%, asbestos
  75%, unknown 85%); 5.5 m²/kWp.
- Scenario target offsets: 50% / 70% / 90% of annual consumption; shading 86% / 95% / 100%.
- Installed cost: ₱60k / ₱55k / ₱48k per kWp. Installer quotes always supersede this benchmark.
- Daytime consumption share: 30% / 45% / 60%; self-consumption factors by scenario.
- Degradation 0.5%/year; maintenance 1% of capex from year 2; inverter replacement year 12 at 12%
  of capex; discount rate 8%; horizon 25 years.
- Net-metering export credit: 55% of retail. **OPEN:** actual Meralco/utility and ERC rules vary;
  legal/regulatory review required before precise claims.
- Grid factor 0.7 kg CO₂e/kWh, labelled indicative.
- Tariff warnings outside ₱6–25/kWh.

**Hard rule:** any numeric or formula change increments `MODEL_VERSION`; golden tests must be
updated deliberately, never silently.

## 4. Verification and marketplace policy

**Decided:** Admins manually review business documents; only `verified` installers can quote.
Verification means “documents reviewed for the pilot”, not workmanship, pricing, insurance validity
or savings.

**OPEN — founder approval required:**
1. Which documents are mandatory (SEC/DTI, mayor's permit, DOE/accreditation, electrician licence,
   insurance, sample contracts)?
2. How long is verification valid, and what triggers reverification?
3. Who may approve, and is a second reviewer required for suspensions?
4. What is the complaint/appeal process and response SLA?
5. Are lead fees or subscriptions charged at pilot? If so, what is the refund policy?
6. Does SOLARekta vet quote accuracy, or only moderate obvious misrepresentation?

## 5. Privacy and compliance questions

**Implemented:** consent ledger, private bills, data export, deletion request, audit log, data
minimisation, no fake compliance badge.

**OPEN — legal review:**
1. Philippine Data Privacy Act registration/DPO obligations and privacy-notice wording.
2. Lawful basis for bill processing and contact sharing; consent vs contract.
3. Retention periods for bills, assessments, audit events and backups.
4. Whether deletion must erase backups immediately or on a documented cycle.
5. Consumer-protection wording for estimates, comparisons and installer claims.
6. Net-metering/zero-export and DOE/ERC claims; avoid implying government approval.
7. Cross-border transfer if an AI provider outside the Philippines is enabled.
8. Cookie/tracking position — the MVP uses only a strictly necessary session cookie and no analytics.

## 6. Security decisions and accepted risks

- Scrypt with per-user salt; parameters are library defaults. Revisit cost parameters with load tests.
- Sessions expire after 7 days; no sliding refresh or “remember me” yet.
- Login is rate-limited per IP+email; signup per IP; failures are generic to reduce enumeration.
- Uploads rely on magic bytes + size, **not malware scanning**. Accepted pilot risk; P0 before public.
- Rate limiting is in-memory and fail-open. Accepted pilot risk; P0 for multi-instance.
- CSP allows inline scripts/styles because Next injects them; nonce-based CSP is a later hardening.
- Audit metadata redacts sensitive keys but values inside nested objects are not recursively redacted.
- No MFA, password reset or email verification yet. Accepted for a demo cohort; P0 before self-serve.

## 7. Data and billing decisions

- Money is whole-peso REAL. **OPEN:** confirm centavo handling before payments or financing.
- Deleting an account anonymises the user row and removes marketplace data but retains audit events
  tied to the opaque user ID. **OPEN:** confirm this matches the privacy notice.
- Seed data is synthetic and replaced idempotently by email. Demo PDFs are clearly labelled
  placeholders.
- No testimonials, ratings, savings guarantees or fabricated installer counts appear in the UI.

## 8. Questions for the founder (short list)

1. Approve the pilot’s installer document policy and verification expiry.
2. Approve or amend the privacy notice, terms and consent wording with counsel.
3. Confirm the launch market and whether city coverage is sufficient for the first cohort.
4. Confirm whether AI will be enabled for the pilot; if yes, approve the provider and data terms.
5. Decide the pilot billing model (free, lead fee, subscription) and refund policy.
6. Set retention periods and a deletion SLA.
7. Approve the accessibility/mobile QA plan and who signs it off.
