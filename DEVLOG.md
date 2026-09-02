# DEVLOG — Empowr Members

## 2026-09-02 (session 9) — Review of today's own work found three defects, all already deployed; the worst would have killed the nightly sweep on its first line

Asked to look over the day's work. Three real defects in code I wrote and shipped today. **None had caused damage yet** — the nightly job had not yet had a scheduled run, and there are still no real subscribers — but all three were live.

- **🔴 THE NIGHTLY SWEEP WOULD HAVE THROWN ON IMPORT, EVERY NIGHT, FOREVER.** `netlify/functions/materialize-member-bookings.ts` imported `lib/materialize-member-bookings.ts`, which carried `import "server-only"`. That package is **not a lint marker — it is a module that throws**: its exports map is `{"react-server": "./empty.js", "default": "./index.js"}` and `index.js` is a bare `throw`. Next.js server components resolve the `react-server` condition and get the no-op; an esbuild-bundled Netlify function sets no such condition, takes the default, and dies on its first line. Phase 2 Step 4's entire safety net — the only thing that catches an occurrence added to a slot after someone subscribed — was dead on arrival at 03:15 UTC.
  - **Every gate we have passed it.** `tsc --noEmit` passed, `next build` passed, and the Netlify deploy reported "2 functions + 1 edge function deployed successfully" — because none of them bundle or invoke a Netlify function. The failure only exists at invocation.
  - **PROVEN BOTH WAYS, not reasoned about.** Bundled the old shape with esbuild (`--platform=node`) and imported it: `THROWS ON IMPORT -> This module cannot be imported from a Client Component module`. Bundled the fixed shape: imports fine.
  - **I copied PecuvateDashboard's scheduled-function pattern without checking the one thing that differed** — its `nightly-inventory-background.ts` imports `@/lib/secrets/inventory`, which carries no `server-only` guard. Mine did.
  - **Fixed by injecting the client**: `lib/materialize-member-bookings.ts` now takes a `SupabaseClient` parameter and carries no guard; the webhook passes `createServiceClient()`, the Netlify function builds its own from `@supabase/supabase-js`. `lib/supabase/service.ts` **keeps** its guard — it holds the service-role key, and that guard is correct. Same shape as `lib/slot-matching.ts` and `lib/catalogue-read.ts`, which are deliberately guard-free so they run outside Next.
  - **New `verify:scheduled` (3/3) walks the real import graph** from every `netlify/functions/*.ts` through relative and `@/` imports and asserts nothing reachable carries the guard — plus a third test asserting the reconciliation module IS still reachable, so the guard test can't pass vacuously by the import being dropped. **Proven to fail by reintroducing the exact line**, then reverted.

- **🔴 AN EARLY CHECK-IN WOULD HAVE DUPLICATED A SUBSCRIBER'S BOOKING.** The existence check read `source='member' AND status='confirmed'`. But `uniq_mem_booking_participant_occurrence` only covers `status in ('pending_payment','confirmed')` — so the moment staff mark a subscriber attended (and `/admin/checkin` has **no time guard**, staff check people in before a session starts), that row leaves both the query's reach *and* the index's. The next nightly sweep would see an entitled occurrence with no matching row and insert a **second** one, which the index would not reject. Result: the person listed twice on the door register and counted twice against capacity.
  - Fixed by splitting one read into two sets that were being conflated: `occupied` (any live booking, **any source**, including `attended` — nothing may be created against these) and `ownedFuture` (`source='member' AND status='confirmed'` — the only set that may be cancelled). The any-source half also fixes a second case: a subscriber who had already paid for a session no longer ends up holding two rows for it.
  - Both cancel paths additionally gained `.eq("source","member")` as belt-and-braces — even with a wrong id set, this can now never cancel somebody's paid booking.

- **⚠️ THE WALK-IN EXCLUSION WAS DOCUMENTED BUT NOT IMPLEMENTED.** I told the user, the DEVLOG and `guides/contact-routing.md` that the staff alert does not fire for walk-ins. It did. `POST /api/admin/walk-ins` is explicitly "an ADMIN ENTRY POINT ONTO THE EXISTING PIPELINE" — same `mem_hold_bookings()`, same Stripe Checkout — so the same `checkout.session.completed` lands in the webhook and runs the same `sendBookingConfirmationForSession()`. **I asserted a behaviour I had never checked**, in three places. Now actually implemented (`source` added to the select, alert skipped when the rows are `walk_in`), which makes the existing docs true rather than needing them rewritten.

