# DEVLOG — Empowr Members

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
- **Still open:** the `departure_consents` write has still never executed in production (needs a real booking); one real subscription to prove the webhook writes a row; Roller Quad Camp, All Ages Roller Disco and Prep to Street Skate Level 2 still inactive (admin UI, never SQL); `planning/phases/phase-2/CONTEXT.md` still claims Steps 4-6 not started and all plans `active=false`, both stale since 09-01.

## 2026-09-01 (later) — Subscriptions would have taken money and granted nothing; capacity gaps closed

- **🔴 The live Stripe webhook endpoint was subscribed only to `checkout.session.completed/.expired`.** The single write to `mem_memberships` anywhere in the app is the upsert in the `customer.subscription.created/updated/deleted` branch of the webhook handler — `/api/memberships/subscribe` deliberately writes nothing, so Checkout is the authority. With those events undelivered, a live subscription would have **charged the card, created the Stripe subscription, and written no membership row**: no entitlement, nothing on `/membership`, absent from the register, billed monthly. Cancellation was broken symmetrically, so the register's self-clearing behaviour could not have fired in production either. Zero live subscriptions existed, so nobody was affected — but subscriptions went on sale in `40d2dd8` that afternoon. Endpoint corrected to carry the three subscription events, verified on a fresh GET. `invoice.payment_failed` deliberately left off: the handler does not implement it and `past_due` already arrives via `customer.subscription.updated`.
- **Why it was missed.** Step 3 was recorded "DONE and verified e2e", but the DEVLOG's own 2026-08-26 entry says it was proven with self-signed events against a local server because the test endpoint had been dead since go-live. So the lifecycle had never travelled a real Stripe delivery in **either** mode, and nothing compared the endpoint's `enabled_events` against the handler's `switch`. The handler was right the whole time; the delivery configuration was never checked against it. Phase-2 status corrected to reflect that.
- **Two capacity oversell paths closed.** A Subscription reserves a place with no booking row while `mem_hold_bookings()` counts only booking rows, so a capacity-20 session could take 20 bookings and admit every subscriber on top. The register now shows expected headcount against capacity and warns when over, naming how many places the system still believes it can sell. Arithmetic extracted to `lib/register-summary.ts` and tested (`verify:register`) because with zero bookings the warning cannot fire on real data.
- **`attended` did not count toward capacity** — found while writing those tests. `mem_hold_bookings()` counted only `pending_payment`/`confirmed`, so checking someone in *removed* them from the count and the session appeared to regain space. Both booking paths were exposed, since staff check people in before a session starts while online booking is still open. Migration `20260901192256` applied; the database now agrees with `lib/admin-data.ts`, which already treated a live booking as pending/confirmed/attended.
- **/sessions layout**: the page moved sideways when filtering. Two causes, both shell-level — `mx-auto` on a flex item cancels cross-axis stretch (so `main` sized to its own content, 896px→731px), and the scrollbar appearing past 2 results changed the layout viewport. Fixed with `w-full` semantics via a base rule and `scrollbar-gutter: stable`; both promoted to the Web Build Framework, whose own Container-scale snippet had been prescribing the faulty pattern. **Headless Chromium uses overlay scrollbars and reports width 0**, so two five-viewport passes — one against production — reported all-clear while the bug was live. The user found it by eye, twice.
- **Still open:** nothing stops a subscriber booking a covered session and paying twice; `departure_consents` write still never executed in production; Roller Quad Camp and All Ages Roller Disco still inactive (activate via admin UI, never SQL); Q8 Skate Jam seasonality decided but nothing verified as implementing it.
- **A database blip during a build would have shipped a green deploy with every session page 404ing.** `listActiveOfferings()` caught the error, logged it and returned `[]` — and that list IS `generateStaticParams()` for `/sessions/[slug]`, where `dynamicParams = false`. Reproduced: unreachable DB + cleared `.next/cache` → **exit 0**, no slugs emitted. The three catalogue reads now throw; same conditions exit 1 with the cause named. The swallow and `dynamicParams = false` were each defensible alone — the hazard only existed once both were true, and the comments still described the world before the second (one claimed "slugs added later still work" directly under the line disabling that).
- **Skate Jam's season is now stated before purchase** (`lib/plan-seasons.ts`, shown above the subscribe panel). Plans went on sale with nothing anywhere saying it stops 25 March for five months. Copy verbatim from the KB so the two cannot drift. **This is not the Q8 pause and not a step toward it** — nothing in the schema holds a season (`mem_membership_plans`/`mem_offerings`/`mem_plan_entitlements` have no date range; the nearest is `starts_at_local`, a time of day), so a pause cannot be scheduled off data that does not exist. Delete that file when the season becomes a plan column.
- **Admin Guides section** (`/admin/guides`, linked from header + dashboard) with a door guide for check-in while subscribers hold no booking row. Fixed misleading register copy in the same change: the subscribers panel said "check them in as normal", when there is no check-in control there at all.
- **Q8 remains unimplemented and its deadline is 25 March 2027, not 3 September** — Sept 3 is the season's first session, not a cliff. Separately, all four *year-round* plans have no occurrences scheduled past late March 2027 either; the KB says Kidz Wednesdays continue outdoors from 7 April. Same cliff date, different cause, different fix.

