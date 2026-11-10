# SOLARekta — Cursor Implementation Kickoff

**Status:** Proposed MVP specification, not an audit of an existing repository  
**Market:** Philippines  
**Model:** Hybrid AI solar advisor + verified installer quotation marketplace; installer SaaS later  
**Primary instruction:** Read this document, inspect the repository, produce an implementation plan, then implement only the approved first milestone.

## 1. Paste this prompt into Cursor Agent

```text
Act as a principal software architect, senior full-stack engineer, product manager, security engineer, and solar-domain systems designer.

PROJECT: SOLARekta — an AI-assisted Philippine solar assessment and installer quotation marketplace.

MISSION
Build an asset-light, mobile-friendly MVP that helps homeowners and small businesses upload electricity bills, receive transparent preliminary solar assessments, request quotes from vetted installers, and compare offers. AI must assist with extraction and explanation; deterministic, auditable calculations must determine energy and financial estimates.

FIRST, AUDIT THE CURRENT REPOSITORY. Do not assume it is empty or that any proposed stack is already installed. Inspect files, package manifests, git status, existing routes, database schemas, tests, deployment configuration, and documentation. Preserve existing code and user changes. Never overwrite .env or commit credentials.

DELIVER BEFORE CODING:
1. docs/REPO_AUDIT.md — existing stack, modules, runnable commands, gaps, risks, and verified facts.
2. docs/PRODUCT_REQUIREMENTS.md — MVP scope, roles, journeys, functional/nonfunctional requirements, acceptance criteria.
3. docs/SYSTEM_ARCHITECTURE.md — diagrams, modules, integrations, security boundaries, data flows, deployment and recovery.
4. docs/DATA_MODEL.md — entities, relations, indexes, tenant/role isolation and migration plan.
5. docs/IMPLEMENTATION_BACKLOG.md — prioritized epics, small tickets, dependencies, estimated complexity, tests and definition of done.
6. docs/DECISIONS.md — assumptions, trade-offs and questions requiring founder approval.

STOP after generating the audit and plan. Summarize findings, show a proposed first sprint, and request approval before introducing dependencies, modifying application code, running destructive migrations, or deploying.

RECOMMENDED STACK (only if repo audit finds no conflicting established architecture): Next.js + TypeScript for customer/installer/admin responsive web, NestJS or existing proven API for backend, PostgreSQL, private object storage, managed authentication, background job queue, and an AI provider behind a configurable adapter. Prefer a modular monolith. Use Flutter only in a later phase if native apps are justified.

CORE MVP CUSTOMER FLOW
- Sign up / log in, consent to bill processing, create site profile (location, ownership, roof type, daytime usage, monthly budget).
- Upload bill securely; AI extracts fields (utility, billing period, kWh, charges) with confidence and source references; customer reviews and corrects values.
- Solar assessment produces low/base/high scenarios with transparent assumptions: location-based solar yield, usable roof area, shading uncertainty, self-consumption, tariffs, fixed charges, net-metering vs zero-export, installation costs, annual degradation, maintenance, and optional financing.
- Explain system sizing, estimated savings, indicative payback, uncertainty and engineering-review requirements. Never guarantee savings or claim a roof is structurally suitable from a photograph alone.
- Request quotes from selected verified installers; compare structured proposals on capacity, equipment, cost, warranty, exclusions, timeline and expected production.
- Track lead status and send notifications; protect customer contact details until consent-based sharing.

CORE MVP INSTALLER FLOW
- Register business and service areas; submit credentials for manual review; admin approval required before receiving leads.
- Receive opted-in qualified leads, request clarification, submit itemized quotations, update status.
- Track basic pipeline and lead outcomes. Lead fees/subscriptions are experiments, not launch dependencies.

CORE MVP ADMIN FLOW
- Verify installers, moderate listings and quotes, review assessment exceptions, manage consent/retention requests, audit activity, handle complaints, and review funnel metrics.

AI SAFETY AND ENGINEERING
- AI is allowed to extract, summarize, converse, and recommend questions. AI is NOT the source of truth for prices, kWh, solar output, net-metering credits, or final engineering design.
- Implement a deterministic solar and finance calculation engine with versioned assumptions, unit tests, sensitivity scenarios, and explicit data-source provenance. Where accurate irradiance/tariff data is unavailable, show a clearly marked indicative estimate or block precise claims.
- Treat uploaded bills and retrieved content as untrusted; defend against prompt injection. Validate all AI outputs against strict schemas. No AI tool may create payments, disclose files, or change installer verification without server-side authorization.
- Make the AI service optional: bill values can be entered manually, and assessments continue if the model API is unavailable.

SECURITY, PRIVACY, COMPLIANCE
- Enforce server-side RBAC and record ownership for customer, installer and admin data. Use private signed file access, encryption, audit logs, rate limits, upload size/type checks, malware scanning where available, and secure secrets management.
- Document compliance review for the Philippine Data Privacy Act, consumer protection, applicable DOE/ERC/net-metering/zero-export rules, and installer qualifications. Do not represent the platform as an engineering certification authority or promise government approval.
- Minimize sensitive data; define consent, retention/deletion, and access logs. Do not send unnecessary personal identifiers to AI providers.

QUALITY GATES
- Typecheck, lint, unit tests, integration tests, and critical end-to-end tests for customer assessment, consent, installer quotation, access isolation, and failure paths.
- Accessibility, mobile performance, loading/error/empty states, and clear Filipino/English copy.
- Seed synthetic demonstration data only; never use real customer bills in fixtures.
- No fake testimonials, savings guarantees, fabricated installer verification or invented regulatory compliance claims.

WORK STYLE
- Small, reviewable commits; no broad rewrites. Explain file changes and how to run tests. Ask for missing API credentials or business rules instead of inventing them.
- After approval, implement Sprint 1 only, with tests and a working local demo. Report what is complete, blocked, and next.
```

