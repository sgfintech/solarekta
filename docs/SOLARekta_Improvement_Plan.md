# SOLARekta Product and AI Improvement Plan

Prepared 8 November 2026

## Purpose and recommendation

Make SOLARekta easier for Filipino homeowners and businesses to understand, more attractive to millennials, and useful throughout the solar buying journey. Prioritize a fast first estimate, clear results, and direct provider comparison. Add AI where it reduces effort or improves understanding.

This plan is based on a static source review of the supplied Solarekta.zip. The review did not include a rendered browser inspection, a production security audit, or execution of the build and tests. Findings must be rechecked against the current repository before implementation. Recommendations are proposed work, not implemented capabilities.

## Product direction

SOLARekta should help someone answer three questions: Could solar work for me? What might it cost and save? Which direct offer fits my needs?

Preserve the direct-connect platform direction. The current application mainly connects customers and installers. Show who supplies equipment, who installs it, and who provides each warranty. Do not imply that a direct distributor marketplace already exists. Supplier accounts, equipment ordering, financing, payments, and logistics are separate future scope.

Retain the existing customer, installer, and admin workflows, structured quotes, consent controls, optional AI extraction, deterministic solar calculations, and model version history.

## Findings from the supplied source

| Area | Observed implementation | Improvement |
| --- | --- | --- |
| First use | Main estimate CTA opens signup | Offer a preliminary estimate before account creation |
| Property details | Long form requires usable roof area | Use a short wizard and an explicit unknown-area path |
| Visual system | Brand colors, reusable controls, SVG energy illustration, reduced-motion rules | Extend consistently into forms, results, and quote comparison |
| Results | Three scenarios and advanced financial information appear prominently | Lead with savings, cost, payback, and one next action |
| AI | Bill-image extraction and assessment explanation adapters exist | Improve review, reliability, contextual help, and quote comparison |
| Provider selection | Assessment page retrieves all verified installers | Filter by service area and explain eligibility |
| Terminology | Technical engine language appears in customer copy | Use plain language and expandable methodology |

Relevant source locations include app/(marketing)/page.tsx, app/app/page.tsx, app/app/assessments/[id]/page.tsx, components/forms/site-form.tsx, components/forms/bill-upload-form.tsx, components/forms/assessment-create-form.tsx, components/quote-request-form.tsx, lib/ai/provider.ts, and lib/solar/engine.ts.

## Phase 1 Correctness and reliable foundations

Complete these fixes before prominently promoting savings or adding AI recommendations.

1. Correct the bill offset label. offsetRatio currently represents annual solar production divided by annual electricity consumption. Rename it to an energy-based label such as Solar generation compared with annual use. If displaying bill reduction, derive it from monetary savings and the same baseline spending period, with exclusions explained.
2. Respect roof limits. buildScenario applies a 0.3 kWp minimum after the roof cap. Ensure final capacity never exceeds usable roof capacity. When available space is insufficient, return an actionable result rather than forcing a minimum size.
3. Separate budgets. The property form calls a field Monthly electricity budget while the engine compares the supplied budget against total installation cost. Trace the action mapping, introduce unambiguous fields, and migrate existing values without silently changing their meaning.
4. Correct financial methodology. LCOE currently combines discounted costs with undiscounted production. Select and document a consistent method, add an independently calculated regression case, and bump the model version when formulas change. Preserve stored historical assessments.
5. Improve export assumptions. Net metering is preselected and export credit is approximated at 55 percent of retail. Add Not sure as a user choice; clearly identify assumed export treatment. Support explicit, versioned configuration rather than presenting the approximation as a current utility tariff.
6. Distinguish uncertainty from product choice. Existing conservative, base, and optimistic scenarios change system capacity as well as assumptions. Explain this clearly. For a true uncertainty comparison, hold the selected system size constant and vary uncertain inputs; show alternative sizes separately.
7. Keep backup code out of checks. Review TypeScript, ESLint, and test includes; exclude _backup_pre_redesign without removing historical user files.

Acceptance: roof-boundary regression cases pass; energy and money labels are distinct everywhere; budget units match their use; updated formulas have versioned tests; historical results remain reproducible; net-metering uncertainty is visible before calculation.

## Phase 2 A friendly first estimate

### Proposed journey

| Step | Required experience | Details deferred |
| --- | --- | --- |
| Electricity | Upload a bill or enter kWh and amount | Additional bill history |
| Home or business | City and illustrated daytime usage choices | Full street address and optional property details |
| Preliminary result | Estimated ranges and visible assumptions | Advanced financial metrics |
| Refine and save | Add roof details and create an account | Provider contact details until a quote request |

Allow users to browse and enter manual data before signup. Keep private bill-image processing authenticated in the first release; invite guest users to sign in only when they choose that option. Never place bill files or extracted personal information in browser local storage.

Use a short progress indicator, Back and Continue controls, field-level validation, and recoverable drafts. A guest draft should contain only minimal nonsensitive inputs, expire, and transfer to the authenticated account through an ownership-checked process. Do not rely on a guest-supplied database identifier as proof of ownership.

For unknown roof area, explain that the result has not been checked against available roof space. Use a separately defined preliminary calculation path; never silently fabricate area. Collect area before presenting roof-constrained sizing or requesting a final site-specific proposal.

Replace technical labels: Add a site becomes Add your home or business; Run assessment becomes See my solar estimate; Interconnection setup becomes What happens to extra solar power. Keep precise engineering units available beside short explanations.

Fix province autofill when city selection changes, preserving deliberate manual edits. Add camera-friendly bill selection, image preview, clear size/type feedback, retry, and a manual-entry alternative. The current provider accepts JPG, PNG, and WEBP for extraction; make PDF manual-entry behavior explicit until supported processing is actually implemented.

