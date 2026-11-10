# SOLARekta Implementation Status

Tracks delivery of `docs/SOLARekta_Improvement_Plan.md`. Updated 8 November 2026.

Legend: **Done** = implemented · **Verified** = covered by automated tests and/or exercised in a rendered browser · **Blocked** = could not be completed in this environment · **Deferred** = intentionally out of scope.

## How this was checked

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | Pass |
| Lint | `npx eslint .` | Pass, 0 problems |
| Tests | `npx vitest run` | 14 files, 129 tests passing (72 before this work) |
| Production build | `npx next build` | Pass; adds `/estimate` and `/estimate/result` |
| Browser | Playwright + Chrome against `next start` with seeded demo data | Guest, customer, provider and installer flows at 360, 390, 768 and 1440 px; no page-wide horizontal overflow on any route checked |

Checks ran in a Linux copy of the repo with a fresh `npm ci`, because the `node_modules` in the Windows folder are Windows builds. The demo database was a separate seeded copy; the real `var/solarekta.db` was never reset.

## Phase 1: Correctness — Done, Verified

| Item | Status | Notes |
| --- | --- | --- |
| Bill offset label | Done, Verified | `offsetRatio` is replaced by `generationToUseRatio` ("Solar vs. yearly use", energy). A separate `billSavingsRatio` is year-one savings ÷ 12 × monthly bill (money, same period). The UI explains that fixed charges are treated as reducible. |
| Roof limit | Done, Verified | Final capacity is `min(energy size, roof capacity)`, with no forced minimum. Below 0.5 kWp of roof capacity the result is `insufficient_roof`: zero system plus an actionable message. A sweep test covers roofs from 4 to 200 m², with all scenarios and size options. |
| Budget units | Done, Verified | The action passed the "Monthly electricity budget" field into a check against installed cost. The new `sites.install_budget_php` field is a one-time installation budget. The legacy `monthly_budget_php` is preserved but no longer used, and users who had one see a prompt explaining why. |
| LCOE | Done, Verified | Now discounted cost ÷ discounted production. A regression test recomputes it independently. |
| Export assumptions | Done, Verified | New "Not sure" option, modelled with zero credit, plus a computed net-metering upside. The 55% credit lives in versioned `EXPORT_CONFIG` (`export-2026.2`) and is labelled "assumed" everywhere. |
| Uncertainty vs. size | Done, Verified | The lower / most likely / higher outcomes keep the recommended size fixed. Smaller, recommended and larger sizes are shown separately at base assumptions. |
| Versioning and history | Done, Verified | `MODEL_VERSION` is now `solar-ph-2026.2`. `lib/solar/legacy/engine-2026-1.ts` is a frozen copy, and its golden tests still pass. Stored 2026.1 results render through `lib/solar/view.ts` with an "earlier model" notice. |
| Backup folder excluded from checks | Done | `_backup_pre_redesign` is excluded in `tsconfig.json`, `eslint.config.mjs` and `vitest.config.ts`. No files were removed. |
| Migrations | Done, Verified | `lib/migrations.ts` holds additive, idempotent migrations recorded in `schema_migrations`. They run automatically whenever the app or seed script opens the database. |

## Phase 2: First estimate — Done, Verified

- **`/estimate` wizard:** four steps (electricity → property → roof → extra power) with a progress bar and Back/Continue. Validation runs per field on both client and server. On error, the error is announced and focus moves to the first invalid field. Illustrated choices cover home or business, daytime usage, roof type and export.
- **Unknown roof:** an explicit "I don't know yet" choice, stored as `roof_area_status = 'unknown'`. The result says the size is not roof-checked, and quote requests are blocked until an area is added.
- **Drafts:** stored on the server (`guest_drafts`) and keyed by the SHA-256 hash of a random, httpOnly 7-day cookie token. Drafts hold only minimal, non-identifying inputs and nothing goes into browser storage. A reload resumes at the saved step.
- **Transfer:** on signup or login (customers only), `claimDraft` creates a site, a manual bill and an assessment owned by the user. A conditional update allows exactly one claim. Draft inputs are wiped afterwards. A draft id is never accepted as proof of ownership.
- **Province autofill:** follows the city unless the user has typed a province (wizard and site form).
- **Wording:** plain language throughout, e.g. "Add your home or business", "See my solar estimate", "What happens to extra solar power?".
- **Private bills:** bill-photo processing stays authenticated. The wizard links guests to log in only if they choose that option.
- **Verified in the browser:** an empty submit focused `monthlyKwh`; Back kept values; a reload resumed at step 4; signup redirected to the new assessment with the cookie cleared.