- **🔑 The pattern across all three: I verified what the tools could see and asserted the rest.** The build was green each time, and the build could not see any of these. The two that mattered were only provable by running the thing — bundling the function, and reading the index predicate against the check-in route's lack of a time guard.

`tsc --noEmit`, `next build`, and all seven verify suites (61 tests) pass.

## 2026-09-02 (session 8) — Beginners Foundation cap dropped to 16; the staff alert was under-scoped — "bookings/subs" meant subscriptions too

- **Beginners Foundation capacity 25 → 16, all 14 course runs** (both Level 1 - Tuesdays and Level 2 - Wednesdays), via the Management API directly against `mem_course_runs` — a data change, not a migration, and confirmed to need neither: `listCourseRuns()` doesn't select `capacity` and the public capacity RPC reads it live, uncached, so the change is already visible with no redeploy. Verified via the anon-key RPC post-update (`capacity: 16, booked: 0`).
- **The staff booking alert (session 6) was under-scoped against the original ask.** Asked directly what "bookings/subs" meant, re-read the original request literally, and concluded "subs" meant Subscriptions, not shorthand for "bookings" generally — the alert only fired for one-off paid bookings. Added a second, separate alert (`lib/emails/staff-subscription-alert.ts` + `sendStaffSubscriptionAlert()`) for a genuinely new Subscription — one per subscribe event.
- **The replay-safety problem a booking alert doesn't have.** `sendBookingConfirmationForSession` gets replay-safety for free — the `UPDATE ... WHERE status='pending_payment'` naturally returns no rows on a Stripe webhook retry. `mem_memberships`' upsert (`onConflict: stripe_subscription_id`) has no equivalent signal — it can't say whether it inserted or updated. Fixed by checking for an existing row BEFORE the upsert, only on `customer.subscription.created` (the only event type where "new" is a meaningful question); a retry of the same `created` event now correctly sends nothing a second time.
- **Deliberately still excludes Phase 2 Step 4 materialisation** — the reasoning from session 6 stands: one subscribe can create dozens of future occurrence rows in one reconciliation pass, and this alert answers "did someone subscribe", not "which occurrences did the subscriber get slotted into".
- `guides/contact-routing.md` updated: `bookings@empowrcic.org` now documented as two alert types, not one.
- `tsc --noEmit`, `next build`, `verify:subscriptions` (25/25) pass. **Not yet verified live** — same open gate as the booking alert and Step 3: needs a real subscription to actually exercise the replay-guard and the email content.

## 2026-09-02 (session 7) — Home page still said "coming soon" 6 days after launch; WhatsApp opt-in replaced with the mailing list

