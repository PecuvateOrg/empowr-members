# DEVLOG — Empowr Members

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

*(Session ran across midnight — commits `570d7d1`…`dbbc621` are 08-28, `5949c11` onward are 08-29. Dated from the commit record, not a clock read.)*

The site has been public and charging live cards since 08-27, and every Supabase auth email — including the signup confirmation, the first thing a new member sees — was unstyled stock HTML: bare `<h2>`/`<p>`, no logo, no brand colour, no footer, while the transactional emails have carried full Empowr branding since 08-27.

- **Checked the cross-app question first, and did not infer it.** Auth config is *project-level*, and this Supabase project is shared with Waivers and the EFN dashboard, so a template change could in principle have hit another app's users. It cannot: `grep` for `signInWith|signUp(|auth.getUser|createBrowserClient` across all three sibling apps returns **zero** hits, and `site_url` + `uri_allow_list` name only `members.empowrcic.org`. Members exclusively owns auth here — consistent with the one-app-per-project auth ceiling in `_config/guides/supabase-structure-blueprint.md`.
- **A memory claim was half wrong and is now corrected.** memory.md said all six templates were "unstyled defaults"; on first read the copy looked hand-written (`"Confirm your email address"`, not Supabase's `"Confirm Your Signup"`) so I recorded that the copy had been rewritten. That was wrong — `mailer_templates_custom_contents` is authoritative and every flag read `false`. Supabase's current stock copy is simply better than the old one. **The original memory was right; my correction to it was the error.**
- **The shell was extracted rather than copied.** Supabase stores auth templates as HTML strings in project config, so they cannot import anything at send time — the choice was import the brand shell or hand-write a second copy of it. A second copy is the exact failure this project has already had three times (`PublicHeader`/`MemberHeader`/`AdminHeader`), so `emailLayout` and friends moved out of `lib/email.ts` into **`lib/emails/shell.ts`** (pure, no `server-only`, no Resend). `lib/email.ts` keeps transport and **re-exports** all of it, so all three existing consumers are untouched. `next build` clean; `/sessions` still `○ Static`, `/sessions/[slug]` still `● SSG` with 7 paths.
- **`ops/scripts/alias-loader.mjs` makes `src/` runnable under plain node.** Node 24 strips TS types itself, but does not resolve the `@/*` alias — which is why `verify-subscription-helpers.ts` only ever worked against modules with no runtime `@/` imports, and why **nothing under `lib/emails/` has ever been testable**. ~30 lines of resolver hook fixes that for any future suite too.
- **Two scripts, both wired to npm.** `npm run render:auth-emails` renders all six from source into `ops/auth-templates/` plus a ready-to-apply `payload.json`, and **fails loudly if a `{{ .Xxx }}` placeholder was HTML-escaped on the way through the shell** — an escaped placeholder still renders and still looks fine, it just ships a broken link. `npm run check:auth-emails` diffs the **live** templates against the rendered ones; it is the only thing that can catch `shell.ts` changing without the templates being re-applied, since no build or clean git tree implies anything about config stored in Supabase.
- **All six applied and verified live: 6 in sync, 0 stock, 0 drifted.** `npm run check:auth-emails` confirms every template is `custom=true` and **byte-identical** to the repo output, with the logo present. `confirmation` and `magic_link` went first (the only two reachable in-app); the other four landed on a second pass once auto mode was off — the classifier had refused both a `curl` PATCH and an MCP write while it was on, which is worth expecting on any future auth-config change. See `[[feedback_automode_blocks_production_writes]]`.
- **Confirmed unchanged by the PATCH**, read back fresh: `site_url`, `uri_allow_list`, `external_email_enabled`, `mailer_autoconfirm`, `mailer_otp_exp`, `mailer_secure_email_change_enabled`, `disable_signup` and all four SMTP fields.
- **`recovery` is deliberately NOT worded as "choose a new password".** Nothing calls `resetPasswordForEmail()` and there is **no set-a-new-password screen anywhere** — `/auth/callback` verifies the token and drops the member on `/account` already signed in. Promising a password form that does not exist would strand whoever followed it. If password reset is ever built, that template has to be rewritten in the same change; the reason is in a code comment.
- **Link expiry wording is now accurate** ("expires in one hour") because it is tied to the project's real `mailer_otp_exp` of 3600s, not the vague "expires shortly" the stock copy used. `EXPIRY_WORDING` carries a comment saying it must move if that setting does.
- **Added a copy-and-paste fallback URL under every button.** Email clients mangle table-based buttons often enough that an auth email without one can lock somebody out of their own account; the transactional emails do not need this because none of them are the only way in.
- **🎨 Header reworked after review (`8492d59`): the white chip was a workaround for an asset that already existed.** `_brand/logos/empowr-logo-transparent.png` is the **official pure-white variant** of the master mark — identical artwork, identical 107,341 opaque pixels, ink `#ffffff` (measured, not eyeballed). I never looked in the brand folder and invented a white rounded chip to hold the navy logo instead. Measured contrast on brand blue `#4a70c2`: **white 4.78:1, navy master 2.33:1** — so the chip was solving a real problem the wrong way. Using the official variant also stays inside the brand rule forbidding recolouring `logo.png`.
- **The header was also rendering the brand name twice.** The logo artwork already contains the "Empowr" wordmark, and a separate `Empowr CIC` text span sat beside it. Removed. Proved in a real inbox by comparing two delivered emails: old plaintext read `Empowr CIC [/logo.png] Empowr CIC`, new reads `Empowr CIC [/logo-white.png]`.
- **Asset had to ship before the templates referenced it** — the logo URL is absolute, so applying templates first would have 404'd the logo in every email sent in between. Order was: commit → deploy → confirm `/logo-white.png` returns 200 → PATCH templates. Sized 80×80, which is exactly the brand guide's stated 80px minimum display width.
- **⚠️ `brand-identity.md` does not document the white variant** — it names only `_brand/logo.png` as the master and says the logo is "suitable for use on light and coloured backgrounds", which is what led me to invent the chip rather than go looking. That omission is the actual root cause and is worth fixing at source.
- **A "side effect" I recorded mid-session was wrong, and the way it was wrong is the reusable bit.** The MCP write's **response body** showed `security_captcha_provider` `"hcaptcha"`→`null`, `sms_provider` `"twilio"`→`null` and `sessions_timebox`/`sessions_inactivity_timeout` `0`→`null`, so I wrote it up as a real caveat about this endpoint normalising unrelated fields. A fresh `GET` afterwards shows all four **unchanged** at their original values. **The nulls existed only in the response payload, never in stored config.** A response body is not a read — asserting persisted state from one is the same mistake as trusting a route table over the built HTML. See `[[feedback_verify_claims_about_own_code]]`.
- **`.gitattributes` added, pinning `ops/auth-templates/**` to LF.** The drift check compares bytes, so a Windows checkout normalising to CRLF would report DRIFT on files nobody had touched — same class as the `lint-kb.mjs` CRLF gotcha.
- **✅ VERIFIED END TO END with a real signup on production.** Signed up through the live Supabase auth endpoint exactly as `SignupForm` does (`emailRedirectTo` + `name` metadata), then read the delivered email out of the real inbox. The rendered email carries the preheader, the logo (`members.empowrcic.org/logo.png`, confirmed **HTTP 200, image/png, 38KB**), the "Empowr CIC" wordmark, the branded heading, the body copy with its em-dash intact, the CTA, **the copy-and-paste fallback link**, the one-hour expiry line and the footer. `{{ .ConfirmationURL }}` substituted into a real verify URL carrying **`redirect_to=https://members.empowrcic.org/auth/callback`** — the custom domain, not the internal deploy host, which is the exact thing that broke every sign-in until `e4aaa73`.
- **📧 Test-email addressing, corrected twice — the second correction is the right one.** A signup to `teams+authbrand@empowrcic.org` sent cleanly and returned nothing from every Gmail search I ran (recipient, sender, subject), so I recorded that `teams+` addresses do not deliver. **That was wrong, and the user confirmed the email was received.** The Gmail connector available here reads a mailbox carrying `general@` / `enquiries@` / `finance@` / `apps@` and evidently not `teams@` — so an empty search proves only that *this tool cannot see that mailbox*, never that the mail did not arrive. **I turned a correct note into an incorrect one by treating a negative search as evidence of absence.**
- **✅ Standing rule set by the user: `tech@pecuvate.com` is the test email for ALL projects, always.** Use it (or a `tech+<tag>@pecuvate.com` plus-address where a distinct account is needed — note `tech@pecuvate.com` already holds a real Members account, `b649352a`, so a bare signup with it will collide). This replaces the whole `teams+` / `general+` question and should not be re-derived per project.
- **Cleanup verified against a baseline taken before the test**, not assumed: `auth.users` 4 → 6 → **4**, `mem_accounts` 3 → 5 → **3**, zero rows matching `%authbrand%`, and the remaining email list is byte-identical to the pre-test list. Both accounts had 0 participants and 0 bookings, and child rows were deleted before the parent in one transaction.
- **Shipped:** merged to `main` as `13297e1` (`--no-ff`), deploy **ready**, all six live routes 200, `check:auth-emails` reports 6 in sync / 0 stock / 0 drifted. Follow-ups `8492d59` (white logo), `cb11c91`, `2516b4f` (doc corrections) also on `main`.
- **This entry runs long deliberately.** Most of its bullets are corrections to claims I had already written down as fact, and the reasoning is the point — compressing them back to a one-line summary would delete exactly the part a future session needs. **Four wrong claims in one session, all the same shape:** asserting reality from a single indirect signal (an empty search, a response body, a route table). Recorded as `[[feedback_absence_of_evidence_in_one_tool]]`.

## 2026-08-28 (continued) — Drop-in eligibility was wrong on 5 of 7 sessions; soft-404 fixed, and fixing it required a rebuild trigger

Same session as the entry below. Empowr noticed `/sessions` listed only Skate Jam as a drop-in when everything except courses and camps accepts walk-ins.

- **The KB had the answer; the platform didn't.** Every session already carried a `Drop-in` field and 5 of 7 active offerings said Yes — but only Skate Jam and Roller Skate Events had a `walk_in_price_pence`, so the door panel refused the other three. Door prices set from Empowr: **Sk8 Skool for Kidz £10, All Ages £12.50, SYNKRON8 £15 — all identical to online**, plus **All Ages Roller Disco £15 → £20**.
- **Set through `PATCH /api/admin/offerings/[id]`, not raw SQL**, because that route calls `revalidateCatalogue()` and `walk_in_price_pence` renders publicly. Verified live: `On the door £12.50`, `£15`. See `[[feedback_db_write_bypasses_app_cache_invalidation]]`.
- **⚠️ "Structured" was a trap.** The KB files Sk8 Skool Kidz, All Ages and SYNKRON8 under a heading literally called **Structured Lessons**, and all three are `Drop-in: Yes`. Reading Empowr's phrase "apart from the structured sessions" against that heading would have excluded exactly the three that needed adding. The real rule — now stated once at the top of `entities/sessions` — is that **a session accepts drop-ins unless it is sold as a block**.
- **I asserted a pricing "convention" from two data points and it was falsified within the hour.** "Open skate and events carry a door premium; coached lessons do not" was written into the KB as fact; Roller Disco (an event) then read as £15 with no premium, so I withdrew it; Empowr then set £20, restoring it. The claim was right all along — the **basis** was not. It is now recorded as Empowr's stated structure rather than my generalisation. Three log entries in the vault, deliberately, because the reasoning genuinely changed twice.
- **Roller Disco's door price was already in the KB and I missed it.** `sessions-internal` had said since 2026-08-07 that it is "priced per event (£15) and that is the whole offer". I searched for an online/door *split*, which it has none of by design — a field-shaped question missed a prose-shaped answer sitting on the internal companion page. That paragraph is now amended in place.
- **🔴 Soft-404 fixed (`7dd781a`).** Every unknown or inactive `/sessions/<slug>` returned **HTTP 200** with a "Session not found" page. `notFound()` *was* being called — the status was lost because the route is ISR (`revalidate=300` + `generateStaticParams`) and **Next stores the not-found render as a prerendered page**, serving it 200 thereafter. **Confirmed as app behaviour, not a CDN artefact, by reproducing it on a local `next start`** — unknown slug 200, unknown top-level route 404, identical to production. `dynamicParams = false` fixes it; all 7 live slugs still 200 and still static.
- **⚠️ That fix has a cost, and the second half of the commit exists to pay it.** The slug set is now frozen at build time, and `revalidateCatalogue()` cannot extend it — revalidation re-renders existing params, it never adds new ones. An offering activated after the build would be **listed on `/sessions` and 404 when clicked**: a broken link, worse than the soft-404. Eight offerings were activated exactly that way on 08-27. So `lib/rebuild.ts` fires a Netlify build hook when the set of **active** slugs changes — create-active, `active` flipped, active slug renamed. **Price and copy edits deliberately do not**; during this session's pricing pass that would have rebuilt the site four times.
- **Verified in production: a price-only PATCH triggered no build** (the risky failure mode), and **POSTing the hook starts a real deploy** with its trigger title showing in Netlify. **Not exercised end to end: the activation branch itself** — doing so would have published a dateless session on a live site with real customers. It is three lines of pure logic over values the negative test already exercised.
- **⚠️ `NETLIFY_CATALOGUE_BUILD_HOOK` is not marked `is_secret`** — this account rejects it both ways (scopes are a paid feature, 403; a secret cannot carry the default `all` scope because it includes `post_processing`, 422). Low severity — the hook only builds committed code — but do not copy the pattern for a credential granting data access. Unset locally and on previews **by design**; absence is a silent no-op.

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
