# DEVLOG — Empowr Members

## 2026-08-27 — Phase 2 model corrected to per-participant/per-slot, live Stripe config completed and verified, docs realigned

Continues the 2026-08-26 session. Empowr answered the entitlement questions, and two answers changed the model that had just been built.

- **Q4 + Q7 broke the seeded model, and Q7 exposed two errors of mine.** Subscriptions are **per participant** and **per weekly slot** — Sk8 Skool for Kidz is £30 **per slot**, so Mon 16:00 and Wed 17:00 are separate plans and a child doing both pays £60/month. I had read the KB summary table's "(Monday & Wednesday) £30/month" as one plan for both days, and had separately mis-computed SYNKRON8 as a 0% saving when it is ~31%. Corrected band is 26–31%, with Skate Jam the outlier at ~17%. **The KB summary table was the source of the error and was fixed at source** (`vaults/EMPOWR CIC` `5b4938a`) — its own per-row pricing and intro had always said per-session.
- **Plans restructured 4 → 5** (PR #13, merged `ad78736`). Migration `members_subscriptions_per_participant_and_slot` adds `mem_memberships.participant_id` (ON DELETE RESTRICT — deleting the row would not stop Stripe billing) and `mem_plan_entitlements.weekday` + `starts_at_local`. **Venue is deliberately not the slot discriminator**: the Wednesday Kidz slot runs at 17:00 all year but relocates seasonally, so the "split when venues differ" precedent used for Prep to Street L1/L2 does not apply. Each plan verified to match 11–12 real occurrences; Kidz Mon (12) + Wed (12) = the full 24-occurrence set.
- **⚠️ Slot matching must compare in Europe/London.** Occurrence times are `timestamptz` but mean UK wall-clock; a UTC comparison shifts the hour — and for late sessions the weekday — across BST, so a "Mondays 16:00" slot would match all summer and **silently stop each October**. Pure `lib/slot-matching.ts`, tested on both sides of the boundary plus a case asserting a naive UTC read would have failed. Suite now 17/17.
- **Stripe live-mode configuration completed.** Five Prices in **both** modes on matching lookup keys (Kidz key transferred to `…_mon_monthly`, new `…_wed_monthly` created). **Members has its own Customer Portal configuration** — live `bpc_1U8zvc…`, test `bpc_1U8noL…`, `metadata.app=members`, plan switching off — because the account default belongs to Heroes and editing it would have silently removed donors' tier switching. Resolved by metadata, and **fails 503 rather than falling back**.
- **✅ Verified end to end through the deployed app with the LIVE key**: `POST /api/memberships/portal` returned a real `portal_url`. Since a failed lookup returns 503, a 200 proves both that it resolved the Members config and that `rk_live_` holds `customer_portal_write`. A CLI-created session against the real customer embeds Members' return URL with **zero** occurrences of `hero.empowrcic.org`.
- **Q6 answered: end-of-retry action is "Cancel the subscription."** Account-level with **no per-app override**, so it applies to Heroes donors too. Recorded as an ADR with that caveat.
- **Docs realigned to reality** (`0e3e841`): CONTEXT no longer says the account is "pending confirmation"; memory.md no longer names the TEST webhook endpoint as production; architecture carries the new data model and drops `@stripe/stripe-js`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (neither is used); phase-2 shows Steps 2–3 done and drops the retired "£30 general / £50 Roller Disco" framing; **8 ADR rows added**.
- **Open, all with the team:** Q3 (caps — recommend none, since £30/month already prices in 4.33 sessions), Q5 confirmation (does a subscriber still reserve a place, given capacity and the door register need a booking row), and **new Q8 — Skate Jam is seasonal Sept 3–Mar 25, so what does a monthly subscription do out of season?** Q8 blocks activating that plan specifically.

## 2026-08-27 — Focus-ring fix finally reached production, three days after the docs said it had (PR #12, MERGED `b745c8d`)

The `/sessions` age-filter focus indicator was written on 2026-08-24 and recorded as fixed in both DEVLOG and memory.md. It was not on `main`. The commit sat on `feat/eela-booking-cutover` — a branch named after unrelated work, never pushed — so production carried the accessibility defect the whole time and every later check read the docs, not the code.

- Re-applied on its own branch; the original commit's doc edits were long superseded and deliberately not carried over.
- Checking the stranded branch before deleting it turned up a **second** un-rescued item: the `/design-audit` row in `skills.md`, also only ever on that branch. Rescued in `8000722`.
- Lesson recorded as `[[feedback_commits_stranded_unpushed]]` — three repos held unpushed commits this session. A clean working tree is not the same as "pushed", and a fix on a misnamed unpushed branch is invisible to every later check.

## 2026-08-26 (session 2) — Phase 2 Steps 2-3 built, merged and verified end to end; a cross-app leak fixed in Heroes first; the test-mode webhook endpoint found dead

Started as "continue Phase 2", turned into a cross-app safety fix before any of it could be built safely.

- **🔴 Found and fixed a live cross-app leak in Heroes before writing any subscription code.** Heroes and Members share one Stripe account and Stripe fans every event out to **every** endpoint on it. The 2026-08-18 `payment_link` guard covered `checkout.session.completed` — and that branch sits *below* `customer.subscription.deleted` and `invoice.payment_failed` in the same router, both unguarded. A member cancelling a £25/mo plan would have been fetched from Stripe, **written into the Heroes donor Notion database**, and emailed about as a lapsed supporter. Fixed at dispatch, not per-branch: `empowr-heroes-nextjs` PR #15, merged `83be16e`, deploy `ready`. Detail in that project's DEVLOG. See `[[feedback_shared_event_bus_positive_identification]]`.
- **Stripe account ownership verified, not inferred.** Every doc in the workspace said "the Empowr CIC account", all tracing back to one 2026-07-08 note. Checked directly: `company.name` = **Empowr CIC**, `business_type` `non_profit`, tax ID/directors/owners all provided, payouts to Starling `60-83-71 / …0202`. `finance@pecuvate.com` is the *contact* email only, not ownership. There is also a dormant second account (`acct_1TAcxnL3f35hmQe0`, "New business") created three days earlier, never onboarded, charges and payouts disabled — nothing uses it.
- **Prices are referenced by `lookup_key`, never by Price ID.** One Supabase project serves every environment but production runs Stripe LIVE while previews and local run TEST, so a stored Price ID is correct in exactly one environment. Phase 1 never hit this because bookings use inline `price_data`. Migration `members_plan_stripe_lookup_keys` adds `stripe_lookup_key` and holds the superseded `stripe_price_id` permanently NULL with a CHECK constraint — the trap is impossible, not merely documented. Re-pricing now needs no DB change (`transfer_lookup_key`).
- **Four plans seeded from the KB**, all `active=false`, each entitling exactly one offering: Skate Jam £25, Sk8 Skool Kidz £30, All Ages £40, SYNKRON8 £45. Four matching test-mode Stripe Prices created. ~~**No live-mode Prices yet** — deliberate.~~ **[SUPERSEDED 2026-08-27: live Prices created, and the plans restructured 4 → 5 — see that entry.]**
- **A second API-shape trap, same class as the Heroes one:** `subscription.current_period_end` has **moved onto the items**. Reading the top level returns `undefined` forever. Confirmed absent on a freshly created live object. See `[[feedback_stripe_sdk_types_trail_api_version]]`.
- **✅ Verified end to end locally (PR #11, merged `2913011`, deploy `ready`).** Self-signed events delivered to a local `next start` whose `STRIPE_WEBHOOK_SECRET` was **overridden with a throwaway**, so the real secret was never needed: `active → past_due → active (replay) → cancelled`, **one** row after five events (upsert on `stripe_subscription_id` holds), `current_period_end` read correctly from the item, bad signature → 400. **The load-bearing assertion: a metadata-less Heroes-shaped event was ignored AND left the row untouched** — the guard gates the write, not just the log. Test row deleted afterwards; DB back to 0 memberships / 4 plans / 1 booking (the retained real £7 one).
- **🔴 The test-mode webhook endpoint has been dead since go-live.** `we_1TraTS…` points at `https://members.empowrcic.org/api/webhooks/stripe` — production, which holds the **live** endpoint's signing secret. Stripe issues a distinct secret per endpoint, so test events can never verify there. Proven by a real test-mode subscription producing no row while the handler was demonstrably deployed. ~~**Not yet fixed**~~ **[SUPERSEDED 2026-08-27: DISABLED (`status: disabled`) with an explanation in its description, rather than deleted — no DELETE op is exposed via MCP and disabling is reversible. Do not re-enable as-is.]**
- Members' **test** endpoint now also subscribes to `customer.subscription.created/updated/deleted` + `invoice.payment_failed`. The **live** endpoint was deliberately left alone.
- ~~**Still open before any live subscription:** Customer Portal configuration, key permissions, live-mode Prices, Q3-Q7.~~ **[SUPERSEDED 2026-08-27: portal configurations created for both modes via the Stripe CLI, key permissions granted and verified through the deployed app, live Prices created, and Q4/Q7 answered — `participant_id` now exists. Only Q3, Q5-confirmation, Q6-with-team and the new Q8 remain.]**
- ~~Two labelled test customers remain in Stripe test mode.~~ **[SUPERSEDED 2026-08-27: both deleted, verified against the live customer list.]**

## 2026-08-26 — Catalogue reconciled against the KB: 3 offerings created, 2 renamed, a schedule gap and an out-of-season date fixed

All changes are **database only** — no code in this repo changed. Every new offering is `active=false`, so none of it is publicly visible.

- **The rule set this session: `vaults/EMPOWR CIC/entities/sessions.md` is the single source of truth** for what sessions exist. EELA displays it, this catalogue must correlate with it, and anything diverging is a defect to correct **toward the KB**. **Wix was explicitly ruled out of scope** as a reconciliation target.
- **Created 3 offerings**: `prep-to-street-skate-level-1` (Southwark Park, Tue+Thu, £55) and `-level-2` (Dulwich Park, Wed, £55) as **separate** offerings because their venues genuinely differ, plus `all-ages-roller-disco` (Ladywell, £15, 5+). Added `Southwark Park` and `Dulwich Park` to `mem_venues`; gave Honor Oak and Goldsmiths the full addresses/postcodes the KB now carries.
- **Beginners Foundation** gained its two course runs (Level 1 — Tuesdays, Level 2 — Wednesdays, £55 each, dates TBC), matching the L1/L2 split EELA shipped. Kept as **one offering with two runs** — unlike Prep to Street Skate — because both levels share Honor Oak. Renamed to the **singular** "Beginners Foundation" per Empowr: it is the foundation of a skater's skills. Slug stays plural; an open decision.
- **Renamed to KB canonical**: `synkron8` → "SYNKRON8: Roller Dance for Beginners", `roller-skate-events` → "Roller Skate Events 15+".
- **Two schedule defects fixed.** Sk8 Skool Kidz had no Wednesdays after 26 Aug — added 9 (2 Sep–28 Oct) at Honor Oak indoors with the BST→GMT shift handled, matching the KB's year-round Wednesday. Deleted one out-of-season Skate Jam occurrence (27 Aug, 0 bookings); the KB's Sept 3–Mar 25 season was confirmed 2026-08-25. The 13/20 Aug dates were left alone — both past, and **20 Aug carries the retained live £7 booking**.
- **Beginner Street Skate deliberately NOT created.** It is free (£0) and is the Outside Skating Pathway's destination, not a booking — the paid L1/L2 prep courses are the on-ramp. A £0 booking would not survive the Stripe Checkout flow as built. Its absence is correct, not a gap.
- **Open — refund policy.** 4 offerings still sit on `refund_policy='standard'` (Skate Jam, Kidz, All Ages, Roller Skate Events) while the KB marks every session non-refundable. **Deliberately parked**: Programme Policies v1.2 will reverse this stance, so it should be set once in that pass rather than twice.
- Supabase MCP disconnected mid-session; fell back to the Management API (`POST /v1/projects/{ref}/database/query`) per `[[reference_supabase_management_api_sql]]`. Also learned **`mem_occurrence_status` has no neutral `cancelled`** — only `scheduled`/`cancelled_by_empowr`/`completed`, and `cancelled_by_empowr` carries real member entitlement (alternative date / discretionary refund), so it is the wrong value for a seeding error. Delete the row instead, guarded on zero bookings.
- EELA side: `feat/eela-booking-cutover` in the **EELA** repo repoints `lib/links.ts` here. Its links 404 until these offerings are activated — deliberate.

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