- **The home page (`app/(public)/page.tsx`) was untouched since 2026-07-09** — written during Phase 1 auth scaffolding, before a single session existed to book. Two things it said were correct then and wrong since 2026-08-27: the tagline read "...coming soon", and the primary CTA sent visitors OUT to EELA. Both fixed — copy dropped "coming soon", and "Explore our sessions" now links to this app's own `/sessions` instead. **EELA already links INTO Members for booking** (`members.empowrcic.org/sessions/...`, confirmed in EELA's own `lib/links.ts`), so the old CTA had the traffic direction backwards on top of being stale.
- **`ProfileForm`'s "Keep me updated on WhatsApp" checkbox (`mem_accounts.whatsapp_opt_in`) replaced with the same Brevo mailing-list link the disco/camp landing pages use.** The checkbox opted members into a channel this app never actually sent anything through — Phase 3's own scope note says WhatsApp "stays the existing community group," never app-sent messages, so the column was write-only. Removed from `profileSchema` and the form (not the DB column itself — reversible, and dropping a live column wasn't asked for). Matches `DatesComingSoon`'s existing principle: Brevo owns the subscription and its double opt-in, so nothing in this app touches an address.
- `tsc --noEmit`, `next build`, and all six verify suites (58 tests) pass. **Committed and pushed** as `ed9ed58` (deploy `ready`).

## 2026-09-02 (session 6) — Public capacity counters (fleet-wide gap, not just Beginners Foundation) + the queued staff booking alert built

- **Reported as "Beginners Foundation has no capacity counter" — turned out to be a fleet-wide gap.** No offering, per_occurrence or per_run, showed a places-booked/places-left counter anywhere on the public site; capacity was admin-only (`admin-data.ts` via the service client). Built generally rather than special-cased to one course.
- **`mem_bookings` has no anon SELECT policy at all** — `members_read_own_bookings` is `to authenticated`, scoped to the caller's own account. An anon read against it doesn't error, it silently returns zero rows, which would have made a public counter always read "0 booked" with no error to notice. Added two SECURITY DEFINER RPCs instead — `mem_public_occurrence_capacity()` / `mem_public_course_run_capacity()` (migration `20260902153926_members_public_capacity_rpcs`, applied live) — that expose only `capacity`/`booked` integers, nothing RLS would otherwise hide, counting exactly what `mem_hold_bookings()` counts (`pending_payment`/`confirmed`/`attended`) so the public counter can never disagree with the thing that actually enforces capacity. Granted to `anon, authenticated`; verified against the live anon key over REST and against a real Beginners Foundation run (`capacity=25, booked=0`) before touching any UI.
- **`catalogue.ts`'s "every read throws" rule caught a real design mistake before it shipped.** First pass had these two new functions degrade to an empty map on their own error — reasonable-sounding ("this is optional, non-critical data"), and wrong: `verify:catalogue`'s structural test (`every catalogue query routes its error through unwrap`) exists specifically because a policy applied to three of four reads and forgotten on the fourth is what caused the 2026-09-02 outage earlier today. Fixed by making both throw like everything else in the file, and catching once at the actual optional call site (`sessions/[slug]/page.tsx`) — same pattern `lib/booking.ts` already uses around `coverForOccurrence()`. The whole-file invariant stays literally true; the "is this required" judgement moved to where it belongs.
- **Capacity lives at whichever level the offering actually sells at.** A per_run course (Beginners Foundation) is sold as a whole block — its individual weekly dates don't each have their own capacity — so only the run gets a counter; a per_occurrence session's capacity is per date. `PlacesRemaining` (new, in `components/catalogue/OccurrenceDates.tsx`) is shared by both call sites so the wording can't drift between them: null capacity shows nothing (unlimited, matches the admin register's convention), otherwise "N places left" or "Fully booked".
- **Confirmed rendering in the actual prerendered HTML**, not just that the build succeeded — `beginners-foundation.html` shows "25 places left" against Level 1 - Tuesdays after the fix.
- **Pre-existing drift found and left alone, not silently destroyed.** Regenerating the migration ledger via `dump-ledger.mjs` also rewrote `20260901192256_members_capacity_counts_attended.sql`, stripping a rich comment block (rationale, verification notes) that had been hand-added locally after that migration was originally applied without comments — exactly the trap the registry doc warns about ("the ledger stores exactly what was sent... applying with the explanation stripped loses it permanently"). Reverted that one file rather than let a routine ledger refresh delete someone's documentation; only the new migration's file was added. Not fixed properly (that would mean re-applying an already-live migration purely to attach comments) — flagged here instead.

### Staff booking alert — `bookings@empowrcic.org`

- **Built the alert queued 2026-09-02 (session 4): nobody at Empowr was told when a booking was made.** Confirmed `bookings@empowrcic.org` is an existing, monitored inbox before wiring anything to it (not assumed). New pure template `lib/emails/staff-booking-alert.ts` — deliberately NOT a reuse of `buildBookingConfirmationEmail()`, which carries per-participant ticket URLs (credentials meant for the member, not staff).
- **Scoped to the Stripe-paid path only**, via `sendBookingConfirmationForSession()` in `lib/notifications.ts` — the same trigger as the member's own confirmation email, best-effort and non-blocking (a failed staff alert must never look like a failed booking, so it doesn't affect that function's return value). Deliberately does NOT fire from a walk-in (staff are physically present for those) or from today's earlier Phase 2 Step 4 materialisation (`materialize-member-bookings.ts`) — that reconciles many future rows in one pass per subscribe, and wiring the alert there would flood the inbox with one email per occurrence for a single subscribe action rather than the one-email-per-real-event the original decision called for.
- `accountEmail()` in `lib/notifications.ts` widened to `accountContact()` (name + email) — staff need to know who booked, which the member-facing template never needed since it's addressed to them.
- Address centralised in `lib/links.ts` (`staffBookingAlerts`) rather than hardcoded, per this file's own "never hardcode URLs [addresses] in components" rule. `guides/contact-routing.md` updated with the new address, its Members-specific scoping, and where it lives in code.
- **Not yet verified live** — needs a real paid booking to actually exercise it, same open gate the queueing note itself named ("rides along with the e2e's real booking, which would be the first one to actually trigger it").