Acceptance: a new user can obtain a manual preliminary estimate without an account; unknown roof area is supported honestly; Back preserves data; errors identify the field and receive focus; uploaded bills remain private; successful signup does not discard the estimate.

## Phase 3 Visual design and clear results

Use public/logo.png as the primary brand asset, preserving aspect ratio and transparency. Retain the green, warm solar accent, and neutral palette unless browser inspection reveals a concrete readability problem. Consolidate tokens and reusable components instead of creating separate styles per page.

Create an approachable visual language: illustrated roof choices, daytime usage patterns, and a home energy diagram. Use consistent icons and meaningful graphic hierarchy. Avoid unverified customer logos, invented reviews, fictional savings statistics, and decorative charts that resemble live data.

Lead the results screen with estimated monthly savings, installation cost, and payback. Derive monthly equivalents from the annual engine result and label them as averages, not a monthly forecast. Show remaining electricity spending only when the baseline and savings use compatible definitions. Keep advanced metrics and modelling notes in accessible disclosures.

Use a single primary action appropriate to the current state: Complete your roof details, Confirm your bill, or Compare available providers. Replace empty dashboard counters with a next-step checklist for first-time users. Keep full progress available for returning customers.

Motion should communicate upload progress, calculation status, selection, and successful submission. Retain reduced-motion support. Prefer opacity and transform transitions; avoid delayed content, scroll hijacking, and persistent distracting loops.

Acceptance: key routes work at 360, 390, 768, and 1440 CSS pixels; no page-wide horizontal overflow; comparison tables scroll inside their own container when necessary; keyboard focus is visible; form controls have labels and adequate touch areas; contrast is checked; reduced-motion users retain all content and functionality.

## Phase 4 Direct provider matching and comparison

Filter verified providers by normalized service-area data using existing service-area helpers where practical. Match on the server, document city/province coverage rules, and offer a clear no-match state. Avoid brittle substring matching or making unverified providers appear eligible.

Show coverage, specialties, reviewed credentials, and authentic project evidence. Explain exactly what verification checks cover. Add a selection count and enforce the five-provider limit on both client and server. Prevent requests with no eligible provider and reject duplicate or unauthorized submissions safely.

Compare capacity, equipment models, installation inclusions, exclusions, warranties, timeline, and total quoted cost. Add request progress using actual persisted events. Preserve contact-sharing consent and do not expose private bill files or full addresses through matching or AI context.

Acceptance: out-of-area providers are excluded; no-match users receive a useful next action; client and server enforce selection limits; structured quotes remain accessible without AI; contact details are shared only under the existing authorized rules.

## Phase 5 Useful AI features

### Release first

**Guided bill review:** display the document alongside extracted fields, flag missing or implausible values, and require confirmation before calculations. Model-provided confidence is not a calibrated accuracy percentage. Keep manual correction available during outages.

**Personal explanation:** explain the approved assessment using only supplied outputs and approved context. Offer English and Filipino explanations as an explicit preference. Cache by assessment version, locale, prompt version, and provider configuration. Regeneration must not silently alter calculated figures.

### Release next

**Quote comparison assistant:** summarize structured quotes the customer owns. Reference each quote and field behind a claim; distinguish missing information from an unfavorable term. Suggest questions to ask without declaring a guaranteed best installer. Any computed price-per-kWp or difference belongs in deterministic code.

**Contextual assistant:** answer questions about the current assessment and maintained solar guidance. Provide suggested questions such as Why are my savings lower than expected and What should I ask during a site visit. Unsupported questions should receive a clear limitation and practical next step. Scenario changes require validated inputs and an engine rerun.

### Reliability and operating cost

Extend lib/ai/provider.ts rather than introducing duplicate integrations. Keep credentials server-side. Authorize access to each assessment and quote before assembling model context. Minimize personal data, treat document and provider text as untrusted input, enforce input/output limits, and use structured validation for extraction and comparisons.

Add timeouts, bounded retry for transient failures, per-user rate and usage limits, result caching, and usage measurement without raw bill content in logs. Show pending, retry, and unavailable states in plain language. Keep manual entry, calculations, and quote comparison usable when AI is disabled. Do not silently introduce a paid model dependency or change providers without explaining the configuration.

Acceptance: test readable and unreadable bills, null extraction fields, contradictory data, unauthorized context access, prompt injection inside documents, missing quote terms, provider timeout, and AI-disabled mode. Explanations must not introduce unsupported savings, equipment claims, prices, or approvals.

## Delivery sequence and verification

Implement correctness fixes, first-estimate onboarding, results and visual refinement, matching, then AI assistance. Deliver working vertical slices; do not leave decorative controls with no behavior. After each slice, update a checklist with implemented, verified, blocked, and deferred items.

Run the repository typecheck, lint, tests, and production build. Add meaningful regression tests for engine boundaries, guest-to-account ownership, provider eligibility, and AI fallback. Exercise representative customer, installer, and admin flows with seeded nonpersonal data. Inspect mobile and desktop renders with browser tools if available. Record actual commands and results; state any environment limitation honestly.

Before launch, measure time to first estimate, step abandonment, bill correction frequency, estimate-to-quote conversion, provider response time, and AI cost per completed assessment. Establish baseline measurements before setting conversion targets. Collect user feedback without recording private bill contents.

## Deferred work

Defer battery sizing, financing recommendations, automated structural judgments, satellite roof inference, supplier checkout, and payments until the underlying models, data, and operational workflows support them. They must not appear as working capabilities in the redesigned interface.
