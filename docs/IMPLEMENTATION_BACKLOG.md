# Implementation Backlog — SOLARekta

Prioritised for a controlled pilot. Complexity is relative: **S** ≈ hours, **M** ≈ 1–3 days,
**L** ≈ 1–2 weeks. Completed MVP work is marked `[x]`.

## P0 — Launch blockers

### Epic A: Legal, privacy and trust copy
- [ ] A1 **Legal review of privacy notice, terms and consent** (M). Dependencies: founder, Philippine
  counsel. Test: written sign-off; copy matches actual retention. DoD: no uncertified compliance claim.
- [ ] A2 **Installer verification policy** (S). Define accepted documents, expiry, reverification,
  rejection/suspension reasons. Test: admin uses policy on a mock application. DoD: published internal SOP.
- [ ] A3 **Net-metering/zero-export language review** (S). Dependencies: A1. Test: no invented utility
  rule or approval claim. DoD: wording approved; model sources labelled indicative.

### Epic B: Production infrastructure
- [ ] B1 **PostgreSQL migration** (L). Depends on DATA_MODEL plan. Test: integration suite runs on
  Postgres; ownership isolation unchanged. DoD: cutover script + rollback.
- [ ] B2 **Private object storage + signed URLs** (M). Test: unauthorised URL fails; bill not public.
- [ ] B3 **Shared rate limiting** (S). Redis/platform store. Test: two instances share a bucket.
- [ ] B4 **Upload malware scanning + retention job** (M). Test: EICAR fixture quarantined; aged file purged.
- [ ] B5 **Backups and restore drill** (S). Test: restore to a clean environment and log in.
- [ ] B6 **Transactional email** (M). Verification decision, quote received, data request. Test: provider
  sandbox; no bill contents in email.

### Epic C: Security verification
- [ ] C1 **Manual penetration checklist** (M): auth, IDOR, file access, CSRF/origin, upload abuse,
  rate limits, open redirect, XSS in notes. DoD: findings triaged, no critical/high open.
- [ ] C2 **Session hygiene** (S): cleanup expired sessions; optional “log out everywhere”.
- [ ] C3 **Password reset + email verification** (M). Depends on B6. Test: token expiry and single use.
- [ ] C4 **Admin account management** (S): suspend/reactivate users with audit trail.

### Epic D: Accessibility and device QA
- [ ] D1 **Keyboard/screen-reader pass** (M): NVDA or VoiceOver on signup, site, bill, assessment,
  quotes, admin queue. DoD: documented results; blockers fixed.
- [ ] D2 **Mobile device pass** (S): iOS Safari + Android Chrome; tables, forms, focus, zoom, print.
- [ ] D3 **Automated axe/Lighthouse check** (S): add to CI or record manual baseline.
- [ ] D4 **Contrast and focus audit** (S): verify all badge/button/disabled states meet WCAG 2.2 AA.

## P1 — Pilot quality

### Epic E: Customer experience
- [ ] E1 **Assessment comparison across versions** (M): show what changed when a site/bill is updated.
- [ ] E2 **Guided bill correction** (S): highlight low-confidence AI fields; clearer manual fallback.
- [ ] E3 **Quote expiry enforcement** (S): expire `valid_until`; notify customer/installer.
- [ ] E4 **Export includes all personal data** (S): verify JSON export fields and document format.
- [ ] E5 **Deletion UX** (S): explain anonymisation vs full erasure and expected timeline.
- [ ] E6 **Empty/error state review** (S): every list and failure path has a next action.

### Epic F: Installer experience
- [ ] F1 **Lead filters and pagination** (S): city, status, quote state.
- [ ] F2 **Quote templates** (M): reuse line items across leads without auto-pricing.
- [ ] F3 **Clarification thread** (M): structured Q&A without exposing contact details.
- [ ] F4 **Document expiry reminders** (S): notify installer/admin before insurance/permit expiry.
- [ ] F5 **Pipeline outcome capture** (S): won/lost reason for pilot metrics, no fake close data.

### Epic G: Admin operations
- [ ] G1 **Audit filters and pagination** (S): actor, action, entity, date range.
- [ ] G2 **Complaint/appeal workflow** (M): report a quote or installer; resolution notes.
- [ ] G3 **Funnel dashboard definitions** (S): document each metric and SQL source; no invented numbers.
- [ ] G4 **Data-request SLA view** (S): age, assignee, due date.
- [ ] G5 **Bulk-safe deletion job** (M): retryable, logs each step, preserves audit.

## P2 — Scale and differentiation

- [ ] H1 Validate city yield table against PVGIS/SARAH and publish provenance (M).
- [ ] H2 Sensitivity sliders for tariff, shading, self-consumption (M) — display-only, same engine.
- [ ] H3 Optional financing calculator behind explicit assumptions (L).
- [ ] H4 Installer SaaS subscription/lead fees (L) — only after pilot willingness-to-pay evidence.
- [ ] H5 Native app evaluation (L) — only if device data justifies it.
- [ ] H6 Observability: structured logs, error tracking, metrics, alerts (M).
- [ ] H7 Internationalisation (Filipino/English) (M).

## Test plan by epic

| Area | Automated now | Add next |
|---|---|---|
| Solar engine | Golden, sensitivity, validation (Vitest) | Property-based invariants; version-diff snapshot |
| Finance comparison | Unit tests | Rounding/property tests |
| Access isolation | Sites, bills, assessments, requests, leads, notifications | Route-handler file access tests |
| Schema | Checks, FKs, cascade, uniqueness | Migration tests on Postgres |
| Auth | Password hashing, rate limit | Session expiry, reset token, CSRF |
| Journeys | Manual demo through seed | Playwright customer/installer/admin E2E |
| UI quality | Build/lint | axe, visual regression, mobile matrix |

## Definition of done (every ticket)

1. Server-side authorisation and validation covered.
2. Unit or integration test added where logic changed.
3. Empty/loading/error state considered.
4. Copy contains no guarantee, invented verification or regulatory claim.
5. `npm run check` and `npm run build` pass.
6. Audit event added for security-relevant mutations.