`tsc --noEmit`, `next build`, and `verify:catalogue` (9/9, was 8/9 before the throw/catch fix), `verify:register` (6/6), `verify:subscriptions` (25/25), `verify:cancellation` (9/9), `verify:departure-consent` (6/6), `verify:seasons` (3/3) all pass. **Committed and pushed** as `bd15ca8` (deploy `ready`).

## 2026-09-02 (session 5) — Phase 2 Step 4 built: a subscriber's reserved place is now a real booking row, not just a live-read fallback

## 2026-09-02 (session 4) — Cancelled bookings were being listed on the door register; found by a "remove the test data" request

## 2026-09-02 (session 3) — Self-serve cancellation restored and LIVE; the published policy no longer promises a button that isn't there

## 2026-09-02 (session 2) — Every session page 404'd on production; the cause was `revalidatePath` on a dynamic route pattern, and I got it wrong twice before proving it

## 2026-09-02 — A subscriber can no longer be charged for a place they already hold; verified on production

## 2026-09-01 (later) — Subscriptions would have taken money and granted nothing; capacity gaps closed

## 2026-09-01 — Subscriptions on sale, subscribers on the register, catalogue layout steadied

## 2026-08-30/31 — Auth email links were bound to one browser; password reset built; four Phase 2 questions closed

## 2026-08-29 — Logo centred in auth emails, departure consent captured at the door; and I broke the drift guard on my first use of it

## 2026-08-28/29 (session 2) — Auth emails branded: the first email a member ever receives was stock Supabase (all 6 applied and verified)

## 2026-08-28 (continued) — Drop-in eligibility was wrong on 5 of 7 sessions; soft-404 fixed, and fixing it required a rebuild trigger

## 2026-08-28 — Pay-on-the-door walk-ins built and e2e-verified in production; the e2e found a live sign-in bug that had nothing to do with it

## 2026-08-27 (session 3, continued) — Anniversary event live, Prep to Street merged into one offering behind a new `mem_course_runs.venue_id`, door check-in fallback added, walk-in spec written and its premise corrected by Empowr

## 2026-08-27 (session 3) — Members went PUBLIC: 1 → 8 offerings live, noindex removed, first-ever robots.txt, catalogue seeded to March 2027

## 2026-08-27 — Phase 2 model corrected to per-participant/per-slot, live Stripe config completed and verified, docs realigned

## 2026-08-27 — Focus-ring fix finally reached production, three days after the docs said it had (PR #12, MERGED `b745c8d`)

## 2026-08-26 (session 2) — Phase 2 Steps 2-3 built, merged and verified end to end; a cross-app leak fixed in Heroes first; the test-mode webhook endpoint found dead

## 2026-08-26 — Catalogue reconciled against the KB: 3 offerings created, 2 renamed, a schedule gap and an out-of-season date fixed

## 2026-08-20 — Audited by the Web Build Framework harness: one real focus defect, and the PR #8 layout fix confirmed intact

## 2026-08-19 (tidy-up) — Test data purged, site set to noindex and deployed, registry corrected

## 2026-08-19 (admin access) — jasmine.barnett@empowrcic.org granted admin on production

## 2026-08-19 (end) — Unified the site header: /sessions was rendering a different nav (PR #9, MERGED and live)

## 2026-08-19 (later) — Member nav collapsed too; found the real cause of "unnecessary scrolling"; remaining refund copy removed (PR #8, MERGED and live) — Member header now collapses below sm like admin, at the user's request after seeing it working. Behaviour moved into a shared CollapsibleNav rather...

## 2026-08-19 — Bookings cancel/transfer notice removed (pre-purchase PolicyNotice KEPT deliberately); active-nav indicator on all headers; admin-only burger nav (PR #7, MERGED and live)

## 2026-08-18 (session 5) — UX pass: no loading boundaries existed anywhere; also shipped and fixed a prerender regression on /sessions (PRs #4, #5, #6 all MERGED and live)

