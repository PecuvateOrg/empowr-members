# DEVLOG — Empowr Members

## 2026-08-28 — Pay-on-the-door walk-ins built and e2e-verified in production; the e2e found a live sign-in bug that had nothing to do with it

**Corrects the 2026-08-27 (session 3, continued) entry twice.** That entry said the walk-in spec had reduced the feature to "an admin entry point onto the existing pipeline" with `mem_hold_bookings()` the "correct shape for this" — the RPC needed a real change, described below. It also said the door check-in gap was closed; it was not, because `/admin/checkin` hid a session the moment it started.

- **Walk-ins ship (`775316d`, merged `a2f9def`, live).** Staff search a member by name from a session's register, take a hold at the door price, and hand over a QR or link the member pays on their own phone. The webhook that confirms the booking and emails the ticket is reused untouched. `mem_booking_source`'s `walk_in` value, declared in the initial schema and never once written, is finally what it was declared for.
- **🔴 The spec's core assumption was wrong: `mem_hold_bookings()` required `starts_at > now()`.** A walk-in is by definition someone at the door, usually *after* the session started — the RPC would have refused exactly the person the feature exists for. Migration `members_hold_bookings_walk_in_mode` adds `p_walk_in`, which tests `ends_at > now()` instead. The 5-arg signature is **dropped, not overloaded**: an overload whose only extra argument has a default makes a 5-named-arg PostgREST call ambiguous.
- **The door price refuses rather than falls back.** `walk_in_price_pence` null raises `mem_no_walk_in_price` — charging Skate Jam's £7 at the door because a field was blank is a revenue leak nobody would notice. **Only 2 of 7 active offerings have a door price** (Skate Jam £10, Roller Skate Events £20); Kidz, All Ages and SYNKRON8 are NULL, so the panel visibly refuses them until Empowr sets one. **Course runs refuse walk-ins outright** — the door price is a single-session price and a course is sold as a whole block.
- **All four RPC paths probed against the live database inside rolled-back transactions**, then the whole flow e2e'd through the deployed production app on live-mode Stripe: search `200`, walk-in `201` at **£10 not £7** with a `cs_live_` Checkout URL and a rendered QR, duplicate `409`, release `200`, unauthenticated `401`. Nothing charged (Stripe only charges on completed payment). Zero residue; the retained booking `ee8e2e4a` untouched.
- **🔴 `/admin/checkin` hid a session the moment it started.** The page's own doc comment said a rolling window "would hide a session that began ten minutes ago — exactly when the register is most needed", but the query under it filtered `starts_at >= now()`. The comment described the *filter*; nobody had checked the *query*. Staff lost the register mid-session — and, once walk-ins existed, the only route to adding one.
- **A pending hold had no early exit.** It consumes capacity for ~41 min (30 hold + Stripe's 31-min session + 10 grace), so a room could read as full while people queued. Added an explicit Release action. **Shortening the hold is not the alternative** — Stripe Checkout enforces a 30-minute minimum expiry, so a shorter hold would let payment land after the sweep: paid, with no booking.
- **🔴🔴 The e2e found an unrelated live defect: every sign-in redirected members off the custom domain** (`e4aaa73`, deployed and verified). `/auth/callback` built its redirect from `new URL(request.url).origin`, which behind Netlify is the internal deploy host — so a sign-in starting at `members.empowrcic.org` was answered `307 Location: https://main--empowr-members.netlify.app/...`. The session cookie it had just set is **host-only** for the custom domain, so the member landed on a different origin with no session and was bounced back to `/login`. That is the magic-link sign-in **and the signup confirmation — the first email any new member receives**, on a site public since 2026-08-27. `requestOrigin()` already existed, is proxy-aware, and is already used by every Stripe redirect; its own comment warns a second copy of the rule would be free to drift. This route was the copy that drifted. Verified post-fix with a real generated token, not a bogus one: lands on `members.empowrcic.org`.
- **Known limit, deliberate: departure consent is not captured at the door.** It is a per-booking judgement (2026-08-10 decision) and there is no door step for it; defaulting it from `default_travel_method` would fabricate a parent's answer. The panel warns staff to collect it as usual for any under-18. Obvious next increment.
- **`getOrCreateStripeCustomer` now takes account fields, not an `AuthedAccount`** — the door charges an account the caller is not. One shared function rather than a second copy free to drift.

## 2026-08-27 (session 3, continued) — Anniversary event, Prep to Street merged behind a new column, door check-in gap closed, walk-in spec written

Same session as the entry below, after launch. **Corrects that entry's "1 → 8 active offerings": the Prep to Street merge later took it to 7.** Current state is 7 active of 10 total, 145 future occurrences, 20 course runs, 7 venues.

- **Empowr Anniversary Event live** — new venue Nunhead Sports Ground, Sat 3 Oct 2026, 19:00–22:00, capacity **100** (Empowr's number; 25 was my conservative placeholder). **The 2027 date was deliberately NOT seeded**: there is no publish-date concept — `mem_occurrences` has no such column and `mem_occurrence_status` has no draft state — so any occurrence that exists is immediately bookable, and a `non_refundable` ticket 13 months out is avoidable exposure. Recorded in the KB with an explicit **re-add after 3 October 2026** action.
- **Prep to Street Skate merged into ONE offering** (`prep-to-street-skate`), both levels as course runs like Beginners Foundation. It could not be done before because venue lived only on `mem_offerings` — the levels were split into two offerings purely to carry Southwark Park and Dulwich Park. Migration `members_course_run_venue` adds `mem_course_runs.venue_id` (NULL = inherit, so every existing run is untouched). Checked EELA's parked branch first: it links seven other slugs and neither old one. Level 2 offering **deactivated, not deleted** — reversible. Ledger 33/33 clean.
- **🔴 Door check-in had no fallback at all.** The register listed who was booked and offered **no action whatsoever**, so a flat battery or an unscannable screen left staff unable to mark anyone attended — in-page scanning is impossible (`Permissions-Policy: camera=()`). Added a Mark-attended button per row plus a new `/admin/checkin` listing today's sessions, in the nav and on the dashboard. The API already existed and was correct; the register simply never called it.
- **Walk-in spec written, then rewritten** — `planning/spec/door-attendance.md`. The first draft assumed non-members needed representing and hit a hard blocker (`mem_participants.account_id` NOT NULL → `mem_accounts.user_id` NOT NULL → `auth.users`). Empowr corrected the premise: **membership is a condition of attending**, so a walk-in is just a member who forgot to book. That removed the blocker and reduced the feature to an admin entry point onto the existing pipeline. Settled: self-registration for strangers, Stripe Checkout, standard receipt.
- **Empowr logo added to transactional emails** (`a552a93`) — in a **white chip**, because the logo is dark navy and would be near-invisible on the blue header bar. Covers the two builders using `emailLayout`.
- **⚠️ Open, and bigger than it looks: all six Supabase auth email templates are still unstyled defaults.** `get_auth_config` confirms every one is `custom: false` — bare `<h2>` plus a link. That includes the signup confirmation, the **first** email any member ever receives. Not touched deliberately: signup is live and a malformed template breaks real account creation.
- **⚠️ Also open: pending walk-ins would be invisible.** A hold lasts ~41 min (30 + Stripe's 31-min session + 10 grace) and the register filters to confirmed/attended, so staff would see free capacity that is actually held, with no way to release it. **Shortening the hold is NOT the fix** — Stripe Checkout has a 30-minute minimum expiry, so a shorter hold risks payment landing after the sweep. The fix is visibility plus a cancel action.
- **Pre-existing, newly relevant:** unknown session URLs return **HTTP 200**, not 404 — a soft-404 on every bad slug. Harmless while the site carried `noindex`; now the site is indexable it matters.

## 2026-08-27 (session 3) — Members went PUBLIC: 1 → 8 offerings live, noindex removed, first-ever robots.txt, catalogue seeded to March 2027

The platform had been built, deployed and reachable-but-unindexed since 2026-08-19. This session launched it. **Supersedes that entry's "AT LAUNCH: remove the two noindex lines AND add a real robots.txt" — both are done and verified on the live deploy.**

- **Launch shipped (`5adb680`, pushed, deployed in ~60s).** The temporary `robots: { index: false, follow: false }` is gone from the root layout and `app/robots.ts` now serves real rules — `/robots.txt` had been returning the app's own 404 HTML, which crawlers read as "no rules" rather than an error. Verified **on the live site**: robots.txt 200s with content, `noindex` absent from `/`, `/sessions`, a drop-in page, a course page and `/login`, all 8 slug pages 200, all 8 titles present on `/sessions`. **Stripe has been live-mode since 08-18, so real cards now charge.**
- **98 occurrences seeded through March 2027, clearing the November cliff.** Every slot ran dry at 26–31 Oct; for a subscriber that would have meant paying monthly against nothing bookable, with `slotCoversOccurrence` returning false indistinguishably from a genuine non-match. Christmas closure (20 Dec – 3 Jan) skipped, Skate Jam stops at its 25 Mar season end, Kidz Wednesdays carry Honor Oak explicitly because they differ from the offering venue. Built via `AT TIME ZONE 'Europe/London'` — the 29/31 Mar rows land at 15:00/16:00 UTC for 16:00/17:00 local, which a naive UTC insert would have got wrong.
- **20 course runs created** — Beginners Foundation 14 blocks (7 per level), Prep to Street 6 (3 per level), all capacity 25, dates from the corrected KB. **`per_run` courses need no occurrences at all**: they render and book from `mem_course_runs` alone. Capacity matters here because the course-run path in `mem_hold_bookings()` has **no venue fallback** (unlike the occurrence path), so NULL meant genuinely unlimited.
- **Empowr Anniversary Event added** — new venue Nunhead Sports Ground, Sat 3 Oct 2026 + Sat 2 Oct 2027, 19:00–22:00, capacity 100 at Empowr's instruction.
- **All offerings set to `non_refundable`**, resolving the long-parked policy inconsistency. ⚠️ **This hard-blocks self-serve cancellation** — `evaluateCancellationPolicy` returns `allowed:false` immediately for `non_refundable`, so restoring that feature requires setting these back to `standard` first.
- **Two corrections to earlier entries.** The admin label "Standard (48h refund/credit window)" is **not** a defect — it accurately describes what `standard` does under the (currently removed) self-serve flow, so the 2026-08-19 entry's "contradiction" framing was wrong. And self-serve cancellation is a **restore, not a build**: `dbbc782` deleted 458 lines of working, e2e-proven code and the schema still supports it with zero migrations — the real work is the Sanity → KB → `/sync-kb` → code policy chain.
- **Gotcha:** activating offerings via raw SQL bypasses `revalidateCatalogue()`, so the first build prerendered only `skate-jam`. Clearing `.next/cache` fixed it — see `[[feedback_db_write_bypasses_app_cache_invalidation]]`.
- **Not done:** no e2e booking against the `per_run` path since dates were set (different capacity logic, no venue fallback); EELA cutover unmerged and its branch predates the 4→10 catalogue change; Roller Quad Camp blocked on the school-holiday dates Empowr's doc leaves blank; Q5/Q8 still gate Phase 2, all 5 plans remain `active=false`.

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
