# SOLARekta design system — MASTER

This is the source of truth for SOLARekta's UI. Page-specific overrides go in `pages/<page>.md`.
The tokens live in `app/globals.css` (`@theme`); this file explains how to use them.

**Direction.** This follows the *Sustainable Energy / Climate Tech* profile (ui-ux-pro-max product match): an organic, paper-like feel built from earth green, sun yellow and sky, and an "interactive demo + data" landing. It is an evidence-first tool for Philippine homeowners, installers and suppliers. It should be calm, clear and trustworthy, never salesy.

## Colour (semantic use)

| Token | Use |
|---|---|
| `paper` / `paper-deep` | Page and section backgrounds |
| `card` (#fff) + `line` | Surfaces and borders |
| `ink` / `ink-soft` / `muted` | Text: primary / body / secondary (all ≥ 4.5:1 on paper and white) |
| `forest` / `forest-deep` | Primary actions, links, headings |
| `mint` | Selected states, success, info highlights |
| `sun` | One accent per view (primary CTA on dark, counts), never text on white |
| `clay` | Destructive actions and errors |

Feedback banners: use `.alert-error`, `.alert-warn` and `.alert-success`. Don't hand-write hex colours. Error banners get focus automatically when they appear (`components/focus-on-alert.tsx`).

## Typography
- System UI stack (Segoe UI Variable / SF / Roboto). Body is 16px with 1.6 line height. Nothing goes below 12px, chart labels included.
- Headings: `display-lg`, `display-md`, `display-sm` with balanced wrapping. Use one `h1` per page and don't skip levels (use an `sr-only` heading if a grid needs a parent heading).
- Numbers use tabular figures (applied to `td`/`th`, or add `.tabular`). Money is formatted as `₱` with `en-PH` grouping.

## Layout and spacing
- Mobile first. Breakpoints: `sm` 640, `md` 768, `lg` 1024 (the dashboard sidebar and the public desktop nav both switch here), `xl` 1280.
- `.shell` sets page width. Cards use `card card-pad` with a 1.25rem radius. Controls use a 0.75rem radius; pills and buttons use the full pill radius.
- No horizontal page scroll at any width. Wide tables go in `.table-scroll` with `tabIndex={0} role="region" aria-label=…`, which makes them keyboard-scrollable and adds edge shadows.
- Fixed elements reserve space: dashboard `main` has `pb-28` on mobile for the bottom bar, and the safe-area inset is honoured (`viewportFit: cover`).

## Interaction
- Targets: buttons are at least 44px tall (`.btn`, `.btn-sm` ≥ 40px). Text actions use `.link-action` (28px on pointer devices, 44px on touch). Back links use `.back-link`. Checkboxes and radios are 20px or larger, with a clickable label.
- Every control has a visible focus ring (`:focus-visible`, 2.5px forest). Never remove it.
- Motion: 140ms for micro interactions, 240ms for state changes, 520ms for reveals, all ease-out. Every animation respects `prefers-reduced-motion`.
- Forms keep typed values after a server error (use `ActionForm`, or `PreservingForm` with `SubmitButton`). Labels are always visible. Show the error next to the field and in the focused banner. Messages are plain language (`friendlyIssue` rewrites library defaults).

## Navigation
- Public header: How it works · Equipment · Installers · Suppliers · Ask Solar AI. Below 1024px these move into the menu.
- Dashboards: a sidebar grouped by job (e.g. Solar / Equipment / Account), with an unread count on Notifications. On phones there's a bottom bar with the four most-used destinations (`NAV[...].primary`).
- Ask Solar AI opens inside the buyer's or installer's dashboard (`/app/advisor`, `/installer/advisor`); guests use `/advisor`.

## Content rules (product-specific)
- No fictional metrics, reviews, testimonials or certifications. Demo content is labelled "Sample data" or "Demo listing".
- Prices always show their source, date checked and what they cover. Estimates are labelled as ranges, not promises.
- Icons are inline SVGs with a 1.6 stroke (`components/icons.tsx`, `components/dashboard-icons.tsx`). No emoji. Icons are `aria-hidden`, and icon-only buttons need an `aria-label`.

## Pre-delivery checks
`axe-core` (WCAG 2.2 AA + best practice) is clean on all audited pages at 390 and 1440 px. There's no horizontal overflow, no text under 12px, and no console errors. Re-run the audit after significant UI changes.
