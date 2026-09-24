# PassKit Integration — Build Plan

**Status:** Track A COMPLETE (build side) — **all of A0–A8 DONE (2026-07-21)**, A8's live e2e proof passed clean, only the deploy (git push) is outstanding. Track B blocked on Phase 2 Steps 2–3.
**Credentials:** REST API Key + Secret vaulted as `MEMBERS_PASSKIT_API_KEY` / `MEMBERS_PASSKIT_API_SECRET` (2026-07-15). As of 2026-07-17: wired into `pull-to-local.ps1` (generic, no code change needed) and `sync-to-netlify.ps1`'s Members entry (as `PASSKIT_API_KEY`/`PASSKIT_API_SECRET`); pulled to `src/.env.local` and pushed to Netlify — both legs confirmed working live (see Step A0 auth test below).
**Account:** PassKit account exists (signed up 2026-07); has at least one existing `EVENT_TICKETING` template ("My Production") — dashboard is not empty, contrary to earlier assumption.

## What PassKit does here

PassKit (passkit.com) issues Apple Wallet / Google Wallet passes via REST API. Two pass types are in scope for Members, built as two tracks:

| Track | Pass | PassKit protocol | Trigger | Status |
|---|---|---|---|---|
| **A** | Session/booking pass — per confirmed booking, QR scanned at the door for check-in | Event Tickets | Booking → `confirmed` (Stripe webhook, live today) | **Build now** |
| **B** | Membership pass — ongoing card while subscribed, updated in place (not reissued monthly) | Members/Loyalty | Phase 2 Step 3 subscription lifecycle webhook | Blocked: needs Phase 2 Steps 2–3 + Q1 (see [../phases/phase-2/entitlement-intake.md](../phases/phase-2/entitlement-intake.md)) |

Track A has **zero dependency** on Phase 2, the entitlement questions, or the real timetable (Q6) — it builds and tests against seeded occurrences, exactly like the rest of Phase 1 did. Doing A first also lays the shared plumbing (client lib, credential wiring, template patterns) that makes B's PassKit portion a second-template job.

Where scanning pays off operationally is Phase 3's check-in view — Track A only *issues* passes; the scan/redeem UI is Phase 3 scope, not this build.

## Track A — build steps