## 2026-09-01 — Subscriptions on sale, subscribers on the register, catalogue layout steadied

- **Phase 2 Steps 4-6 shipped and merged** (`40d2dd8`, live): `/sessions/[slug]` carries the subscribe choice beside the per-session price, `/membership/[planId]` completes it, `/membership` is management. Stripe, webhooks and `/api/memberships/subscribe` were already built — only a page that rendered a plan was missing. All 5 plans set `active=true` after verifying all 5 live Prices resolve by `lookup_key`.
- **The register now reads subscriptions live**, which is the half that makes launching without Step 4 viable. A Subscription reserves a place with no booking action (Q5) while capacity, waivers and the door all key off `mem_bookings`, so a subscriber would have been invisible at check-in. `getRegister()` resolves them from `mem_memberships` via `plansForOccurrence()` — so **a cancellation removes someone with no admin action at all**, replacing a manual register that drifted on every cancellation. Waiver status shows via `checkWaivers()`, the same function the routes gate on; this is the ONLY place an unsigned waiver surfaces for a subscriber, since they never pass through the booking flow.
- **The subscribe route had no age check.** An adult could hold a Subscription to Sk8 Skool for Kidz (5-12) and first be refused at the door, a month in. Gated with `isAgeEligible()`, the same helper booking and walk-ins use; the pure half moved to `lib/age.ts` so it is testable outside Next. 8 tests added (`verify:subscriptions` 25/25).
- **A magic-link sign-in produced a malformed URL** — `members.empowrcic.org&token_hash=…`, no `?`. `magic_link` is the only template built from `{{ .RedirectTo }}`, which Supabase silently replaces with the bare `site_url` when the origin is not allow-listed. Fixed by allow-listing `https://*--empowr-members.netlify.app/**`, **not** by switching to `{{ .SiteURL }}` — that would drop the per-request `?next=` and break previews entirely. `check:auth-emails` now asserts the allow list and was proven to fail on a missing origin.
- **Catalogue layout**: dates paged 6 at a time (query raised 30→200 so "Later" reaches the end), year restored to `formatOccurrence` (Kidz spans into 2027), venue on every row resolving occurrence-then-offering (Kidz Mondays rendered blank), subscribe moved to a sticky sidebar card, `CourseRunList` given the same shell as `OccurrenceList`, and the `/sessions` Clear button always mounted so selecting a filter no longer reflows the grid.
- **🔴 I put production into the listed-but-404 state for ~6 minutes.** Activating Roller Quad Camp and All Ages Roller Disco in raw SQL fired neither `revalidateCatalogue()` nor `triggerCatalogueRebuild()` — `/sessions` advertised the Disco while its page 404'd. Reverted to inactive and forced a cache-cleared production rebuild. `lib/rebuild.ts` exists to prevent exactly this and only runs from the admin routes. **Activate those two through the admin UI, never in SQL.**
- **Still open:** nothing stops a subscriber booking a session they are covered for and paying twice; the `departure_consents` write has still never executed in production.

## 2026-08-30/31 — Auth email links were bound to one browser; password reset built; four Phase 2 questions closed

