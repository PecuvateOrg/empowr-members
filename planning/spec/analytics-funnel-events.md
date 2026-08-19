# Spec — Booking funnel events (PostHog)

**Status:** Not started. Assessed 2026-08-19, user's explicit call: **consider it, does not block launch.**

**Do not re-litigate whether analytics exists.** PostHog is installed and live on this site (since 2026-07-30) and is confirmed shipping in the served JS bundle. Automatic capture already gives pageviews, referrers, devices, geography, entry/exit pages and time on page. This spec covers the part that is genuinely missing: **nothing measures the booking funnel.**

That funnel is the booking-specific reporting the old Wix platform gave for free, and it is the real gap versus Wix — not instrumentation.

---

## Why this is small

The drop-off points are **already discrete, named branches in the code**. `BookingForm.tsx` distinguishes `waiver_required`, `capacity` and `duplicate` as separate failure paths. Instrumentation is adding a call at branches that already exist, not restructuring anything.

Zero `posthog.capture()` calls exist in the codebase today — this would be the first.

---

## The funnel

| Stage | Event | Where it fires |
|---|---|---|
| 1 | *(automatic pageview)* | `/sessions` — already captured |
| 2 | `offering_viewed` | `/sessions/[slug]` |
| 3 | `booking_started` | `BookingForm` mounts on `/book/[occurrenceId]` |
| 4 | `checkout_redirected` | `BookingForm.tsx` — the `201 + checkout_url` branch |
| 5 | `booking_blocked` | `BookingForm.tsx` — the `waiver_required` / `capacity` / `duplicate` branches |
| 6 | `booking_confirmed` | **Stripe webhook — server-side.** See the warning below. |

Stage 5 is the highest-value event and the one most likely to be skipped. It answers *why* people fall out, which pageviews can never show. Pass the reason as a property rather than splitting into three event names, so the funnel stays one chart.

---

## ⚠️ Stage 6 cannot be captured client-side

Bookings are confirmed by the **Stripe webhook**, not by the browser. `/book/confirmation` only *reads* the booking and auto-refreshes while it waits for the webhook to land.

So a client-side event on the confirmation page measures **"the customer came back to the site"**, not **"the payment succeeded"**. It misses anyone who closes the tab after paying, and the page's own auto-refresh will double-count unless guarded.

**Do the confirmed event server-side from the webhook handler using `posthog-node`.** That is the only source that matches the money. If a confirmation-page event is added as well, name it something like `confirmation_page_viewed` and never treat it as the conversion number.

`distinct_id` for the server-side event: use the same account/user id the browser identifies with, or the funnel breaks across the boundary. `person_profiles` is `identified_only`, and members are logged in by this point, so the id is available.

---

## Properties

Super properties (`site_id`, `org`, `brand`, `site_name`, `site_url`) are already registered globally — do not repeat them per event.

Per-event, useful and safe:

- `offering_slug`, `offering_type`
- `occurrence_id`
- `participant_count`
- `price_pence`
- `has_minor` (boolean)
- `reason` — on `booking_blocked` only: `waiver_required` | `capacity` | `duplicate` | `other`

## 🔴 No PII in event properties

Never send participant names, emails, dates of birth, medical notes, or emergency contacts. **This platform holds children's data**, and analytics properties are the easiest place for it to leak out of the systems that are supposed to hold it. Counts and booleans, never the person.

---

## Consent interaction

The consent banner already exists, so there is no outstanding legal work. `cookieless_mode: 'on_reject'` means that when someone rejects cookies, events **still capture** but anonymously — so funnel *counts* stay complete, while per-person stitching across sessions does not. Funnel percentages remain trustworthy; "how many unique people" is the number that degrades.

---

## Verification

**A Playwright run cannot prove this works.** PostHog blocks headless browsers even with a spoofed user agent. Verification needs a real browser visit followed by a query against the PostHog API. Budget for that separately — the events being present in the code is not evidence they arrive.

This also applies to the *existing* instrumentation, which has never been verified end-to-end because the site has had no real traffic.

---

## Effort

- Verify existing capture works at all: ~30 min (needs a real browser)
- Stages 2–5, client-side: ~1 hour
- Stage 6, server-side via `posthog-node`: ~1 hour, most of it getting `distinct_id` consistent across the client/server boundary

## Constraints

- PostHog free plan: transformations are unavailable — see the workspace memory on backend limits. Traffic here is small enough that volume is not a concern.
- All fleet analytics data from before 2026-07-30 is invalid (the `capture_pageview` bug). Do not compare against it.
- `/posthog-analyse` produces narrative reports across all instrumented sites once data exists.
