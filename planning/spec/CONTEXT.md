# Product Spec — Empowr Members

**Status:** Approved scope pending review · Created 2026-07-06
**Replaces:** Wix booking/subscription system (empowrcic.wixsite.com/empowrcic — account URLs returning 500s; team decision is rebuild, not repair)

Source of truth for session data: Empowr CIC KB — `entities/sessions.md`, `sources/operations/sessions-booking.md`. ⚠️ Times/dates change; verify schedules with Jasmine before seeding the catalogue.

---

## What We're Building

Members create an account, manage their household (themselves + children), book and pay for sessions, hold monthly memberships, and self-manage bookings, cancellations, credits, and waivers — at **members.empowrcic.org**.

---

## Bookable Offering Types

| Type | Examples | Pricing model | Booking model |
|---|---|---|---|
| **Drop-in** | Skate Jam (£7 online / £10 door), All Ages Roller Disco (£15 incl. hire) | Per session, walk-in surcharge | Book an occurrence |
| **Structured lesson** | Sk8 Skool Kidz (£10), All Ages (£12.50), Adults/SYNKRON8 (£15) | Per session | Book an occurrence |
| **Course** | Beginners Foundations, Outside Pathway L1–L3 (£55/course) | Per course run | Enrol once, covers all weeks |
| **Camp** | Roller Quad Camp (from £45; HAF spaces external) | Per day/block | Book; strictly non-refundable |
| **Event** | Roller Skate Events (early bird £10 / online £15 / door £20) | Tiered by timing | Book an occurrence |

## Memberships

- General membership **from £30/month** — ongoing session access without per-session booking
- Roller Disco membership **£50/month**
- ⚠️ **Open question:** exact entitlements per plan (which session types, how many per week, family plans?) — KB records prices only. Schema models entitlements generically so this doesn't block Phase 1.

## Business Rules (system-enforced)

1. **Payment in advance** secures the place; **cashless only**; walk-ins allowed at a surcharge
2. **Waiver gate** — risk waiver + photography consent required before a participant's first session
3. **Cancellation policy** — 48+ hrs: full refund *or credit*; <48 hrs / no-show: no refund; Empowr cancels: alternative date or full refund. **Camps and Roller Disco: strictly non-refundable** (per-offering policy flag)
4. **Age rules** — per-offering age min/max; under-16s need guardian on site unless drop-off pre-arranged
5. **Kit requirements** — helmet, knee/elbow pads, wrist guards; surfaced on booking confirmation, not enforced by system
6. **Capacity** — per occurrence, with venue defaults
7. **Non-transferable** bookings where flagged (Sk8 Skool Adults, Roller Disco)

## Out of Scope (stays external)

- HAF-funded camp places — remain on app.holidayactivities.com (link out)
- Corporate / birthday party bookings — enquiry form → email, not self-serve (Phase 3 candidate)
- Find-your-session quiz — stays at start.empowrcic.org/quiz

---

## Build Phases

> Execution plans (ordered steps, done-when criteria) live in [planning/phases/](../phases/CONTEXT.md). This section defines *what* each phase covers; the phase files define *how*.

### Phase 0 — Foundation
MWP scaffold ✅ (2026-07-06) · brand assets (/init-brand) · GitHub repo + parent-repo .gitignore entry · Supabase migration 1 (`mem_` schema + RLS + helper fn) · Supabase Auth config (magic link + password, Resend SMTP) · Netlify site + members.empowrcic.org DNS

### Phase 1 — MVP: accounts + booking (the Wix replacement)
**Done when:** a member can book and pay for any current session for themselves or their child.

- Auth flows: sign up, sign in, account page
- Household: add/edit participants (children), emergency contact, DOB-driven age eligibility
- Session catalogue: offerings list + occurrence calendar (admin-seeded from KB sessions data, schedule verified with Jasmine)
- Booking flow: pick occurrence → pick participant(s) → optionally add several one-off/course bookings to a device-local basket → waiver/capacity gates → one itemised Stripe Checkout → confirmation email (kit list + venue + cancellation policy)
- Course enrolment (per_run bookings — one payment covers the run)
- My Bookings: upcoming/past, self-serve cancellation enforcing the 48-hour policy (refund or credit; blocked for non-refundable offerings)
- Admin (allowlist-gated per `_config/guides/auth-middleware.md`): manage offerings/occurrences/venues, view register per occurrence, cancel an occurrence (notify + refund/credit all bookings)
- Gate: /pre-deploy-security + /netlify-supabase-check before go-live

### Phase 2 — Memberships
- Plans + Stripe Billing subscription checkout + Customer Portal (cancel/update card)
- Stripe webhooks: subscription lifecycle → membership status
- Member booking path: active entitlement covers the session → zero-payment booking (still capacity-counted)
- Credits redemption at checkout (part-pay with credit balance)
- **Blocked until entitlements confirmed with Jasmine/Shaun**

### Phase 3 — Operations
- Check-in view (coach/marshal marks attended/no-show on a phone)
- Walk-in capture at the door (surcharge price via payment link)
- Waitlists on full occurrences
- Reporting: attendance/revenue per offering (feeds CIC 34 impact figures)
- Corporate/party enquiry form

### Phase 4 — Cutover & Wix decommission
1. Export remaining customer/booking data from Wix
2. Set `membersUrl` in Main Site `links.ts`; merge parked branch `feat/my-account-nav` (Main Site)
3. Merge parked branch `feat/members-account-notice` (EELA); point all EELA/Landing Page booking CTAs at Members
4. Update KB: `entities/sessions.md` Booking + Membership sections; retire Wix URLs
5. Update registries via /update-registry
6. Wix site → redirect or shut down

---

## Risks & Open Questions

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | Membership entitlements per plan (sessions/week? family plans? which types?) | Jasmine/Shaun | Phase 2 build |
| 2 | Wix data export — what customer/booking history is recoverable? | Shaun | Phase 4 (nice-to-have) |
| 3 | ~~Waiver linking mechanism~~ **RESOLVED 2026-07-08 (provisional):** email+name match at booking, admin manual-link fallback — see ADR | — | — |
| 4 | ~~Stripe account~~ **RESOLVED 2026-07-08:** the shared **Empowr CIC Stripe account** (currently only used by Heroes — it is the org's account, not a Heroes-specific one). Members gets its own API keys + webhook secret in that account at Step 5 (`MEMBERS_STRIPE_*`); Heroes' keys untouched | — | — |
| 5 | ~~Child data (DOB + medical notes = sensitive): retention policy + privacy policy update (LegalHub)~~ **RESOLVED 2026-07-29:** org privacy policy (v1.2, updated 2026-07-28) already covers programme-booking data incl. DOB and health/accessibility info under a "Programme Bookings" section with its own retention table — no Members-specific policy content was needed. Wired the existing published policy into the site via the same `/legal/:slug` → LegalHub `share` proxy pattern Main Site uses; footer now links Privacy Policy, T&Cs, Risk Waiver | — | — |
| 6 | ~~Session schedule accuracy — verify with Jasmine before catalogue seeding~~ **NARROWED 2026-07-30:** schedule/venue/price/duration data is already derivable from the Empowr CIC KB (`entities/sessions.md`, `sources/operations/sessions-booking.md`) — confirmed stable 3+ years, and courses are confirmed migrating fully to Members (full Wix exit), so the only real remaining gap is **capacity/attendee limits per session**, which appears nowhere in the KB. Needed from Jasmine/Shaun before seeding — a physical/safeguarding fact, not something to infer | Jasmine/Shaun (capacity only) | Phase 1 seeding |