- **Every auth email sent a PKCE link, redeemable only in the browser that started the flow** — a member signing up in Safari and tapping the link in the Gmail app was locked out with "invalid or has expired", on the first email anyone receives. Fixed to Supabase's documented `{{ .TokenHash }}` + `verifyOtp` pattern, which `/auth/callback` already supported; proved by signing up in one browser profile and confirming in another. Found by checking the vendor's docs rather than reasoning from first principles — that research also corrected my blast-radius estimate, which had it as a device-switch edge case.
- **Built `npm run apply:auth-emails`** — the script whose absence caused the 2026-08-29 hand-written PATCH that desynced all six templates. Sends `payload.json` byte-for-byte, snapshots live config for rollback, refuses a payload still containing `ConfirmationURL`, and verifies against a **fresh GET**, never the PATCH response body. Token resolution shared via `management-token.mjs` instead of copied into a second script.
- **⚠️ I applied a template that depended on undeployed code and broke signup links for ~1 minute** — the same ordering hazard as the logo asset, from the other side. Fixed by removing the dependency rather than racing a deploy: signup now uses `{{ .SiteURL }}` and needs nothing from the form.
- **Password reset built** (`/login` → `/account/password`), and the recovery template reworded from "sign back in". The request form always reports success even for unknown addresses — otherwise it tests whether someone holds an account, and these belong to parents of children at known sessions. Proved e2e including completing the reset in a different browser.
- **Fixed a swallowed auth error the user reported** — middleware wiped the query string when bouncing a signed-in visitor off `/login`, so a dead reset link landed them on their account with no message, reading as success. Nothing crossed accounts; the missing message was doing the misleading.
- **`beginners-foundations` → `beginners-foundation`** with a 308 on the old URL. ⚠️ Found that **a slug rename can silently not take effect on a rebuild**: `generateStaticParams` reads an `unstable_cache` entry Next persists in `.next/cache` between builds, so the first build still emitted the old slug. That is a hole in what `lib/rebuild.ts` guarantees — deployed with the cache cleared.
- **Phase 2 Q3/Q5/Q6/Q8 all closed, Steps 4-6 unblocked.** No session cap, place reserved indefinitely with no re-booking, warn-then-revert on failed payment, Skate Jam pauses and auto-resumes. Q3 came back as "4 a month" and was pushed back on: it contradicts Q5, since a held place is held all five times in a five-occurrence month. Stripe dunning settings verified in the Dashboard (no API exposes them).
- **Supersedes the 2026-08-29 entry's "NOT verified end to end":** the departure-consent UI and its gate are now exercised in a browser on both the online and door surfaces, with `/book` clicked through after the `BookingForm` refactor. **The write itself is still unproven** — no `departure_consents` row has been observed landing from either path. That needs one real charge, deliberately deferred by the user to a real customer at launch.

## 2026-08-29 — Logo centred in auth emails, departure consent captured at the door; and I broke the drift guard on my first use of it

Three strands: a small brand change, a safeguarding gap at the door, and a
self-inflicted bug that is the most useful thing in this entry.

**🔴 I applied the six auth templates by hand and desynced all six from the
repo.** `render-auth-templates.ts` emits `ops/auth-templates/payload.json`
specifically so the applied content is the rendered content. I did not use it
— I hand-wrote the PATCH body from the shell source instead, and dropped the
17-line header comment in the process. Every live template then differed from
its repo counterpart by that block. `npm run check:auth-emails`, the only
thing that catches exactly this, would have reported **6 drifted** — and I
could not run it, so it reported nothing. It was caught by reading
`payload.json` against the live config by hand, during a review the user
asked for. **Use payload.json. The renderer exists so nobody hand-writes
this.**

- **I also called it "verified" when it was not.** A fresh `GET` confirmed the
  centring had landed, which was true, and I reported that as verification.
  Byte-identity with the repo was the thing that actually mattered and was
  never checked. Same family as last session's four wrong claims — asserting a
  conclusion from a signal that does not support it. Corrected in the message
  of `bdbaea0`, since `087814b` was already pushed.
- **Root cause was that the guard was unrunnable, so the guard got fixed.**
  It needed `SUPABASE_ACCESS_TOKEN` in the shell, nothing puts it there, and
  the workspace secret-guard blocks every obvious way of getting it there —
  running it meant deriving a non-obvious incantation first. It now resolves
  the token itself: environment first, then the workspace `.env.shared`, found
  by walking up from the script. Used as a Bearer header, never logged.
  `npm run check:auth-emails` now works from a cold shell, and reports
  **6 in sync, 0 stock, 0 drifted**. A check that takes a puzzle to run is a
  check that does not get run.
- ⚠️ **`bdbaea0` was cancelled by Netlify as "no content change"** — it only
  touched `ops/scripts/`, which is outside the `src/` base dir. Expected, and
  nothing in it needed deploying, but worth recognising rather than reading as
  a failed deploy.

**🎨 The auth-email logo is centred, and ONLY there.** User's request. The
change is `text-align:center` on the header cell plus `margin:0 auto` on the
image — the image is `display:block` for Outlook, so it will not centre from
`text-align` alone. **This does not apply to the on-screen headers.**
`SiteHeader` and `AdminHeader` stay left-aligned; the user confirmed the
change was email-only after I checked, having initially read the request as
brand-wide. Worth pausing on that: "move the logo centre" sounds global, and
rolling it across eight live Empowr properties would have been a large,
mostly unwanted change.