## Phase 3: Results, branding, forms and states — Done, Verified

- The results page leads with average monthly savings (with range), estimated installation cost and payback, then one primary action for the current state: complete roof details, see quotes in progress, choose providers, or no provider covers the area. Everything else sits in disclosures: uncertainty, size options, extra power, advanced figures with the cashflow chart, and assumptions and limits.
- Monthly figures are derived from annual results and labelled first-year averages.
- First-use dashboard: a four-step checklist replaces the empty counters until there is an estimate.
- Site form: choice cards, unknown roof area, installation budget, export preference, and field errors with focus. Submitting via a handler means typed values survive validation errors.
- Bill upload: separate "Take a photo" (camera capture) and "Choose a file" buttons, a preview, size and type checks before upload, and the file stays selected for retry. It explains plainly that PDFs are stored but not read automatically.
- Loading uses skeletons; buttons show spinners; success banners appear after saving or claiming.
- Branding uses `public/brand/` assets derived from `public/logo.png` (aspect ratio kept, transparent background).

## Phase 4: Provider matching and comparison — Done, Verified

**Coverage rules** (`lib/matching.ts`, applied on the server). Names are normalised exactly: lowercased, accents and punctuation removed, a leading "City of" dropped, NCR treated as Metro Manila. A provider matches if a declared area equals:

