# Repository Audit — SOLARekta MVP

**Audit date:** 8 November 2026  
**Auditor:** implementation pass against `SOLARekta_CURSOR_IMPLEMENTATION_PROMPT.md`  
**Verdict:** A complete pilot-ready MVP monolith now exists in this directory. It has not been
deployed publicly, legally reviewed or load-tested.

## 1. Starting state

The repository began as a folder containing only the implementation brief
(`SOLARekta_CURSOR_IMPLEMENTATION_PROMPT.md`). There was:

- no `package.json`, lockfile, source tree, database, test suite or documentation;
- no git repository or commit history;
- no environment file, secrets or deployment configuration.

Therefore the “audit current repository” instruction was satisfied by recording an empty baseline
rather than by preserving an existing stack. No user code was overwritten.

## 2. Verified environment

| Item | Verified value |
|---|---|
| OS shell | Windows PowerShell |
| Node.js | v24.16.0 |
| npm | 11.6.2 |
| Next.js | 16.4.5 (Turbopack build) |
| React | 19.3.1 |
| TypeScript | strict, `tsc --noEmit` passes |
| SQLite driver | better-sqlite3 13.x |
| Tests | Vitest 5.x — 72 tests in 7 files pass |

Commands run successfully: `npm install`, `npm run db:setup`, `npm run db:seed`,
`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

## 3. What exists now

```
app/                 App Router pages, route handlers and server actions
components/          Marketing, dashboard, forms, admin/installer controls
lib/                 Auth, data access, solar engine, AI adapter, validation, files
db/schema.sql        21-table SQLite schema
scripts/             db-setup.mjs, seed.ts
tests/               Engine, finance, validation, schema, access isolation, security tests
docs/                This audit, PRD, architecture, data model, backlog, decisions
```

### Functional surface

- Public marketing pages, installer directory, auth pages.
- Customer site → bill → assessment → quote request → quote comparison journey.
- Installer onboarding → manual verification → lead → itemised quote journey.
- Admin verification, quote moderation, data-request handling and audit log.
- Private file delivery and self-service data export.
- Optional AI extraction/explanation with deterministic fallback.

### Not present

No payment processing, transactional email, SMS, background jobs, object storage, malware scanner,
search, analytics vendor, feature flags, multi-factor authentication, OAuth, or native apps.

## 4. Architecture facts

- Modular monolith: one Next.js process serves UI, server actions and two route handlers.
- SQLite in WAL mode at `var/solarekta.db`; schema auto-created on first import.
- Uploads at `var/uploads`, outside the public web root.
- No ORM. Hand-written SQL is centralised in `lib/data.ts` and page/action queries.
- Server Actions handle mutations; Next.js provides origin checks for them.
- Session token is a random 32-byte value; only its SHA-256 is stored in `sessions`.
- Password hashes use scrypt with a random 16-byte salt and 64-byte derived key.

## 5. Quality evidence

| Gate | Result |
|---|---|
| Typecheck | Pass |
| Lint | Pass |
| Unit/integration tests | 72 pass |
| Production build | Pass, 33 routes generated |
| Golden solar case | Pass with fixed expected values |
| Access isolation | Pass for sites, bills, assessments, quote requests, leads and notifications |
| Schema constraints | Role/status checks, unique email, FKs and cascades verified |

## 6. Risks and gaps

### High priority before a public launch

1. **Legal/compliance review is outstanding.** Privacy notice, terms, consent language, installer
   verification criteria and net-metering statements need Philippine counsel review. The product
   must not imply DOE/ERC approval, engineering certification or guaranteed savings.
2. **SQLite and local uploads are single-instance.** They are acceptable for a demo or small pilot
   but not for horizontal scaling or durable production storage.
3. **Verification is a manual policy, not a guarantee.** The UI says documents were reviewed; it
   must never say workmanship, pricing or savings are verified. Admin policy must define acceptable
   documents, expiry and reverification.
4. **No malware scanning or upload retention job.** File type/size checks exist, but production
   needs scanning and scheduled deletion.
5. **No email delivery.** Notifications are in-app only. Verification decisions and quote events
   need transactional email before real users rely on them.
6. **Rate limiting is in-memory.** Restart clears it and multiple instances do not share buckets.
7. **Accessibility and real-device QA are not yet evidenced.** The UI uses semantic landmarks,
   labels, focus styles and skip links, but no screen-reader or mobile-device audit has been
   recorded.

### Medium priority

- No password reset flow, email verification or MFA.
- No admin user-management screen (suspend/reactivate accounts) beyond data-request handling.
- No structured complaint/appeal workflow.
- No quote expiry job; `valid_until` is displayed but not enforced.
- No pagination on audit or lead lists (fine at pilot volume).
- SQLite money is stored as REAL in whole pesos; production should use integer centavos or
  `numeric(14,2)` in PostgreSQL.
- The city yield table is a rounded planning table and must be validated against an engineering
  source before precise production claims.

### Low priority

- No automated visual regression or E2E browser suite.
- No OpenTelemetry/metrics/error tracking integration.
- No data-retention scheduler; requests are manually completed by an admin.
- No internationalisation framework; copy is English with light Filipino warmth.

## 7. Recommendation

Proceed to a controlled pilot **after** completing the deployment checklist in `README.md`, the
legal review, and a manual accessibility/mobile pass. Use PostgreSQL and object storage before
opening signups beyond a small invited cohort.
