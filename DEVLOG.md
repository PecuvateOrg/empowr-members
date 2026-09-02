# DEVLOG — Empowr Members

## 2026-09-02 (session 4) — Cancelled bookings were being listed on the door register; found by a "remove the test data" request

- **The user asked me to delete test bookings showing on Skate Jam. The data was the symptom.** `getRegister()` read every booking for an occurrence with **no status filter** — the register page's `confirmed`/`attended` filters feed only the **counts**, while the table renders `register.bookings` unfiltered. So cancelled bookings appeared as rows on the door register. PR #18, merged `ed41e66`.
- **🔑 Shipping cancellation this afternoon had just made a dormant bug routine.** Before today cancellations were rare and staff-initiated; from today every member who cancels would have stayed on the register they had just left — on the surface staff trust at a door with a queue. **The feature and the bug were independently fine; the combination was not.** Worth asking, on any launch: what was rare yesterday that this makes common?
- **Excluded rather than included, deliberately.** `cancelled`/`credited`/`refunded` are filtered; everything else stays. A status not yet invented should default to **visible** on a door list — missing someone who turns up is worse than showing a row staff can read and ignore. `no_show` stays for the same reason: an attendance record for the session, not an absence from it.
- **`status=not.in.(...)` proven against live PostgREST**, not taken from docs — an occurrence with exactly one cancelled booking returned 1 unfiltered, 0 filtered.
- **4 test rows deleted from the 2026-09-03 Skate Jam** (the season's first session), archived first to `~/.claude/backups/empowr-members/` — outside the repo, since they carry a participant name. All four were `cancelled` with **no payment intent**, so no money was ever taken; the `cs_live_*` sessions were started and abandoned. Verified 0 `mem_credits` and 0 `departure_consents` referencing them, and `mem_credits` is the only FK (`NO ACTION`).
- **⚠️ ONE SKATE JAM BOOKING WAS DELIBERATELY KEPT**: `ee8e2e4a`, 2026-08-20, `attended`, £7, **with a real live-mode Stripe payment intent**. It is the live-mode smoke test and the only real card payment the platform has ever taken — deleting it would leave a charge in Stripe with no booking behind it. It is in the past, so it does not affect any upcoming register.

## 2026-09-02 (session 3) — Self-serve cancellation restored and LIVE; the published policy no longer promises a button that isn't there

- **Programme Policies v1.2 has been live since earlier today saying a member can cancel their own booking up to 48 hours out — and no such control existed.** Phase A shipped the policy deliberately ahead of the code; this closes that gap. PR #17, merged `8f9663e`, deployed, and the 7 cancellable offerings flipped to `refund_policy = 'standard'`. **All 9 session pages verified live**, each showing copy matching its own flag.
- **Restored from `dbbc782^` rather than rewritten** — `lib/cancellation.ts`, `POST /api/bookings/[id]/cancel`, `lib/emails/booking-cancellation.ts`, `CANCELLATION_CUTOFF_HOURS`, and the cancel action in `BookingsList`. The atomic claim is untouched: status flips to `refunded` guarded by `.eq("status","confirmed")` **before** Stripe is called, rolling back on throw. That ordering is what stops a double-click double-refunding.
- **No credit outcome, deliberately.** The 2026-07 original let the member choose refund *or* account credit. Credit **redemption** is Phase 2 Step 5 and is unbuilt — nothing reads `mem_credits` — so it would issue unspendable balances. v1.2 independently says the same ("We do not issue credit notes or account balances in place of a refund"). Admin-issued credit on the occurrence-cancel path is untouched.
- **A booking with no refundable payment is now refused BEFORE the atomic claim.** The webhook writes `payment_intent ?? null`, so a confirmed booking can carry none, and Step 4 will create £0 subscriber rows whose cancellation must also release the subscription reservation. The old code hit those inside the `try` and returned "could not process the refund — please try again", inviting endless retries on a booking that can never self-cancel.
- **`evaluateCancellationPolicy` took an injectable `now`** — without it the 48-hour boundary is untestable, since each run would land on whichever side the wall clock chose. New `verify:cancellation` (9/9) pins 47.9h refused / **exactly 48h allowed** (v1.2 says "at least 48 hours") / 48.1h allowed, and asserts `non_refundable` refused a month out so the carve-out isn't merely reached when the cutoff would refuse anyway.
- **`booking-confirmation.ts` moved onto `lib/emails/shell.ts`** (from `lib/email.ts`, which carries `server-only` + Resend). Same re-exported symbols, but the template can now be rendered outside a request — which is how both copy branches were **read back rather than assumed**.
- **Copy is deliberately silent about moving a booking to another date.** v1.2 grants it; transfer is Phase C and unbuilt. Copy must never promise a control the member cannot find — the inverse of the ordering mistake Phase A made on purpose.
- 🔴 **NOT PROVEN: no refund has ever been taken.** Gate, copy and flags are verified; the Stripe call is not, and there are no confirmed bookings on any upcoming occurrence so nothing currently renders a cancel button. Next session: seeded e2e, then Phase C (transfer).
- ⚠️ **`Prep to Street Skate - Level 2` (inactive) is still `non_refundable`** — not on the plan's list of 7. It will contradict v1.2 the moment it is activated.

## 2026-09-02 (session 2) — Every session page 404'd on production; the cause was `revalidatePath` on a dynamic route pattern, and I got it wrong twice before proving it

- **🔴 THE BOOKING FUNNEL WAS DEAD AND NOTHING SAID SO.** All 9 active `/sessions/[slug]` pages returned 404 from roughly 01:38 to 12:14 while `/sessions` kept listing them, so a customer could browse the catalogue and open nothing. Found by curling a booking page while checking something unrelated — no alert, no error, no failed deploy. The site was taking card payments throughout.
- **🔑 REAL CAUSE (proven by live experiment): `revalidateCatalogue()` called `revalidatePath("/sessions/[slug]", "page")`.** That discards the prerenders for a segment whose params exist ONLY because `generateStaticParams()` ran at build time. It does not run again outside a build, and `dynamicParams = false` then makes the router reject every slug as unknown — so all nine pages 404 and **stay** 404 until someone rebuilds. Fixed in PR #15 (`4e7b6cf`): `revalidateTag(CATALOGUE_TAG)` already drops the data caches and the renders that used them, and the `revalidatePath` for `/sessions` stays because a static route has no param set to destroy. Cost is up to 300s of staleness, against a total outage.
- **⚠️ THE LETHAL EDITS ARE THE ORDINARY ONES.** `shouldRebuildForOfferingChange()` correctly declines to rebuild for a price or copy change — so exactly those saves destroyed the pages with nothing to restore them. An *activation* survived, because flipping `active` also fires `triggerCatalogueRebuild()`. `lib/rebuild.ts` existed to keep the slug set alive while `lib/revalidate.ts` was quietly destroying it.
- **⚠️ I WAS WRONG TWICE AND SHIPPED A FIX THAT DID NOT FIX IT.** I first blamed the warm `.next/cache`, then blamed `getOfferingCached` returning `null` on error — the one catalogue read the 2026-09-01 "fail loud" change missed. `listActiveOfferings`, `listScheduledOccurrences` and `listCourseRuns` were all changed to throw; `getOfferingCached` still returned `null` on a database error. The page does `if (!offering) notFound()`, so a failed read is indistinguishable from "this offering is inactive". The policy was never wrong — it was **unevenly applied**.
- **The blast radius named the culprit before any log did.** `/sessions` stayed 200 the entire time because it reads `listActiveOfferings`, which throws, so Next served the last good page. The detail pages read the function that swallowed. That asymmetry is exactly the sentence already written in `catalogue.ts`: *"Failing loudly preserves content; failing quietly destroys it."* It had never been applied to `getOffering`.
- **⚠️ CORRECTED: the `notFound()`-poisons-the-cache reasoning was right about Next's behaviour but wrong about the trigger.** A cached 404 is indeed served long past its TTL (`Cache-Status: "Next.js"; hit` at 34,000s past expiry, even with cache-busting query strings). But what *produced* the 404 was the discarded param set, not a transient read failure. **PR #14 (`getOffering` throwing) did NOT stop the recurrence** — 12 minutes after it deployed, one admin save took 9/9 pages from 200 to 404 again. It stays merged as correct defence-in-depth; it was not the cure I claimed it was.
- **FIXED IN PR #16 (`2dee05a`) — `revalidateCatalogue()` now REBUILDS instead of invalidating,** because a rebuild is the only thing that regenerates the static param set. `shouldRebuildForOfferingChange()` removed: it skipped rebuilds for price and copy edits, which were the very saves killing the site. **✅ PROVEN BY A REAL ADMIN SAVE** — the team saved an offering at 12:26:15Z, it fired deploy `6a9815e7` (*"Catalogue: offering updated: prep-to-street-skate"*, the ordinary path the old gate skipped), and all 9 pages stayed 200 throughout. **Cost: a Netlify build per admin write, ~2 min before an edit appears.**
- **PR #14 (`279d6b0`) and PR #15 (`4e7b6cf`) both shipped first and neither held.** #14 stays merged as correct defence-in-depth; #15's removal of the dynamic-pattern `revalidatePath` was right but insufficient, because `revalidateTag` alone also kills the pages.
- **🔴 THE LESSON: I twice called it fixed on inference and was twice wrong.** Both times the evidence was consistent with my theory and also with the truth. What settled it was a **live experiment with a predicted outcome** — asking the team to make one admin save. Do that before declaring a production fix, not after.
- **The fix is structural, not a patch.** The error policy moved to `src/lib/catalogue-read.ts` and all four reads route through `unwrap()`, so it cannot be applied to some and forgotten on others. That module carries no `server-only` guard — following the `lib/age.ts` precedent — so the rule is testable outside Next.
- **`verify:catalogue` (7/7) pins BOTH bugs, and the tests that matter are STRUCTURAL.** One asserts `revalidateCatalogue` never revalidates a dynamic route pattern (comments stripped first, so the header quoting the bad call isn't a false positive); another asserts `dynamicParams = false` is still set, since that pairing is what makes the rule necessary. Both proven to fail by reintroducing the exact lines.
- **(superseded detail)** The behavioural tests would not have caught this bug. The two that would assert that every query routes through `unwrap` and that no `if (error)` block returns instead of throwing. **Both were proven to fail by reintroducing the original bug** (`4 queries but 3 unwrap() calls`), not just observed passing.
- **⚠️ Two wrong diagnoses on the way, both corrected by evidence.** I first blamed the warm `.next/cache`; the blast radius disproved it, since a stale-but-populated cache would only have killed the two newly-activated slugs, not long-active ones. I then suspected `revalidateCatalogue()` of only invalidating data — reading it showed it does `revalidatePath` too. I also briefly suspected a rogue writer when every offering showed a fresh `updated_at`; the user confirmed the team was editing through the admin UI.
- **The four `error` deploys overnight were NOT failures** — "Canceled build due to no content change" is Netlify skipping docs-only commits outside the `base` dir.
- **Still open:** no custom `not-found.tsx` (this outage served Next's stock 404), and there is a `robots.txt` route but **no sitemap** — `sitemap.xml` 404s. Nothing monitors these pages; the only reason this was caught is that someone looked.

## 2026-09-02 — A subscriber can no longer be charged for a place they already hold; verified on production

- **The double-pay gap is closed** (`1f0f3a8`, deploy `6a97687` live). A Subscription reserves a place with no booking row at all (Q5), so nothing downstream noticed a subscriber going through the paid booking flow: capacity, the waiver gate and `mem_hold_bookings()` all key off `mem_bookings`, and the duplicate check only ever sees other bookings. A subscriber could have paid the per-session price on top of their monthly one, and the only trace would have been a Stripe payment nobody could explain. Open since subscriptions went on sale on 09-01.
- **`coverForOccurrence()` is now the ONE place the entitlement question is answered**, and the register's subscriber lookup moved onto it. Those two reads must never disagree — if they drifted, someone could be charged twice *and* appear twice at check-in. Same reasoning that keeps the waiver gate on a single `checkWaivers()`; this project has shipped the duplicate-component bug three times.
- **Three surfaces, deliberately not treated alike.** `/api/bookings` **blocks** with a 409 naming the covered participants, and fails **closed** — if cover cannot be established the booking is refused, because that is recoverable and a double charge is not. The booking page **disables** those participants so a second payment is never offered, and degrades to "not covered" on failure since the route is the authority. The door **warns and does not block**, matching the waiver status beside it: a transient read failure must never leave staff unable to take money at a door with a queue.
- **`past_due` deliberately does not cover.** Entitlements pause and the member reverts to paying per session, so they must still be able to book — and must not be listed at the door. Occurrences only; courses have no Subscription option (Q1).
- **This is not Step 4.** A covered member still cannot book at £0 — they need not book at all, their place is held and they appear on the register. Step 4 replaces the refusal with a £0 booking row.
- **✅ VERIFIED ON PRODUCTION, not just locally.** 12 checks against a dev server on the production database, then 11 more against `members.empowrcic.org` itself: real magic-link sign-in, real browser, real plan/occurrence/participant, with only the `mem_memberships` row synthesised — the guard reads that table and does not care how the row arrived, so **no subscription was needed**. Checkbox enabled before and disabled after, notice naming the plan, live API 409, **no `checkout_url` issued**, no hold left behind, and both tables asserted back to baseline. The production script asserts the page *first* and skips the API call entirely unless the new code is proven to be serving, so it could never mint a live Checkout session.
- **⚠️ A memory claim was wrong and is corrected.** memory.md said one real subscription "settles four things at once", including the `departure_consents` write. It settles **two**: `recordDepartureConsents()` is called only from `/api/bookings` and the walk-in route, and `/api/memberships/subscribe` writes nothing at all. That write still needs a real **booking**. One subscriber also cannot trip the over-capacity banner unless capacity is 1.
- **Test mode is not the cheap route to the remaining webhook proof.** Test endpoint `we_1TraTS…` is disabled and points at `members.empowrcic.org` — production — holding the live endpoint's signing secret, so it could never verify. Restoring it needs a branch-deploy URL *and* that context's `STRIPE_WEBHOOK_SECRET`; and `enabled_events` is per endpoint, so a test run never exercises the endpoint that was actually broken. Previews also share the production database, so a test subscription writes a real membership row that entitles someone at a real door.
- **⚠️ Auto mode blocked the production verification** until it was turned off — the same classifier behaviour as the 08-29 auth-template apply. Expect it on anything production-scoped.
- **Also landed:** the 09-01 close-out DEVLOG and memory entries, which had been written but never committed.
- **Still open:** the `departure_consents` write has still never executed in production (needs a real booking); one real subscription to prove the webhook writes a row; **Prep to Street Skate Level 2** still inactive (admin UI, never SQL). *(The stale phase-2 status, and the other two inactive offerings, were both dealt with later in this session — see below.)*
- **`planning/phases/phase-2/CONTEXT.md` corrected.** It still carried its 08-27 status claiming Steps 4-6 not started, "nothing renders a plan yet", and all 5 plans `active=false`. Step 6 is marked DONE, Step 4's row now says what actually remains of it, and it carries a warning not to rebuild the refusal that already exists — a second entitlement read would reintroduce exactly the drift `coverForOccurrence()` prevents.
- **Programme Policies v1.2 planned, not started** — plan saved at `C:\Users\pecul\.claude\plans\smooth-churning-rose.md`. Scope confirmed by the user as **all three**: booking cancellation, booking transfer, and membership cancellation. **This executes the 2026-08-18 reversal decision, which had been decided and never acted on.**
  - **Cancellation is a RESTORE.** `dbbc782` deleted 297 lines across `lib/cancellation.ts`, `api/bookings/[id]/cancel/route.ts` and `lib/emails/booking-cancellation.ts` — all verified still retrievable at `dbbc782^`. Zero migrations for this half.
  - **🔑 Membership cancellation ALREADY WORKS and needs no code.** Stripe's Customer Portal does subscription cancellation natively and it is already wired (`ManageBillingButton` → `/api/memberships/portal`). Checked the Stripe docs rather than assuming: the portal explicitly "doesn't support displaying non-billing (non-subscription) payments", so one-off booking refunds can never be self-served there and must stay our code. Only Programme Policies §7 ("personal and non-transferable", fees "non-refundable") forbids it today.
  - **Transfer is the only real build** and the only migration: a `mem_transfer_booking()` RPC modelled on `mem_hold_bookings`, because repointing `occurrence_id` in application code bypasses the capacity lock entirely. Repoint-in-place beats cancel-and-recreate — it keeps the booking id, so the QR ticket stays valid and no `transferred` enum value is needed. The partial index `uniq_mem_booking_participant_occurrence` already rejects a transfer onto a session the participant holds.
  - **⚠️ A transfer must VOID the old departure consent.** `departure_consents` is keyed on `session_date`; carrying it to a new date would fabricate a parent's answer, which is the entire reason the 2026-08-10 decision made it per-booking. This is the subtlest part of the job.
  - **Decisions taken, pending Empowr sign-off:** refund-only (credit redemption is Step 5 and unbuilt — nothing reads `mem_credits`, so offering credit would hand out unspendable balances); 48h cutoff reinstated; transfers same-offering-different-date only, `per_occurrence` only, one per booking; Roller Quad Camp and All Ages Roller Disco stay strictly non-refundable and non-transferable; membership cancels at period end with no pro-rata.
  - **⚠️ Policy must ship BEFORE code**: Sanity ×2 → LegalHub → KB → `/sync-kb`. Out of order, the CRM chat widget quotes the old policy to real customers.
- **✅ All Ages Roller Disco and Roller Quad Camp are now ACTIVE and live** (deploy `6a977d5`). Done **through the production admin UI**, which is the whole point — raw SQL is what caused the 6-minute listed-but-404 outage on 09-01. Both PATCHes returned 200 and a **full-column diff confirmed only `active` and `updated_at` changed**, so the form's round-trip of every field rewrote nothing else.
  - Both have **zero occurrences**, so each renders the inline `DatesComingSoon` state with its mailto — verified in the live HTML, not inferred from a 200.
  - **The warm-`.next/cache` trap did not bite this time, and that was checked rather than assumed.** `triggerCatalogueRebuild()` fires a NORMAL build, and `generateStaticParams` can read an `unstable_cache` entry Netlify restores between builds — which would have re-created listed-but-404. Verified after the deploy: both pages 200, both listed, unknown slugs still 404, `prep-to-street-skate-level-2` still correctly 404s. **A transient 404 on every session page appeared mid-swap; it was the deploy publishing, not a fault.**
  - **Prep to Street Skate Level 2 stays inactive** — not requested.

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