1. the site's city, or
2. its province (the user's entry, or the location table), or
3. its region (location table), or
4. a nationwide entry.

There is no substring matching, and a trailing "City" is kept, so Quezon City is not the province of Quezon. Only verified providers are considered.

Other changes:

- Each provider card shows a coverage badge, a "Documents reviewed" badge and what verification does *not* mean. Selection shows a live count (e.g. "2 of 5 selected"), and checkboxes are disabled at 5.
- The server enforces dedupe, the 1–5 limit and in-area eligibility, rejects requests when no provider is eligible, allows one active request per estimate, and blocks requests for unknown-roof or no-system estimates.
- The no-match state is honest and lists next steps.
- Quotes gain optional fields: panel model, inverter model, equipment supplier and what's included (installer form plus migration). The comparison page shows "Installed by" and "Not provided" for any field left blank.
- A request-progress timeline uses persisted `lead_status_events`. A new event is recorded when a provider first opens a request.
- Consent and contact sharing work exactly as before; the ownership checks are unchanged.

## Phase 5: AI — Done, Verified (with a mocked provider)

- The existing `lib/ai/provider.ts` is extended with `callModel`:
  - a per-attempt timeout and one bounded retry (timeouts, 429, 5xx);
  - per-user, per-feature daily limits;
  - usage metering in `ai_usage`, metadata only (no prompts, bill text or outputs);
  - a test seam.
- **Guards** (`lib/ai/grounding.ts`): every number in generated text must match a supplied fact or a rounding of one. Banned-claim filters cover guarantees, approvals, structural suitability and "best installer", in English and Filipino. Untrusted text is scrubbed of links, emails and phone numbers.
- **Bill review:** the photo appears beside the fields. Checks flag missing values, implausible rates, very high kWh, charges larger than the total and odd billing periods. Confidence is shown as model-reported high/medium/low, not a percentage. Extraction output is schema-validated and scrubbed.
- **Personal explanation:** English or Filipino. Cached by assessment, result hash, locale, prompt version, provider and model (`ai_cache`). The standard explanation shows immediately; AI text replaces it only if it passes the guards. Regeneration never changes figures.
- **Quote summary:** built only from quotes the customer owns, using structured fields and deterministic metrics, with no contact details or addresses. Each point cites quote refs and a field. Missing fields are listed separately from unfavourable terms. No "best installer". Ties are handled.
- **Assistant:** five suggested questions answered deterministically from the estimate. Free-text questions require AI, use maintained guidance (`lib/ai/guidance.ts`) and must be grounded. Unsupported questions get a clear limitation and a next step. Changing inputs means updating details and re-running the engine.
- **AI off:** the manual bill flow, calculations, comparisons, standard explanations and suggested answers all still work.
- **Tests cover:** disabled mode, unauthorised context, PII-free quote context, grounded vs. invented output, caching, retry, timeout, daily limit, unknown quote refs, injected instructions in quote text, missing quote terms, readable/unreadable/malformed extraction output, and scrubbing of injected notes.

## Phase 6: Supplier marketplace (three-way) — Done, Verified

Added 2026-11-09 at the owner's request ("Full three-way marketplace", with labelled demo data).

- **Supplier accounts:** new `supplier` role, signup option and `/supplier` workspace: business profile, document upload, verification history, products, orders and price requests.
- **Reviewed catalogue:** suppliers submit products, and an admin approves or rejects them with a note (`/admin/products`). Suppliers go through the same review (`/admin/suppliers`: approve, reject, suspend, reinstate). Products are public only when the product is approved *and* the supplier is verified. Editing a reviewed field (brand, model, specs, warranty, datasheet) sends the product back to review; price and stock changes do not.
- **Public pages:** `/equipment` (filters, search), product detail, `/suppliers` directory and storefronts. Datasheets (PDF) on public products are served without login; all other files stay owner/admin only.
- **Installers:** a private catalogue view; price requests to suppliers for trade pricing, optionally tied to one of their leads (`/installer/price-requests`). Quotes can link a catalogue panel and inverter, and the buyer's comparison shows a "Verified listing" link.
- **Buyers ordering directly:** order requests to one verified supplier. Each order requires an installer plan (own licensed installer, a verified SOLARekta installer, or equipment only) and an acknowledgement of how payment works. The supplier confirms with a delivery fee, an ETA and payment instructions; a supplier-entered total is required when an item is "price on request". Status flow: requested → confirmed → paid → shipped → delivered, with decline and cancel paths, a timeline and notifications.
- **No payment processing.** SOLARekta never takes money; orders are requests, and payment is arranged with the supplier, who issues an official receipt. Pages say so.
- **Demo data:** fictional brands (Sinag, Kidlat, Agos, Imbak, Bakal, Tala), three suppliers (one pending) and two more installers. All are flagged `is_demo` and shown with a "Demo listing" badge; storefronts and orders state that demo orders are not fulfilled.
- **Verified by:**
  - `tests/marketplace.test.ts`: state machines, the users-table rebuild keeping rows and cascades, catalogue visibility, order and product isolation between suppliers, and LIKE-wildcard search.
  - Browser runs at 360/390/1440 px:
    - customer orders (validation keeps entered values);
    - supplier confirms (the unpriced-item rule enforced);
    - supplier submits a product for review;
    - installer sends a price request and sees catalogue options in the quote form;
    - admin review queues, the comparison "Verified listing" links and supplier signup.
  - No horizontal overflow on any page.

## Phase 7: Ask Solar AI (price advisor) — Done, Verified (AI with a mocked provider)

Added 2026-11-09 from the AI Solar Price Advisor brief.

**Entry points:**
- "Ask Solar AI" in the main navigation and in the customer and installer sidebars.
- "Check this price" on every equipment page.
- Links beside quotation requests: the assessment page quote form, Quote requests, and the quote comparison page.

**`/advisor`:**
- A question box with the four example questions.
- Concise answers with result cards.
- Follow-ups reuse the thread context: last specs, products and quotation.
- Conversations are kept for 30 days and can be cleared ("New conversation").
- Works for guests, with a smaller quota.

**Price data:**
- **Source:** the verified catalogue (approved products of verified suppliers) is the primary source. An optional external price feed supplements it when `PRICE_FEED_URL` is set.
- **Required fields:** each record carries product/model, brand, supplier, specs, PHP currency, price, source (internal listing or https URL), date checked and stated inclusions/exclusions.
- **Bases never mixed:** products now have a price basis (equipment only, delivered, supplied and installed). Prices are summarised per basis and unit.
- **Ranges:** one priced listing shows a single observed price. Unpriced listings are counted separately.
- **Freshness:** prices older than 90 days are flagged "may be outdated".
- **No data:** the answer says so and offers a supplier quotation request.

**Matching:**
- An exact match requires every spec the user gave to be present on the listing and equal to it. A missing spec is never treated as a match.
- Nearby alternatives are labelled with their differences and kept out of the range.

**Calculations:**
- Nominal kWh = V × Ah ÷ 1,000 (51.2 V × 300 Ah = 15.36 kWh), computed in code and shown with the formula.
- Usable capacity is shown only from a stated usable figure or a stated depth of discharge, with the assumptions displayed.

**Compatibility:**
- "Manufacturer-listed" only when a reviewed listing names the other model. Suppliers can now enter compatible models, battery voltage and BMS protocols; these sit in specs, so changing them triggers admin review.
- Otherwise the answer is an unverified assessment (battery input, voltage class, BMS protocol). Voltage alone never approves a pairing, and grid-tie inverters are flagged.
- Exact models are requested when missing.

**Quotation review:**
- `/advisor/quote` takes a PDF or photo through the existing private storage (`purpose = quote_review`, owner and admin only).
- AI extraction covers items, quantities, prices, installation, other charges, total, warranties, inclusions and exclusions.
- The user can correct every value. The page then checks:
  - arithmetic (sum vs stated total);
  - missing information;
  - catalogue comparison per line, using equipment-only prices and only when installation is priced separately.
- Never shared or published. Deletable with its file.

**Direct supplier connection:**
- "Compare products" (up to 3, `/advisor/compare`).
- "View supplier".
- "Request supplier quotation": the request is shown for review first. Contact details are shared only if the buyer opts in; otherwise the supplier sees "contact not shared" and replies in-app.
- Suppliers reply or decline under Price & quotation requests. Buyers see replies under Supplier quotations.

**AI:**
- The existing server-side adapter gains three features: `advisor_extract`, `advisor_explain` and `quote_extraction`.
- Extracted numbers and model names must appear in the user's own question, or they are dropped.
- Summaries must use only numbers from the computed facts, with no links or banned claims; otherwise the deterministic summary is used.
- Documents and feed content are treated as untrusted: they are scrubbed, schema-validated and can't trigger actions.
- Provider failures and timeouts fall back to deterministic answers.

**Security and cost:**
- Zod validation on every input.
- 8 MB upload limit with file-signature checks.
- Rate limits: 12 questions/min per IP, 10 uploads/h and 10 supplier requests/h per user.
- Daily question quotas, plus per-feature AI quotas.
- Caching: catalogue records until a listing changes (max 5 min), the feed for 6 h, AI extraction for 1 h and explanations for 30 min.
- Quotation text and questions are never written to logs; audit entries are metadata only.

**Sample data:**
- Demo listings are labelled "Sample data".
- They are used only in development, or with `ADVISOR_SAMPLE_DATA=on` for a local demo, and never in production by default.

**Verified by:**
- `tests/advisor.test.ts` (32 tests): spec extraction, capacity, comparable filtering, price bases, single-listing rule, source attribution and staleness, missing-data behaviour, compatibility rules, quotation arithmetic, thread/quotation/contact access control, quotas, AI grounding, provider failure fallback, and feed validation/outage.
- Browser runs at 360–1440 px:
  - guest price question, follow-up compare and compatibility;
  - buyer "Check this price", compare page, request with review step, quotation upload with manual correction and comparison;
  - "What is included in this quotation?";
  - supplier reply seen by the buyer;
  - no horizontal overflow. The header now switches to the menu below 1024 px.

**Needs configuration:**
- `AI_PROVIDER` / `OPENAI_API_KEY` for AI extraction and summaries. Untested against the live provider.
- `PRICE_FEED_URL` (+ token) for an approved external price source. No web-search integration ships configured.
- Real suppliers must enter V/Ah, price basis, inclusions and compatibility lists for the advisor to be useful beyond the sample data.
- The battery form's capacity field is now "Nominal capacity (kWh)" (it was labelled "Usable capacity"); usable capacity and depth of discharge are separate fields. Any listing that entered a usable figure in the old field should be corrected.

## Phase 8: UI/UX quality pass — Done, Verified

Done on 2026-11-10 with the ui-ux-pro-max guidelines. The design system is recorded in `design-system/solarekta/MASTER.md`.

**Accessibility:**
- Audited 51 pages at 390 and 1440 px with `axe-core` (WCAG 2.2 AA + best practice).
- Axe violations went from 9 rule types to 0. Text under 12px went from 148 instances to 0. Undersized targets (under 24px) went from 124 to 8; the 8 left are mainly 20px checkboxes with clickable labels, which WCAG allows.
- Changes:
  - Proper landmarks on the auth pages (skip link works everywhere).
  - Labelled navigation landmarks.
  - Screen-reader labels for empty table headers.
  - Keyboard-scrollable tables with edge shadows.
  - Correct heading order.

**Touch:**
- `.link-action` for text actions: 28px on pointer devices, 44px on touch.
- 20px checkboxes and radios.
- A styled 44px file picker button.
- `touch-action: manipulation` on controls.

**Forms:**
- Typed values survive server errors in all forms (`PreservingForm`). Before, React reset fields such as the email after a failed login.
- Error banners take focus and announce on every new message.
- Library validation text is rewritten as plain language ("Generation charge (₱) must be at least 0.").

**Navigation:**
- The dashboard sidebar is grouped by job, with an unread count on Notifications.
- Icons now match their meaning: bell for notifications, sliders for settings, sparkles for AI.
- Phones get a bottom bar with each role's four main destinations, honouring the safe area.
- Ask Solar AI opens inside the buyer and installer dashboards.
- The public header switches to the menu below 1024px, so it never overflows.

**Pages:**
- **Home:** an Ask Solar AI section with a search box and example questions. The scenarios table no longer gets cut off on phones.
- **Buyer dashboard:** a quick price-check card.
- **Quote comparison:** the advisor link moved into the side panel (no wrapped header buttons).
- Footer link added. The "Accessorys" typo is fixed. Admin document badges wrap on mobile.

**Platform:**
- Viewport with theme colour and `viewport-fit=cover`.
- Tabular numbers in tables.
- Chart labels at 12px.

## Phase 9: Ocular / site surveys — Done, Verified (AI with a mocked provider)

Added 2026-11-10. Full documentation is in `docs/SITE_SURVEYS.md`.

**Done:**
- Residential and commercial templates, versioned, with four-state checklist items, separate measured values, notes and evidence on every item.
- Roof planes, with per-plane shading on commercial surveys.
- Start and Finish site visit, with optional geolocation, a geofence comparison and review flags.
- Drawn client acknowledgment.
- Streaming, deduplicated, content-checked private uploads for photos, videos and PDFs, with thumbnails, server-read MP4 duration, a lightbox and labelled metadata.
- Autosave with local recovery, offline status and version conflicts.
- Submission checks and the review workflow, with immutable revisions, evidence accept/reject and exception overrides (both with a required reason), comments and a timeline.
- Customer sharing.
- Branded A4 report.
- AI suggestions with human acceptance.
- Navigation for installers, admins and customers; "Start survey" on lead pages.
- Labelled demo data: one commercial survey in progress, and one residential survey submitted with placeholder images.

**Verified by:**
- `tests/surveys.test.ts` (24 tests):
  - templates, progress, submission blockers and warnings, contradictions, transitions, revisions, data limits and geofence;
  - access control across installers, admin and customers (shared and unshared);
  - autosave conflicts and locking;
  - upload registration and dedupe, disguised-file, size and count rejection with no leftover temp files, server MP4 duration and length limit;
  - role-based metadata hiding, content sniffing and EXIF dates;
  - AI grounding, PII exclusion, and working without AI or with a failing provider.
- Browser runs (390 / 1440 px):
  - create a survey, save the pin and start the visit (0 m from the pin);
  - autosave, and the "Issue found" explanation rule;
  - photo, MP4, WEBM and PDF uploads, disguised-file rejection with Retry, and the lightbox metadata;
  - reload persistence, offline and back online, two-device conflict with "Keep my version", and blockers listed;
  - location denied, which continues with a flag;
  - a lost upload response plus Retry gives one record;
  - review cycle: reject evidence and request changes (reasons enforced), resubmit, approve, 3 revisions;
  - customer view without GPS, phone or timeline;
  - cross-company and anonymous media return 404, a cross-site upload returns 403, Range returns 206;
  - A4 report (5 pages; 10 pages with 36 attachments and very long notes); no horizontal overflow.

**Limitations:**
- No durable offline media queue: files wait on the open page only.
- No expiring signed URLs on local disk (access is checked per request instead).
- No photo analysis by AI.
- No live AI provider test.
- WEBM duration is device-reported.
- A not-found page for an unauthorised survey streams with HTTP 200 because of Next.js streaming, but shows no data.

## Configuration and migration requirements

- **No manual migration step.** New columns and tables are added automatically the first time the updated app (or `npm run db:seed`) opens an existing database. Existing data is not changed. `npm run db:setup` alone does not apply migrations; starting the app does.
- **Optional AI** (see `.env.example`): `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `AI_TIMEOUT_MS`, `AI_DAILY_LIMIT`. This is a paid API billed to your key. With these unset, AI stays off and everything still works.
- **Existing assessments** keep their stored 2026.1 figures. Run a new estimate to get 2026.2.
- **Quote requests** now need a known roof area. Sites with an unknown area show "Add roof area".

- Marketplace migrations run automatically on app start:
  - `2026-11-09-05-supplier-role` rebuilds the `users` table to allow the `supplier` role. It copies every row, runs with foreign keys off, and runs `foreign_key_check` before re-enabling them.
  - `2026-11-09-06-marketplace` adds the new tables and quote product columns.
  - Back up `var/` before the first start on a real database.
- `2026-11-09-07-price-advisor` (automatic) adds price basis and inclusion columns to products, plus the advisor conversation, quotation review and buyer quotation request tables. Existing products default to "equipment only".
- `2026-11-10-08-site-surveys` (automatic) adds `site_surveys`, `survey_revisions`, `survey_evidence`, `survey_events`, `survey_acknowledgments` and `survey_sequences`. It's additive only. Survey media goes to `UPLOAD_DIR/surveys/`.
- `npm run db:seed` adds the demo suppliers only to a local demo database; it is not needed in production.

## Blocked

- **Live AI calls:** not exercised, because no API key was available. All AI behaviour was tested against a mocked provider. The real model's English/Filipino output quality is unreviewed.
- **Visual check of the Windows build:** builds and tests ran on Linux; the source is identical.

## Deferred (out of scope; not shown as working anywhere)

- Battery sizing, financing, structural judgements, satellite roof inference.
- Online payments, escrow, delivery tracking and supplier ratings for the marketplace (orders are requests; payment is arranged directly).
- Supplier stock sync or bulk catalogue import (products are entered one at a time).
- Usage analytics (time to first estimate, abandonment, conversion, AI cost per assessment): the `ai_usage` table records per-call metadata, but no dashboard exists.
- A distributed rate limiter. `lib/rate-limit.ts` is still in-memory (single instance).
- Guest-draft cleanup runs opportunistically on save; there is no scheduled job.

## Next actions

1. Set an AI key in a staging environment, and review Filipino explanations and quote summaries with native speakers.
2. Ask installers to fill in the new equipment fields; consider making panel and inverter models required once adoption is clear.
3. Recruit two or three real distributors to replace the demo listings, and decide the supplier verification checklist (DTI/SEC, BIR, warranty authorization letters).
4. Build an analytics view on `ai_usage`, `guest_drafts` and `lead_status_events` to establish baseline funnel metrics.