## 2026-08-18 (session 4) — Multi-viewport mobile audit: admin pages horizontally scrolled at 320px, dates list wrapped every button (PR #4 — MERGED 2026-08-18 as `984349f`; was open when this was written)

## 2026-08-18 (session 3) — Public catalogue was uncacheable by design, not slow at the database; fixed and measured (PR #3 — MERGED 2026-08-18 as `108e6bb`; was open when this was written)

## 2026-08-18 (session 2) — Live-mode Stripe smoke test run for real; found and fixed a waiver bug, a cross-app Stripe webhook bug, and three mobile-responsiveness issues

## 2026-08-18 — PR #2 (tier 1 waiver decoupling + PassKit removal) merged to main, confirmed live in production

## 2026-08-17 (later session) — PassKit removed, replaced with an in-house QR ticket page

## 2026-08-17 — Tier 1 built (scoped down after a Waivers-side retention change), plus per-booking departure consent; PR #1 unblocked

## 2026-08-14 — Added a `## Skills and Tools Available` section to CLAUDE.md, closing a scheduled mwp-health M8 finding

## 2026-08-10 — Retention blocker cleared at the database: the purge now keys on session_date, and a latent FK would have killed the job entirely

## 2026-08-09 — Waiver copy aligned verbatim; 24h retention found, which invalidates Phase 1's core premise — PR #1 now ON HOLD

## 2026-08-06 (session) — In-app waiver built (Phase 1, PR #1 open, NOT merged); waiver-app scare resolved

## 2026-08-06 — Migrations moved out of this repo to the shared `empowr-cic-workspace` schema of record; all 22 migrations now generated from the Supabase migration ledger via `dump-ledger.mjs`

## 2026-08-05 (session) — PassKit pre-launch verification: found `lib/passkit.ts` silently broken in production (JWT `iat` on PassKit's 60s rejection boundary, 0/12 accepted), disproved "Apple blocked by cert" (real blocker is DRAFT mode's 48h expiry) and "Google Wallet unaffected", fixed a broken QR and empty name field, and wrote the cert-day runbook

## 2026-07-30 (session) — KB timetable investigation: KB held usable schedule data, and capacity was named the last seeding blocker — CORRECTED 2026-08-05, capacity is nullable and NULL means unlimited, so seeding was never actually blocked

## 2026-07-30 (session) — PostHog analytics instrumentation (Variant B: cookieless on_reject + consent banner); analytics_sites row created; CSP patch deliberately skipped; commit f7c72b2

## 2026-07-30 — PostHog route-change tracking fix (fleet-wide): `capture_pageview: true` → `'history_change'`, since `true` silently captured no client-side `<Link>` navigation at all; fixed across all 5 Next.js sites plus the canonical template

## 2026-07-29 (Launch-gate: legal policy links wired) — spec risk #5 resolved: reused the existing org privacy policy rather than adding a Members-specific one, added the `/legal/:slug` LegalHub proxy + a root-mounted `Footer.tsx` (the app had zero legal links before); live Stripe smoke test deferred — catalogue tables still empty

## 2026-07-21 (PassKit Track A — Step A8: live e2e proof passed, deployed — Track A COMPLETE) — self-signed a real Stripe webhook event end-to-end: pass issued + `passkit_pass_id` persisted, confirmation email wallet link verified via Gmail MCP, admin occurrence-cancel voided the pass (ticket 404s after); zero leftover rows after cleanup; deployed (commit `6d8f6b5`). Track A fully built/e2e-proven/deployed; still open: install a pass on a real phone, Apple Wallet blocked on Developer cert, Track B blocked on Phase 2

## 2026-07-21 (PassKit Track A — Steps A5, A6, A7 built: issue-on-confirm, email link, void-on-cancel) — `issuePassesForSession()` issues one pass per booking on Stripe first-confirm; confirmation email renders a wallet-install link per participant; admin occurrence-cancel voids the pass after refund/credit succeeds; clean build verified, not yet e2e-proven live at this point (that became Step A8)

## 2026-07-21 (PassKit Track A — Steps A3 + A4 built, venue wiring e2e-proven) — schema migration added `passkit_pass_id`/`passkit_venue_id`; `lib/passkit.ts` built (hand-rolled JWT, `createPassKitVenue`/`issueSessionPass`/`voidPass`); venue creation wired into `POST /api/admin/venues` and e2e-proven live (real Supabase row + real PassKit API)