Follow the Phase 1 conventions throughout: writes via service client in API routes, never-throw side-effect calls (mirror `lib/email.ts`'s `sendEmail`), zod on inputs, e2e with seeded rows + verified zero-leftover cleanup.

### Step A0 — Verify before coding — DONE (2026-07-17), all 4 items empirically confirmed
1. **Event Tickets licensed** — confirmed twice: (a) dashboard "new pass" wizard shows Event Tickets as a normal, unlocked protocol tab with working templates (BASIC EVENT TICKET, SPORTING EVENT); (b) a live API call (below) returned an existing `EVENT_TICKETING`-protocol template already on the account ("My Production", id `1HsBMCQptDR63w5FFLd0vT`) — note this means the dashboard is **not** actually empty as originally assumed; worth a quick look to see if that template was created intentionally.
2. **REST auth mechanism — confirmed working end-to-end.** `docs.passkit.io` is a JS-rendered SPA that WebFetch cannot read past the nav shell (tried repeatedly, structural limitation, not worth retrying). The working recipe came from PassKit's own `github.com/PassKit/jwt-token-generator-zapier` reference implementation, cross-checked live against `POST https://api.pub1.passkit.io/templates/list`:
   - JWT header: `{"alg":"HS256","typ":"JWT"}`
   - JWT payload/claims: `{ uid: <API Key>, iat: <unix seconds>, exp: <unix seconds>, web: false }` — **claim is `uid`, not `key`; there is no `url` or `method` claim** (an earlier search result claiming per-request-bound `url`/`method` claims and a `PKAuth` auth scheme was wrong/hallucinated — do not reuse those details)
   - Signature: HMAC-SHA256 over `base64url(header) + "." + base64url(payload)`, signing key = the raw API **Secret** string (UTF-8 bytes, not base64-decoded first)
   - Token = `base64url(header).base64url(payload).base64url(signature)`
   - Header on the actual API call: `Authorization: Bearer <jwt>` (not `PKAuth` — that was the wrong detail above)
   - **Clock-skew gotcha**: a fresh `iat` (= exact call time) got `401 "Token used before issued"` even though the header/payload parsed fine. Backdating `iat` by 60 seconds fixed it. Build `lib/passkit.ts`'s token generator with this same 60s buffer baked in.
   - Endpoint base: `https://api.pub1.passkit.io` (EU/pub1 — matches the account region). Errors come back as gRPC-gateway JSON (`{"error":{"code":<grpc status>,"message":...}}`) since PassKit's REST layer is a grpc-gateway proxy in front of their real gRPC backend.
3. **Pass-update semantics confirmed** — passes support genuine in-place updates (push notification / pull-to-refresh), no reissue needed. Source: [Introduction to Updating Passes](https://help.passkit.com/en/articles/6609055-introduction-to-updating-passes).
4. **Node quickstart reviewed and ruled out** — `passkit-node-quickstart` / `passkit-node-sdk` / `passkit-node-grpc-sdk` are 100% mutual-TLS gRPC (client cert + private key + passphrase via `grpc.credentials.createSsl()`), a completely different credential type ("SDK Credentials") from the plain REST Key+Secret we're using. Confirmed via reading `src/lib/client.js` directly — zero JWT code anywhere in that repo. Correctly not used here; our plain REST+JWT approach (above) is the right fit for Netlify serverless functions anyway (gRPC + cert files doesn't fit that runtime well).

### Step A1 — Credentials into the pipeline
- Add `MEMBERS_PASSKIT_API_KEY` / `MEMBERS_PASSKIT_API_SECRET` to the vault, then map them in `secrets.netlify_site_vars` for Members (site `76f903e4-3795-406a-9478-34be6b0ed015`). Follow `_config/guides/secrets-system.md` for distribution and local use.
- Confirm which side is correct before any existing-key Netlify update. Existing-key pushes use `PATCH /accounts/{id}/env/{key}?site_id=...` with a flat body and a context other than `all`.
- Never Read `.env` files directly; extract via shell (`grep -c`) silently.

### Step A2 — PassKit dashboard setup (Event Tickets) — DONE (2026-07-21), built via API not dashboard, proven end-to-end

**Real objects created (production account):**
| Object | ID | uid |
|---|---|---|
| Images (icon + logo) | icon `4lD7zAjjz7mkJklZeuSZbe`, logo `6WENXpxwiXapjfRkzMgE8s`, appleLogo `4drf8jqU2OaR1MkUzPf6gr` (auto-derived from logo) | — |
| Template ("Empowr Session Pass") | `3e9Vjyl8HGaSa02z0Wo1sY` | — |
| Production ("Empowr Sessions") | `27xx6YlVGWi65uxtO1mNbB` | `empowr-sessions` |
| Ticket Type ("Empowr Session Ticket") | `4KyxqXkNfBOZDot9RfvqVe` | `empowr-session-ticket` |

**Orphaned (first attempt, wrong uid — harmless, no delete endpoint found, safe to ignore):** Template `670y5xsYysSx0QGqHwyjOW`, Production `1juRXlbA6zqEEFWNGSIBny`, Ticket Type `0YSfJ5boLqM4lMhR6j8aeB`. A throwaway test venue (`3N7SGGq9s2rOHylbVmV7rY`, uid `test-venue-delete-me`) and test ticket (`6kdTbgff3vX92NLZUSmVoK`) also exist from the end-to-end proof below — both clearly named, safe to leave or delete once a Venue/Ticket delete path is found.

> **⚠️ Superseded in part — read Step A9 before acting on this paragraph.** Verified 2026-08-05: Apple Wallet passes *do* install today (signed under PassKit's shared cert); `passTypeIdentifier` is actually empty on the live object; and the "Google Wallet unaffected" claim is wrong. The real blocker is DRAFT mode's test stamp + 2-day pass expiry.

**Blocked: Apple Wallet passes won't work for real users yet.** `passTypeIdentifier` is set to `pass.com.empowrcic.members` (a real value, chosen now so nothing needs to change later) but Apple requires a paid Apple Developer Program membership to register that Pass Type ID and generate a signing certificate, which then gets uploaded to PassKit against this Production. **As of 2026-07-21, that membership is in progress, not yet confirmed.** Until the cert is uploaded, PassKit rejects `PROJECT_PUBLISHED` status — the Production was created with `status: ["PROJECT_ACTIVE_FOR_OBJECT_CREATION", "PROJECT_DRAFT"]` instead (server error confirmed: status must contain either `PROJECT_DRAFT` or `PROJECT_PUBLISHED`, and `PROJECT_PUBLISHED` alone was rejected as "account not eligible for production use"). **Once the cert is ready: flip Production status to include `PROJECT_PUBLISHED` instead of `PROJECT_DRAFT`** (exact update mechanism — POST to `/eventTickets/production` again with the same `id`, or a dedicated update endpoint — not yet confirmed, treat as a fresh small investigation). Google Wallet is a separate mechanism and should be unaffected by this gap.

**Confirmed REST paths** (base `https://api.pub1.passkit.io`, all POST unless noted):
- `/images` — create (bundles icon/logo/appleLogo etc. in one call, returns an `imageIds`-shaped object)
- `/template` (singular, NOT `/templates`) — create. `/templates/list` and `/templates/count` (plural) are the read endpoints — **the create path breaks the plural-resource-root naming pattern the reads follow**, found via a help.passkit.com article, not guessable from the reads.
- `/eventTickets/production` — create
- `/eventTickets/venue` — create
- `/eventTickets/ticketType` — create
- `/eventTickets/ticket/id` — issue a ticket (confirmed from help.passkit.com's "Create an event ticket" article)
- No Event — Create call exists or is needed (see below)
- `/eventTickets/venue/{id}` (GET) — read a venue by id; `/eventTickets/venue` (DELETE, body `{"id": "..."}`) — hard-delete
- `/eventTickets/ticket/id/{id}` (GET) — read a ticket by id; `/eventTickets/ticket` (DELETE, body `{"ticketId": "..."}` — note the different field name from venue's delete) — hard-delete, confirmed void mechanism for Step A7
- Pass install URL is client-constructed, not returned by the API: `https://pub1.pskt.io/{ticketId}` (EU/pub1 region)
- See Step A4 below for the full writeup of how these were found (PassKit's own Golang gRPC-gateway SDK source on GitHub, which lists every registered REST path)

**Critical: the PassKit v4 SDK Postman collection is 100% gRPC** (every request targets `grpc://grpc.{{passkitEnv}}.passkit.io:443`), and its "Message" bodies show the **gRPC wire/reflection shape**, not the REST/JSON-mapping shape our plain Key+Secret JWT approach actually needs. Several fields differ between the two, discovered by iterating live against real (safe, one-time-setup) create calls:
- **Timestamps**: gRPC shows `{"seconds":"...","nanos":0}` (raw `google.protobuf.Timestamp` wire format); REST/JSON needs an **RFC3339 string** instead (e.g. `"2026-07-21T16:36:06Z"`). Applies to `doorsOpen`/`scheduledStartDate`/`actualStartDate`/`endDate`.
- **`metaData`**: gRPC shows an array of `{key, value}` objects; REST/JSON needs a **plain object/map** (`{"offeringTitle": "Roller Disco"}`).
- **Object references** (`production`, `venue`, `ticketType` inside a Ticket — Issue call): gRPC/the example bodies showed flat `productionId`/`venueId`/`ticketTypeId` strings; REST/JSON actually needs **nested objects with both `id` AND `uid`** — e.g. `"production": {"id": "27xx...", "uid": "empowr-sessions"}`. `uid` is a separate user-assigned identifier from PassKit's own `id` (set at create time, defaults to empty if you pass `""`) and **is required when referencing that object elsewhere, not just at creation** — always give every created object a real, non-empty `uid`.
- **Template reuse constraint**: a Template can only be the before/after-redeem template of **one** Ticket Type at a time — reusing one across ticket types 409s ("before redeem template is already in use"). Each distinct Ticket Type needs its own Template (or its own before/after pair).
- **`landingPageSettings.localizedTextOverrides`**: object/map (`{}`), not an array, despite the plural name.
- **`barcode.format`**: bare enum value `"QR"`, not `"QR_CODE"`.
- Errors are gRPC-gateway JSON (`{"error": "..."}`, sometimes with a byte-offset proto parse error, sometimes a named `validation err:` message) — the validation errors are precise and safe to iterate against live (one-time setup calls have no side effects on a 400).

**No separate "Event" object needs to be created.** Confirmed empirically: issuing a ticket with `event: {production, venue, doorsOpen, scheduledStartDate, actualStartDate, endDate}` inline **auto-creates** an Event behind the scenes and returns its `eventId` in the response — there is no Event — Create call in the API at all. This means Step A5 (issue-on-confirm) never needs to pre-create or store a PassKit Event per occurrence; every ticket issuance just carries its own timestamp snapshot.

**Architecture confirmed**: one shared Production, one shared Ticket Type, one shared Template (all created above) — Venue is the only object that needs one-per-real-venue. **`mem_venues` is currently empty** (no real venues seeded yet, real-timetable work still gated on Q6/Jasmine) — so Venue creation is **not** backfilled here; instead it gets wired into the admin venue create route (`POST /api/admin/venues`) so every future real venue automatically gets a `passkit_venue_id`, give-or-take Step A3's migration adding that column.

**JWT auth recipe** (working, proven — see Step A0 above for the full writeup): claim `uid` (not `key`), no `url`/`method` claims, `Authorization: Bearer <jwt>` (not `PKAuth`), 60s-backdated `iat` for clock-skew tolerance. Reusable `lib/passkit.ts`-shape helper functions were prototyped in a scratch PowerShell script this session (`Get-PassKitCreds`, `New-PassKitJwt`, `Invoke-PassKitRaw`) — port this logic directly into the real TypeScript client in Step A4, don't rediscover it.

### Step A3 — Schema migration — DONE (2026-07-21)
- `passkit_pass_id text` (nullable) on `mem_bookings`; `passkit_venue_id text` (nullable) on `mem_venues`. Migration `20260721180000_members_passkit_columns.sql`, applied via MCP, `_config/registry/supabase.md` updated. No RLS change (columns ride existing policies; writes are service-client only).

### Step A4 — `lib/passkit.ts` — DONE (2026-07-21), e2e-proven for the venue half
- Built `createPassKitVenue()`, `issueSessionPass()`, `voidPass()` — plain `fetch` + hand-rolled JWT (Node `crypto`, no new dependency), never-throw (log + return null/bool), same contract as `sendEmail()`.
- **New confirmed REST facts, discovered live this session while building the client** (not in Step A2's table above — read these before touching `lib/passkit.ts` again):
  - **`GET /eventTickets/venue/{id}`** works directly (no `/id/` sub-segment, unlike tickets below) — returns the venue's stored shape: `{id, uid, name, localizedName, address, localizedAddress, timezone, gpsCoords: [], eventUrls, room, created, updated}`. **`address` is a flat string**, not a nested Address object — simpler than the ticket/event gotchas implied.
  - **`GET /eventTickets/ticket/id/{id}`** (note: `ticket/id/` then the real id — a 3-segment path, confirmed via the PassKit Golang gRPC-gateway SDK's `a_rpc.pb.gw.go` on GitHub, which lists every REST path PassKit's mux registers). Returns the full ticket incl. `status` (`"ISSUED"`), `passMetaData.status` (`"PASS_ISSUED"`), the resolved `event`/`venue`/`ticketType` sub-objects, `metaData`.
  - **Delete endpoints use different body field names per resource** — easy to get wrong: `DELETE /eventTickets/venue` wants `{"id": "<venueId>"}`; `DELETE /eventTickets/ticket` wants `{"ticketId": "<ticketId>"}` (NOT `id`). Both are **genuine hard deletes** — confirmed live: a deleted ticket's `GET .../id/{id}` 404s immediately after (`"ticket with id[...] does not exist"`), there's no soft-void state. This is what backs `voidPass()`.
  - **Pass install URL is NOT returned by the issue-ticket response** — the response is just `{ticketId, productionId, venueId, ticketTypeId, eventId}`. The URL is constructed client-side: `https://pub1.pskt.io/{ticketId}` (EU/pub1 — matches our API region; the US mirror is `pub2.pskt.io`), confirmed via help.passkit.com's "Introduction to distributing passes" article, not an API field.
  - **Convention adopted for `lib/passkit.ts`**: every object we create gets `uid` = that object's own Supabase row id (`mem_venues.id` for venues, `mem_bookings.id` for tickets) — makes every PassKit object traceable back to its DB row without a separate lookup table.
- **`createPassKitVenue()` e2e-proven live** (2026-07-21): inserted a real `mem_venues` row, created its PassKit Venue, persisted `passkit_venue_id`, GET-verified the round-trip (name/uid/address all matched), then deleted both sides — zero leftover rows on either system. `issueSessionPass()`/`voidPass()` are not yet e2e-proven end-to-end as wired code (the underlying REST shapes they use *were* proven live during Step A2/A4 probing — issuing and hard-deleting a real test ticket both succeeded) — Step A8 is where they get exercised through the real booking flow.

### Step A5 — Issue on confirmation — DONE (2026-07-21)
- New `issuePassesForSession(service, checkoutSessionId)` orchestrator in `lib/notifications.ts` (colocated with the email orchestrator, not in `lib/passkit.ts` — keeps all Supabase-row-shape mapping in one place, matches Step A6's need to reuse the same rows). Called from the webhook's first-confirm branch, right before `sendBookingConfirmationForSession`.
- Queries confirmed booking rows for the session with occurrence/course_run → offering → venue nested selects (mirrors `BOOKING_EMAIL_SELECT`'s shape). One `issueSessionPass()` call **per booking row** (= per participant, since `mem_bookings` already has exactly one row per participant per occurrence/run — confirmed from the `uniq_mem_booking_participant_occurrence`/`_run` constraints, so no extra "one per participant" logic was needed).
- **Course runs (`per_run`): one pass spans the whole run** — implemented by pulling every occurrence under that `course_run_id` (nested `occurrences:mem_occurrences(starts_at, ends_at)`) and taking min(starts_at)/max(ends_at) as the ticket's `doorsOpen`/`endDate` window, since `mem_course_runs` itself only has `starts_on`/`ends_on` **dates** (no time-of-day) — the per-occurrence timestamps are the only source of real start/end times.
- Rows whose resolved venue has no `passkit_venue_id` yet (venue predates the PassKit wiring, or PassKit venue-creation failed) are **skipped silently** — a missing pass must never block a confirmed, paid booking.
- Not yet e2e-proven live (needs a real Checkout session + seeded venue with a real `passkit_venue_id` — that's Step A8). Verified via clean `next build` only.

### Step A6 — Pass link in the confirmation email — DONE (2026-07-21)
- `passInstallUrl(passId)` extracted as a small exported helper in `lib/passkit.ts` (both `issueSessionPass()` and the email orchestrator now share it, instead of the URL format living in two places).
- `BookingEmailSummary` (`lib/emails/types.ts`) gained `passInstallUrls: (string | null)[]`, same index order as `participantNames` — built in `summariseRows()` by reading each row's `passkit_pass_id` (added to `BOOKING_EMAIL_SELECT`). This relies on Step A5's `issuePassesForSession` having already persisted the id **before** `sendBookingConfirmationForSession` runs its own fresh query — the webhook awaits A5 first, so this is safe without any explicit hand-off between the two functions.
- `lib/emails/booking-confirmation.ts`: one `ctaButton` per participant with a non-null install URL — label is "Add to Apple/Google Wallet" for a single participant, or "Add {first name}'s pass to Wallet" per participant when there's more than one (so they're distinguishable). Participants with no pass (skipped in A5) just get no button — never a broken link.

### Step A7 — Void on cancellation — DONE (2026-07-21)
- Member self-serve cancellation was removed 2026-07-21 (no-refund policy change) — the only cancel path left is admin occurrence-cancel (`POST /api/admin/occurrences/[id]/cancel`). Added `passkit_pass_id` to that route's booking select/type; after each confirmed booking's status flip to `refunded`/`credited` succeeds, `voidPass()` fires if `passkit_pass_id` is set. `voidPass()` is already never-throw internally, so no extra try/catch was needed — it genuinely cannot block the refund/credit it follows.
- Pending (`pending_payment`) bookings released by the same route never had a pass issued (Step A5 only fires on confirm), so nothing to void there.

**A5/A6/A7 combined verification**: clean `next build` (typecheck + lint + all 17 routes compile) after each step. **Not e2e-proven live** — needs a seeded venue with a real `passkit_venue_id`, a real occurrence, and a TEST-mode Checkout session run through a dev webhook; that's the whole of Step A8 below.

### Step A8 — e2e + deploy — e2e proof DONE (2026-07-21), deploy still pending
Seeded a real venue/offering/occurrence/account/participant/booking directly via the service client (Step 4/7 e2e pattern), created a real PassKit Venue the same way `POST /api/admin/venues` does, then drove the **real, running app** through its actual code paths rather than reimplementing them:
- **Issue**: self-signed a `checkout.session.completed` event (`stripe.webhooks.generateTestHeaderString`, the project's established local-webhook pattern) and POSTed it to the dev server's real `/api/webhooks/stripe`. Confirmed `mem_bookings.passkit_pass_id` persisted, then `GET /eventTickets/ticket/id/{id}` against PassKit returned the real ticket, correctly tied to the shared Production.
- **Email link**: read the confirmation email back via the Gmail MCP (`teams+passkit-e2e-<ts>@empowrcic.org`, per the plus-addressing convention in memory) — the "Add to Apple/Google Wallet" button's href matched `https://pub1.pskt.io/{ticketId}` exactly.
- **Void on cancel**: needed a *real authenticated admin request*, not a reimplementation of the route's logic. Pattern used (reusable for future admin-route e2e proofs): temporarily appended a `teams+…@empowrcic.org` address to local `.env.local`'s `ADMIN_EMAILS` (never touched the vault/Netlify), restarted the dev server, used `service.auth.admin.generateLink({type:'magiclink', email})` to get a real `hashed_token`, then GET'd the app's own `/auth/callback?token_hash=…&type=magiclink` with a curl cookie jar — this hits the exact same `verifyOtp` branch a real magic-link email would, without needing to read an inbox for the link itself. The resulting session cookie authenticated a real `POST /api/admin/occurrences/[id]/cancel` (outcome `credit`, to stay self-contained without a real Stripe refund). Confirmed: booking flipped to `credited`, `mem_credits` row created, the occurrence-cancelled email arrived, and — the actual point — `GET` on the ticket now 404s (`"ticket with id[...] does not exist"`), proving `voidPass()` fired for real.
- **New fact surfaced**: PassKit's `DELETE /eventTickets/venue` refuses with `"cannot delete venue because it is used by event(s)"` once a ticket has been issued against it — the auto-created Event (see Step A2/A4) holds a reference even after the ticket itself is hard-deleted, and no Event-delete endpoint was found (matches Step A2's "no Event — Create call exists" finding; there also isn't a Delete one). The test venue (`7rtcEXDNfgwJCkTAxnw210`, uid = a deleted `mem_venues` row, clearly named "A8 E2E Test Venue") was left as a harmless orphan, same precedent as Step A2's orphaned objects.
- **Cleanup**: all seeded Supabase rows (venue, offering, occurrence, participant, booking, credit) and both test auth users deleted, `ADMIN_EMAILS` reverted, temp scripts removed — verified zero leftover rows. Only the harmless orphaned PassKit venue above remains, matching precedent.
- **Not yet done**: install the pass on a real phone (Apple + Google) — template rendering can't be asserted from code, still worth a manual check post-deploy. Apple Wallet is still blocked on the pending Developer cert regardless.
- **Deploy**: `PASSKIT_API_KEY`/`PASSKIT_API_SECRET` were already pushed to Netlify at Step A1 — confirm before merging that they're still set (fail-soft means a missing key silently produces zero passes, not an error). Then deploy via git push. Update registries (`third-party-services.md`, `env-vars.md`) if not already current, project memory.md + DEVLOG (done), and the cross-session memory file `project_empowr_members_passkit.md` (done).

### Step A9 — pre-launch verification (2026-08-05) — CORRECTS several Step A2/A8 conclusions

Run as launch prep while the Apple Developer account was still pending. Four findings, two of them corrections to what's written above.

**1. `lib/passkit.ts` was silently broken in production — fixed.** The `iat` backdate was exactly `60`, and PassKit rejects any token whose `iat` is **60s or older** with `{"error":"jwt was issued too long ago"}`. That put every single call on the rejection boundary, decided by network latency. Measured against a local clock verified accurate to 0.9s (compared to PassKit's own `Date` response header): **0/12 accepted at 60s backdate, 12/12 accepted at 10s.** Because every export here is never-throw, this failed silently as "no pass issued" — no error, no alert, nothing in the DB. Now `JWT_IAT_BACKDATE_SECONDS = 10`. **Do not raise it back toward 60.** The Step A0 note above (backdate 60s to fix "Token used before issued") is superseded: a backdate of 0 was also accepted in this run, so that original symptom was transient clock skew, not a standing requirement — a small backdate is insurance against forward skew only.

**2. Apple Wallet is NOT functionally blocked by the missing cert — the Step A2 blocker note is wrong about the mechanism.** Passes issue and install *today*. Verified by downloading the real `.pkpass` and unzipping it: 33KB, complete bundle (icons, logos, `pass.strings`, `manifest.json`) with a **present 3314-byte `signature`**. It is signed under **PassKit's own shared certificate** — `passTypeIdentifier: "pass.io.passkit.dev"`, `teamIdentifier: "SSUX2R6S8X"` — with `organizationName: "Empowr CIC"` correct.

  **What actually blocks launch is DRAFT mode, and it's worse than a missing cert.** Every pass issued while the Production is `PROJECT_DRAFT` carries:
  - a back-field headed **"Test Pass - Not for Commercial Use"**, whose body reads *"This pass is for testing and demonstration purposes only and will expire automatically two days after issue."*
  - a hard **2-day expiry** — confirmed: `expirationDate` was exactly issue time + 48h.

  A member booking a session more than two days out would get a pass that expires before the session, stamped "not for commercial use". So passes must stay **off** until the Production is published. The Apple cert is still the gate — it's what unlocks `PROJECT_PUBLISHED` — but the reason is the test-mode stamp and expiry, not pass signing.

**3. "Google Wallet is unaffected by the Apple gap" (Step A2) is wrong.** The install page is UA-aware, but on Android it does **not** hand off to native Google Wallet — it links to `https://walletpass.io?p=passkit&u=<the same .pkpass URL>`, a third-party pkpass reader app. Android therefore serves the **identical `.pkpass`**, and inherits the identical test disclaimer and 2-day expiry. There is no Android path that routes around the DRAFT restriction. **Confirmed at template level** (`GET /template/data/{id}`): `googlePaySettings.passType` is literally **`GOOGLE_PAY_NOT_SUPPORTED`**, with `preferredAndroidWallet: "ANDROID_WALLET_WALLETPASSES"` and `preferThirdPartyAndroidWallet: "OFF"`. Native Google Wallet is switched off on this template, not merely unconfigured — enabling it is its own piece of work, not a side effect of publishing.

Also from the template: `expirySettings.expiryType` is `EXPIRE_NONE`, which confirms the 2-day expiry is imposed purely by DRAFT mode and will disappear on publish rather than needing a template edit.

**4. Three pass-content bugs found. Two fixed and verified; one needs a template change.** `pass.json` addresses fields by key and resolves them through `en.lproj/pass.strings`; reading that mapping shows what a member would actually see.

  - **✅ FIXED — the QR code was broken.** `barcode.message` was the literal string `"missing: ticketNumber"` under `altText: "Scan at the door"`, so door scanning could not work. The template's `barcode.payload` is `${ticketNumber}`, but **that placeholder does not resolve from the stored `ticketNumber`** — setting `ticketNumber` alone leaves the QR broken (verified: the value persisted on the ticket and enforced uniqueness, yet the pass still rendered "missing: ticketNumber"). **`barcodeContents` overrides the payload directly and does work.** Both are now set to `mem_bookings.id`.
  - **✅ FIXED — the "Name" field was empty.** We never sent `person`. Now sends `person: { displayName }` from `mem_participants.name`, threaded through `PASS_ISSUE_SELECT`. Verified rendering as a real name.
  - **⚠️ OPEN — `custom.offeringTitle.value` is still empty.** This is the pass's *primary field*, the largest text on it, labelled "Session". Tested both metaData key formats — `"offeringTitle"` and the fully-qualified `"custom.offeringTitle"` — and **neither populates it**; the value stores on the ticket but never reaches the pass. The likely cause is in the template itself: that field is `fieldType: CUSTOM_FIELDS` with **`userCanSetValue: false`** and an empty `defaultValue`, i.e. not settable per-pass at all. `passOverrides` is not a route either — it only carries images, colours, locations, beacons and links, no text values. **Fixing it is a template change, not a payload change**, and it's a design decision rather than a bug fix: either flip `userCanSetValue` to true on that field (`PUT /template`) and re-test, or drop the custom field and render the session name from a protocol field tied to the auto-created Event. Left open deliberately. Until it's resolved, passes show the venue, date, time, participant name and a working QR, but no session title.

  **Bonus from the fix**: `ticketNumber` must be unique per production, so setting it to the booking id makes a repeat issue for the same booking return 409 instead of minting a second pass — a free idempotency guard, and the 409 is swallowed by the never-throw contract. Verified live.

**Technique worth reusing: pass rendering CAN be asserted from code.** Step A8 concluded it "can't be asserted from code, still worth a manual check on a real phone". That is not true — `GET https://pub1.pskt.io/{ticketId}.pkpass` returns the real bundle; unzip it and read `pass.json` + `en.lproj/pass.strings` to see exactly what the member sees, no device needed. This is how all three bugs above were found, and it should be the standard check after any template change. A real-device check is still worth doing once for visual/layout confirmation, but it is no longer the only way to catch content faults.

**Live state confirmed this session** (Production `27xx6YlVGWi65uxtO1mNbB`):
- `status: ["PROJECT_ACTIVE_FOR_OBJECT_CREATION", "PROJECT_DRAFT"]` — unchanged.
- **`passTypeIdentifier` is `""` (empty)** — the Step A2 claim that it was "set to `pass.com.empowrcic.members`, chosen now so nothing needs to change later" does not hold; the value never persisted on the live object. Expect to set it as part of the cert flow.
- `POST /certificates/apple/list` returns empty — no Apple certificate uploaded yet.
- 8 orphaned test venues exist on the account (5 × "Super Arena" from 2026-07-09, 2 × "TEST VENUE - DELETE ME", 1 × "A8 E2E Test Venue"). Harmless but untidy; most cannot be deleted (see Step A8's venue/event reference finding). Production `mem_venues` is empty, so none are real.

### Cert-day runbook (validated endpoints, 2026-08-05)

Found by reading `io/a_rpc_certificates.pb.gw.go` and `io/event_tickets/a_rpc.pb.gw.go` in `github.com/PassKit/passkit-golang-grpc-sdk` — the same gRPC-gateway-source technique used in Step A2. The whole flow is API-driven; none of it needs the PassKit dashboard.

| Step | Call |
|---|---|
| 1. Get a CSR from PassKit | `GET /certificate/certificate_signing_request` → returns a PEM `CERTIFICATE REQUEST` body |
| 2. Register Pass Type ID + upload that CSR at developer.apple.com, download the `.cer` | *(manual, Apple portal)* |
| 3. Upload the signed cert back | `POST /certificate/apple_certificate` (body type `FileBytes`) |
| 4. Confirm it landed | `POST /certificates/apple/list`, or `GET /certificate/{passTypeId}` → `CertificateData` (teamId, validFrom/validTo) |
| 5. Publish the Production | `PATCH /eventTickets/production` (partial) or `PUT /eventTickets/production` (full replace), body includes `id` + `status` |
| 6. Verify | `GET /eventTickets/production/{id}` shows `PROJECT_PUBLISHED`; then issue one ticket and unzip its `.pkpass` — the "Test Pass" back-field and the 2-day `expirationDate` must both be gone |
| 7. Turn issuance back on | Set `PASSKIT_ENABLED=true` on Netlify (production context). Until this is set, `issueSessionPass()` returns null without calling PassKit — see the kill switch below. **Do step 6 before step 7**, not after |

**Critical gotcha — do NOT pre-fetch and store the CSR.** `GET /certificate/certificate_signing_request` returns a **different CSR on every call** (verified: two calls 2s apart returned different SHA-256 hashes), i.e. a fresh keypair each time, and PassKit holds the private key. Fetch the CSR only at the moment you are ready to upload it to Apple, and do not call the endpoint again before posting the `.cer` back — a later call may orphan the keypair the certificate was issued against.

### Kill switch — `PASSKIT_ENABLED` (added 2026-08-05)

`issueSessionPass()` returns null without calling PassKit unless `process.env.PASSKIT_ENABLED === "true"`. **Off is the default and requires no env var to exist**, so the safe state cannot be lost by someone clearing a variable.

Added because seeding the real catalogue (2026-08-05) gave every `mem_venues` row a real `passkit_venue_id`, which completed the issuance path — from that moment a live booking would have produced a DRAFT-mode pass stamped "Test Pass - Not for Commercial Use" and expiring in 48h. Passes must stay off until the Production is published.

Scope is deliberately narrow — the flag gates **only** issuance:
- `createPassKitVenue()` is **not** gated. It produces nothing member-facing, and keeping it live means new venues stay wired for the day passes turn on. Gating it would recreate the null-`passkit_venue_id` trap where passes silently never issue for venues added while the flag was off.
- `voidPass()` is **not** gated. Revoking an already-issued pass must always work, independent of whether new issuance is switched on.

A member's experience with issuance off is a normal booking and confirmation email with no wallet button — `booking-confirmation.ts` already omits the button for any participant without a pass rather than rendering a dead link (Step A6), so nothing degrades.

(The previously-noted zero-code alternative — unsetting `PASSKIT_API_KEY` so `getJwt()` throws into the never-throw wrapper — also works, but logs an error per booking and is easy to undo by accident. The flag was chosen for explicit intent.)

**Caveat on step 5**: on the `Production` message, both `status` and `passTypeIdentifier` carry `validateUpdate:"-"`, which may mean the server ignores them on update. If the PATCH/PUT is accepted but `status` doesn't change, publishing likely has to go through the PassKit dashboard instead. Untested — there is nothing to publish against until the cert exists.

## Track B — pointer only (do not build yet)

Needs: Q1 answer (plan definitions — a KB-derived provisional model exists: per-session-type plans from the weekly timetable, £30 floor / £50 Roller Disco, interpolated prices provisional; **not yet ADR'd — get user go-ahead before recording**), then Phase 2 Steps 2–3 (Stripe Billing + subscription lifecycle), then a Members/Loyalty template + issuance/update/void hooks in the subscription webhook. Reuses A's client and credential wiring.

## References
- Docs: https://docs.passkit.io/ · Quickstart: github.com/PassKit/passkit-node-quickstart
- Scoping conversation: 2026-07-15/16 session (see memory `project_empowr_members_passkit`)
- Entitlement intake for Track B's gate: [../phases/phase-2/entitlement-intake.md](../phases/phase-2/entitlement-intake.md)
