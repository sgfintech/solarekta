# SOLARekta

AI-assisted Philippine solar assessment and verified installer quotation marketplace.

SOLARekta helps homeowners and small businesses turn a real electricity bill into a transparent,
versioned solar estimate, then request structured quotes from installers whose business documents
have been manually reviewed. AI is optional and only extracts bill fields or rewrites an explanation;
it never decides prices, production, savings or verification.

> **Status:** pilot-ready local MVP. It is suitable for a controlled demo or small pilot after the
> deployment checklist below is completed. It is not yet a hardened multi-tenant production service.

## What is implemented

**Customer**
- Sign up, log in, consent to bill processing, terms and privacy.
- Create and edit sites (location, property type, roof, daytime usage, budget).
- Upload a bill privately (PDF/JPG/PNG/WEBP, 8 MB limit) or enter values manually.
- Review and correct extracted values before confirming.
- Run a deterministic low/base/high solar assessment with a 25-year cashflow, assumptions, sources
  and warnings.
- Request quotes from selected verified installers, with opt-in contact sharing.
- Compare quotes side by side on price, capacity, production, warranty, timeline, exclusions and
  normalised payback.
- Notification inbox, consent history, profile/password settings, self-service JSON export and
  deletion/export requests.
- Print-friendly assessment and comparison pages.

**Installer**
- Business onboarding with service areas and verification documents.
- Manual admin verification required before quoting.
- Lead inbox, assessment snapshot, contact details only when the customer opted in.
- Itemised quote submission and revision; declined-lead and pipeline states.

**Admin**
- Installer verification queue with documents, history and decisions.
- Quote moderation and withdrawal with an audit note.
- Data export/deletion requests.
- Audit log and funnel overview.

**Platform**
- SQLite schema with ownership columns, lifecycle checks, foreign keys and indexes.
- Server-side role and ownership checks on every customer/installer/admin query and action.
- Scrypt password hashing, DB-backed sessions, httpOnly/SameSite cookies.
- Private upload storage outside the web root, served through an authenticated route.
- Append-only audit events with sensitive keys redacted.
- Optional, schema-validated AI adapter with deterministic fallback.
- Versioned solar model (`solar-ph-2026.1`) with golden, sensitivity and validation tests.
- 72 automated tests covering the engine, quote metrics, validation, schema constraints,
  access isolation, password hashing and rate limiting.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Turbopack, Server Actions) |
| UI | React 19, Tailwind CSS 4, custom accessible components |
| Language | TypeScript (strict) |
| Database | SQLite via `better-sqlite3` (raw SQL, no ORM) |
| Validation | Zod 4 |
| Tests | Vitest |
| Auth | Scrypt + database sessions + httpOnly cookie |

## Quickstart

Requires Node 22 or newer (verified on Node 24).