## 2026-07-21 (PassKit Track A — Step A0 verified + Step A2 built and proven end-to-end) — REST JWT auth empirically verified live (fixed claim/header-scheme bugs + a PowerShell local-time-vs-UTC bug); built the shared Production/Ticket Type/Template via live API calls (full ID table + every REST-vs-gRPC JSON-shape gotcha written to `planning/passkit/CONTEXT.md` — read that before touching `lib/passkit.ts`); Apple Wallet blocker surfaced (needs a paid Apple Developer cert, Google Wallet unaffected); `mem_venues` confirmed empty (Q6/Jasmine real-timetable gap, unchanged)

## 2026-07-21 — Self-serve cancellation removed entirely (deleted `lib/cancellation.ts`, the member cancel route/email); matches new no-refund T&Cs v1.1 — only admin occurrence-cancel remains as a refund/credit path

## 2026-07-16 — PassKit integration scoped and ADR'd (Track A session pass greenlit, Track B membership pass blocked on Phase 2); credentials vaulted; entitlement intake Q1–Q6 drafted

## 2026-07-12 — Phase 1 Step 9: full e2e regression 6/6 PASS, pre-deploy-security 0 FAILs, Stripe switched to live mode in production (Netlify env PATCH-per-key gotcha documented); live-mode smoke test still outstanding at the time

## 2026-07-11 (Phase 1 Step 8) — Built admin area: allowlist-gated CRUD for venues/offerings/occurrences/course-runs, register view, cancel-occurrence bulk refund/credit folded into one email; e2e verified incl. folded multi-child email and FK-blocked venue delete

## 2026-07-11 (Phase 1 Step 7) — Built My Bookings + self-serve cancellation (48h refund/credit policy); e2e 6/6 incl. a real Stripe test-mode refund. **Superseded 2026-07-21: this entire flow was removed to match the new no-refund legal policy — see that entry.**

## 2026-07-10 — Phase 1 Step 6 DONE: Resend transactional emails (3 pure builders + never-throw sendEmail + orchestrators; confirmation wired into Stripe webhook); e2e all 3 delivered + Gmail-confirmed, zero leftover rows

## 2026-07-10 — Phase 1 Step 5 DONE: Stripe Checkout payments (card-only, webhook confirm/release, per-booking price snapshot); e2e 5/5 UI + 22/22 DB/webhook; prod TEST webhook wired, Netlify env pushed

## 2026-07-09 — Stripe test keys vaulted (Step 5 prep): MEMBERS_STRIPE_* keys created in the shared Empowr CIC dashboard, intook to vault, pulled to local; live keys deferred to Step 9 go-live

## 2026-07-09 — Phase 1 Step 4 DONE: booking flow (`mem_hold_bookings()` row-locked RPC, waiver gate against the Waivers tables, pg_cron expiry sweep); e2e 15/15 incl. a true concurrent capacity-1 race

## 2026-07-09 — Phase 1 Step 3 pages DONE: catalogue `/sessions` + `/sessions/[slug]`; e2e 25/25 against KB-shaped seed data; real-timetable seeding still gated on Q6 (Jasmine)

## 2026-07-09 (Phase 1 Step 2 — auth + account UI) ✅ — magic-link+password auth, Pattern 1 middleware guard, lib layer (supabase clients, business-rules constants, zod validation), route groups, household CRUD via service-client API routes; e2e 18/18; shadcn deferred for brand-token primitives

## 2026-07-08 — Phase 1 kickoff: spec gate closed (4 provisional rules ADR'd, Stripe = shared Empowr CIC account confirmed), e2e signup PASSED, fixed missing mem_ table grants (hardened default ACL), vault pipeline onboarded, .env.local written; only Q6 left open

## 2026-07-06 — Phase 0 COMPLETE: brand, 11-table mem_ schema + RLS, signup trigger, Resend SMTP auth config, Netlify site + members.empowrcic.org live, push-to-deploy verified (publish ".next" two-sided rule); bookings.empowrcic.org Wix A record deleted

## 2026-07-06 — Project planned from Empowr KB, MWP-scaffolded, repo + registries set up, phase 0–4 execution plans written (9 ADRs)