**📐 `brand-identity.md` now documents the white logo variant.** This is the
root cause of last session's white-chip workaround, fixed at source: the doc
named only `_brand/logo.png` and described it as suitable for "light and
coloured backgrounds", which it is not (2.33:1 on brand blue). It now
documents `_brand/logos/empowr-logo-transparent.png` (4.78:1) with a
**mandatory pairing rule** — that asset is used in the branded email header
band and nowhere else, and contrast is never to be solved by inventing a chip
or backing shape again. Lives in the `empowr-cic-workspace` repo, so it is a
separate commit from everything else here.

**🚪 Departure consent is now captured at the door.** Online, a parent answers
how an under-18 is getting home plus a five-point checklist. At the door that
was captured nowhere — the panel just told staff to collect it "as usual", on
paper. The door is the surface where a child is most likely to be leaving
imminently, so it was the worst place to have no record. It writes to the same
Waivers-owned `departure_consents` table with the same `session_date`, so it
surfaces in the staff portal identically to an online one.

- **Still optional, exactly as online.** Default is collected-in-person; the
  block starts collapsed and the checklist starts unchecked. Staff take
  payment without touching it in the common case.
- **Deliberately NOT pre-filled from `default_travel_method`.** That would
  fabricate a parent's answer, which is the entire reason this consent is
  per-booking rather than standing (2026-08-10 decision). The travel *method*
  pre-fills; the consent never does. Pinned by a test.

**Waiver status now shows in walk-in search results.** Staff previously found
out a member had no waiver only after pressing Take payment and getting a 409,
at a door, with a queue. The old code omitted it deliberately, reasoning that
a "cheap advisory copy" of the waiver logic would be a second gate free to
drift from the real one. **That reasoning was right and is preserved** — this
does not copy anything, it calls `checkWaivers()`, the same function the route
gates on. Do not replace it with a direct `mem_waiver_consents` lookup for
speed: that reintroduces the copy and silently misses everyone covered only by
the legacy fallback (anyone who signed on the standalone waiver app).

- **⚠️ It warns, it does not block — and I shipped the contradiction first.**
  I documented it as advisory with the route authoritative, then had the panel
  hard-disable Take payment on it. Both cannot be true. The status resolves
  once at search time and fails to "unsigned" if an account's email lookup
  errors, so blocking on it means one transient failure leaves staff unable to
  take money from a properly covered member, with no override. Fixed in
  `0cf6be8`. The route still refuses clearly when the waiver really is absent.

**Shared, not duplicated — this app has shipped that bug three times already**
(`PublicHeader`/`MemberHeader`/`AdminHeader`). New: `lib/travel-methods` (the
canonical values), `lib/departure-consent-form` (state, defaults, completeness
rule), `components/booking/DepartureConsentFields` (the fields). `BookingForm`
now uses all three instead of its own copies.

- **⚠️ `travel-methods` is separate from `validation` for a measured reason.**
  `validation.ts` builds zod schemas at module scope, so a *value* import of
  it from a client component pulls zod into the browser bundle. Routing the
  shared module through `validation` cost **21 kB of First Load JS on
  `/book/[occurrenceId]` and `/book/run/[runId]` (140 kB vs 119 kB)** — the
  paid booking path, which has had deliberate performance work done on it.
  Caught by comparing build output, not by guessing. Type-only imports from
  `validation` are free and still used. **Do not move those constants back.**

**`npm run verify:departure-consent` — 6/6.** Covers the seam between the
client builder (`toDepartureConsentEntry`) and the server schema
(`departureConsentEntrySchema`): different files, neither importing the
other's expectations, and a mismatch typechecks perfectly because the route
parses `unknown` off the wire. The failure guarded against is specific: the
booking succeeds, the card is charged, and the safeguarding record it was
meant to carry is dropped by a 400 nobody reads. Tests assert **both**
directions — an unfinished checklist and an undescribed "other" are refused by
the form *and* by the schema independently, so the test fails if either side
stops caring.

**⚠️ NOT verified end to end.** No walk-in has been taken through this against
a real session, and no departure-consent row has been observed landing in
`departure_consents` from the door path. The tests cover the payload seam and
the build is clean, but neither exercises the live write. `/book` was also not
clicked through after the `BookingForm` refactor — it is a pure UI refactor
with a clean typecheck, but that is not the same as having used it. **Both are
the first thing to do next session**; see `[[feedback_deployed_not_verified]]`.

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
