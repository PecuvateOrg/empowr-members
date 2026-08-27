# Empowr Members — Context (Layer 1)

## What This Project Does

Empowr Members is the transactional platform for Empowr CIC participants: account creation, household management (parents + children), session booking with payment, monthly memberships, credits, and self-serve cancellation. It replaces the legacy Wix booking/subscription system (empowrcic.wixsite.com — account URLs broken; rebuild decided over repair). Planned domain: **members.empowrcic.org**.

For Empowr CIC's identity, mission, programmes, and session details — read the KB, do not embed here:
`F:\Projects\Knowledge Based System\vaults\EMPOWR CIC\KNOWLEDGE BASE\` → `entities/sessions.md`, `entities/eela-programme.md`.

## Workspace Map

| Workspace | Purpose |
|---|---|
| `planning/spec/` | Product spec — scope, offering types, business rules, phases, open questions |
| `planning/architecture/` | System design — stack, data model, Supabase access patterns, Stripe flows |
| `planning/decisions/` | ADR log |
| `src/` | Next.js project root — all application code, config, and migrations; npm commands run from here |
| `ops/` | Netlify deployment, environment variables, build config |

## External Services

| Service | Role | Reference |
|---|---|---|
| Supabase (`empowr-cic`, `qrdlheqnnzpasbnayalm`) | Database + Auth; `mem_` tables; shares project with waiver + EFN tables | `_config/registry/supabase.md` |
| Stripe | One-off payments (Checkout) + per-session Subscriptions (Billing). **Account `acct_1TBhN2CpJGJ55gu5` is SHARED with Empowr Heroes** — legal entity verified 2026-08-26 as Empowr CIC. Stripe fans every event to every endpoint on it, so this app positively identifies its own objects at dispatch. | `planning/architecture/`, `_config/registry/third-party-services.md` |
| Resend | Transactional email (confirmations, cancellations) | — |
| Netlify | Hosting, members.empowrcic.org | `_config/registry/netlify-sites.md` |

## System Boundaries (Empowr estate)

- **EELA** (eela.empowrcic.org) — discovery/marketing layer; its session pages link into Members booking pages. This project fulfils EELA's planned "Phase 2 members backend"; EELA stays content-only.
- **Empowr Waivers** (waiver.empowrcic.org) — waiver capture. Same Supabase project: Members reads `people` / `waiver_responses` directly to gate first bookings.
- **Empowr Main Site** — nav account icon (parked branch `feat/my-account-nav`) activates at cutover.
- **Heroes** — shares the Stripe account only; no data coupling.

## Known Quirks

- The Supabase project is shared — never modify non-`mem_` tables from this project (waiver and EFN tables belong to their own apps)
- Camps and Roller Disco bookings are strictly non-refundable — enforced by a per-offering `refund_policy` flag, not global logic
- HAF-funded camp places stay external (app.holidayactivities.com) — link out, never book natively
- Child participant data (DOB, medical notes) is sensitive — privacy policy update via LegalHub is a launch gate