```powershell
npm install
Copy-Item .env.example .env.local   # optional; defaults work with no env file
npm run db:setup
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The app creates `var/solarekta.db` automatically on first use, but
running `db:setup` makes the state explicit.

### Demo accounts

All demo accounts use the password **`Solarekta2026!`**.

| Email | Role | Notes |
|---|---|---|
| `customer@solarekta.ph` | Customer | Two sites, assessments, one matched quote request with two quotes |
| `installer1@solarekta.ph` | Installer | Verified — Bayanihan Solar Energy |
| `installer2@solarekta.ph` | Installer | Verified — Liwanag Solar Solutions |
| `installer3@solarekta.ph` | Installer | Pending review — Sierra Solar Trading |
| `admin@solarekta.ph` | Admin | Verification queue, moderation, data requests, audit |

All seeded names, businesses, documents and bills are synthetic. The demo PDFs explicitly say they
are placeholders and contain no real licence, permit or personal data.

### Useful routes

- `/` marketing site, `/how-it-works`, `/installers`, `/safety`, `/privacy`, `/terms`
- `/signup`, `/login`
- `/app` customer dashboard; `/app/sites`, `/app/quotes`, `/app/settings`
- `/installer` installer pipeline; `/installer/leads`, `/installer/profile`
- `/admin` operations; `/admin/installers`, `/admin/quotes`, `/admin/data-requests`, `/admin/audit`
- `/api/me/export` self-service JSON export
- `/api/files/[id]` authenticated private file delivery

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest suite |
| `npm run check` | Typecheck + lint + tests |
| `npm run db:setup` | Create the SQLite schema |
| `npm run db:reset` | Delete and recreate the database |
| `npm run db:seed` | Replace synthetic demo data |

Environment variables are documented in `.env.example`. AI is disabled unless
`AI_PROVIDER=openai` and `OPENAI_API_KEY` are set.

## How the estimate works

1. The confirmed bill supplies monthly kWh and total pesos; the implied tariff is `total ÷ kWh`.
2. A city yield table supplies indicative kWh/kWp/year, with a flagged national-average fallback.
3. Usable roof area is `roof area × 72% × roof-type factor`, divided by `5.5 m²/kWp`.
4. Each scenario sizes to a target share of annual consumption (50%, 70%, 90%), capped by usable roof.
5. Self-consumption is limited by daytime load; net-metering exports are credited at 55% of retail.
6. A 25-year cashflow applies 0.5%/year degradation, 1% maintenance from year 2, a year-12 inverter
   replacement at 12% of capex, tariff escalation and an 8% discount rate.
7. Savings, payback and NPV are scenarios, not guarantees. A licensed installer must verify the site.

Any change to an assumption or formula requires a new model version. Stored assessments keep the
model version and JSON that produced them.

## AI safety

- AI is disabled by default and entirely optional.
- Bill text is treated as untrusted; extraction returns JSON that is validated by a strict Zod schema.
- AI receives no customer identity, uploaded file listing or installers' private documents.
- AI cannot change prices, production, verification status, consent or payments.
- Explanations are constrained to supplied numbers and fall back to a deterministic paragraph.

## Security and privacy notes

- Every query and action re-checks the session role and record ownership server-side.
- Uploads are checked by magic bytes, stored outside the web root under `var/uploads`, and only
  served through `/api/files/[id]` to the owner or an authorised reviewer.
- Passwords are scrypt-hashed with a per-user salt; sessions are hashed tokens in the database.
- Rate limits cover signup, login and uploads (in-memory, single instance).
- Security headers and a restrictive CSP are configured in `next.config.ts`.
- Privacy copy avoids claiming compliance certification. The Philippine Data Privacy Act, consumer
  protection and net-metering/utility rules still require legal review before a public launch.

## Quality gates

```powershell
npm run db:setup
npm run typecheck
npm run lint
npm run test
npm run build
```

## Deployment checklist (before a public pilot)

- [ ] Move `DATABASE_PATH` and `UPLOAD_DIR` to persistent volumes with backups.
- [ ] Set a strong secret-management process; never commit `.env` files.
- [ ] Put the app behind HTTPS; cookies are `secure` in production.
- [ ] Replace in-memory rate limiting with a shared store if running more than one instance.
- [ ] Add malware scanning and retention jobs for uploads.
- [ ] Configure transactional email for verification and quote notifications (currently in-app only).
- [ ] Complete legal review for the privacy notice, terms, installer verification policy and
      net-metering/zero-export claims.
- [ ] Run a manual accessibility and mobile-device pass (see `docs/IMPLEMENTATION_BACKLOG.md`).
- [ ] Decide whether SQLite is acceptable for the pilot or migrate to PostgreSQL first.

## Documentation

- [Repository audit](docs/REPO_AUDIT.md)
- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [System architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Implementation backlog](docs/IMPLEMENTATION_BACKLOG.md)
- [Decisions and open questions](docs/DECISIONS.md)
- [Deployment (Railway / Docker)](docs/DEPLOYMENT.md)

## Non-goals for this MVP

Satellite roof automation, drone surveys, battery dispatch optimisation, IoT integrations,
predictive maintenance, financing marketplace, native mobile apps, nationwide logistics,
automated installer verification and any guarantee of savings or utility approval.
#   s o l a r e k t a  
 