## 2. MVP Boundaries

**Build now:** Responsive customer web app, bill upload and manual correction, versioned solar assessment, AI explanation, installer onboarding/verification, quote requests and comparison, admin operations, basic analytics.

**Defer:** Satellite roof automation, drone surveys, battery dispatch optimization, IoT inverter integrations, predictive maintenance, solar financing marketplace, nationwide logistics, native mobile applications, complex subscriptions.

## 3. Suggested Data Entities

- `users`, `roles`, `customer_profiles`, `sites`, `consents`
- `electricity_bills`, `bill_extractions`, `tariff_assumptions`
- `solar_assessments`, `assessment_scenarios`, `model_versions`
- `installers`, `installer_documents`, `service_areas`, `verification_events`
- `quote_requests`, `quote_invites`, `installer_quotes`, `quote_line_items`
- `lead_status_events`, `notifications`, `audit_events`

Each entity needs ownership, timestamps, lifecycle state, and explicit authorization rules. Store bill documents privately; prefer retention limits over indefinite storage.

## 4. Proposed 12-Week Plan

| Weeks | Outcome | Exit criterion |
|---|---|---|
| 1–2 | Discovery, repo audit, architecture, user interviews | Approved PRD and backlog; installer validation underway |
| 3–4 | Auth, site profiles, bill upload, manual extraction | Customer can create a draft assessment without AI |
| 5–6 | Deterministic solar engine, assumptions and scenarios | Golden-case tests pass; calculations are explainable |
| 7–8 | AI extraction/explanations, consent, fallback | Validated extraction and manual correction flow |
| 9–10 | Installer verification, quote workflow, admin | Customer can receive and compare two structured quotes |
| 11–12 | Security review, E2E tests, controlled pilot | No critical auth/privacy issues; pilot dashboard available |

The timeline is conditional on team capacity, solar data access, and regulatory/engineering review.

## 5. Pilot Validation Targets (hypotheses, not forecasts)

- 20 homeowner and 10 installer discovery interviews.
- 50 completed solar assessments; 20 qualified quote requests.
- 5 active verified pilot installers; at least 2 willing to pay for qualified leads or software.
- Track assessment-to-quote conversion, quote response time, installer close rate, customer satisfaction, cost per qualified lead, and gross margin.

## 6. Cursor Startup Instructions (Windows PowerShell)

From the project root:

```powershell
cd 'D:\All Apps\SOLARekta'  # Adjust to your actual folder name
code .
```

Create `docs` if needed and save this file as `docs/SOLARekta_CURSOR_IMPLEMENTATION_PROMPT.md`. Open Cursor Agent, paste the prompt in Section 1, and instruct it to use this file as the source of truth for the initial planning pass. Do not assume any files or code have been created by Cursor until it reports and verifies them.

## 7. Approval Gate

Before Cursor begins coding, review: current repo audit, proposed stack, solar model data sources, Philippine utility/tariff assumptions, installer verification criteria, privacy approach, sprint tickets, and the first runnable demo milestone.
