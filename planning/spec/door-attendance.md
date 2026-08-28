# Spec — Walk-in booking at the door

**Status: BUILT 2026-08-28** (branch `feat/door-walk-ins`, commit `775316d`). All four open questions were answered before the build — self-registration for strangers, Stripe Checkout, existing hold expiry plus an explicit release, standard Stripe receipt. The Open questions section below is kept for the record with each answer recorded against it.

**Three things this spec got wrong or missed**, all found in the code and fixed in the build — read these before trusting the rest of the document:

1. **`mem_hold_bookings()` required `starts_at > now()`.** The spec listed the RPC as "correct shape for this" and reusable unchanged. It was not: it would have refused every walk-in on a session that had already started, which is most of them. Walk-in mode tests `ends_at > now()` instead.
2. **Only two active offerings carry a `walk_in_price_pence`** — Skate Jam (£10) and Roller Skate Events 15+ (£20). Sk8 Skool for Kidz, Sk8 Skool for All Ages and SYNKRON8 are all NULL, so the door panel refuses them by design. **This is an Empowr decision, not a bug**: the door price has to be set on each offering before walk-ins work there.
3. **`/admin/checkin` hid a session the moment it started.** Its own doc comment said a rolling window "would hide a session that began ten minutes ago — exactly when the register is most needed", but the query under it filtered `starts_at >= now()`. Fixed, since it was the only route to the door panel.

**Known limit, deliberate: departure consent is not captured at the door.** It is a per-booking judgement (2026-08-10 decision) and there is no door step for it; defaulting it from `mem_participants.default_travel_method` would fabricate a parent's answer. The panel warns staff for any under-18 to collect it as they do today. Adding a door step for it is the obvious next increment.

**Card only.** Empowr operates as a non-cash business. Cash and bank transfer are out of scope.

**Everyone attending is a Member.** There is no pay-as-you-go non-member category. A walk-in is a **member who forgot to book in advance** and turns up wanting to pay at the door.

> **Corrected 2026-08-27.** The first draft of this spec was built on a wrong premise — that non-members needed to be searchable and added as "PAYG attendees". Empowr corrected this the same day: membership is a condition of attending. That removed the spec's single biggest obstacle (non-members cannot be represented in the schema at all) and made most of the remaining work a reuse of the existing booking pipeline rather than a new one. The earlier draft is superseded in full; do not build from it.

---

## Why this is needed

Every booking today is created by a member, through Stripe Checkout, in advance. There is **no admin route anywhere that creates a booking** — the only two admin routes touching `mem_bookings` are check-in (updates status) and occurrence-cancel (refunds).

So a member who turns up without having booked cannot be recorded. Staff can mark an *existing* booking attended (added 2026-08-27), but there is nothing to mark for someone who never booked.

Skate Jam already advertises **£10 on the door** against £7 online, so the door price exists and is published — it is simply unreachable.

---

## What already exists

Because a walk-in is a member paying by card, almost the entire pipeline is already built and proven:

| Piece | State |
|---|---|
| `mem_booking_source` value `walk_in` | Exists, **never written by anything**. This feature is what it was declared for. |
| `mem_offerings.walk_in_price_pence` | Exists and populated (Skate Jam £10). Currently **display-only** — shown publicly, editable in admin, consumed by nothing. |
| `mem_hold_bookings()` | Row-locked capacity check, price snapshot, hold with expiry. **Correct shape for this** — there is a payment redirect. |
| `POST /api/bookings` → Stripe Checkout | Creates the session, links it to the holds, extends expiry past Stripe's own. |
| Stripe webhook | Flips holds to `confirmed` on payment, releases them on expiry. **This is the "automatically add them to the session" behaviour** — already built and e2e-proven. |
| `checkWaivers()` / `recordWaiverConsent()` | Works, and members are exactly the population it was written for. |
| `/admin/checkin`, register, `MarkAttendedButton` | Built 2026-08-27. This feature adds to that page. |

**The honest summary: this is mostly an admin-side entry point onto an existing pipeline, not a new pipeline.**

---

## Flow

From a session's register, reached via `/admin/checkin`, a **+ Add walk-in** button:

1. **Search by name** across `mem_participants`
2. **Result shows** the participant, their account, and their **waiver status**
3. **Waiver gate** — see below. No valid waiver means they sign one before anything else proceeds
4. **Age eligibility** checked against the offering's `age_min` / `age_max` on the session date, reusing `isAgeEligible()`. Skate Jam is 15+ and that must not be bypassable at the door
5. **Hold created** at the **walk-in price**, consuming capacity under the same row lock as any other booking
6. **Payment link generated** and handed to the member — QR or link, paid on their own phone
7. **On payment, the existing webhook confirms the booking**, which places them on the register automatically. Nothing new needed here
8. Row shows on the register marked **Paid on the door**, distinct from online bookings

---

## Waiver gate

The rule — no valid waiver, no check-in — is right and already mostly enforceable, because walk-ins are members and `checkWaivers()` was written for members.

Three states, shown explicitly, never inferred:

| State | Door action |
|---|---|
| Valid consent found | Proceed |
| Found but expired or revoked | **Blocked** — sign a new waiver |
| No record found | **Blocked** — sign a new waiver |

Blocked means the control is disabled, not that a warning is shown. The waiver is a UK GDPR Article 9 record and an insurance condition, so a staff override is deliberately not offered.

**Two details that matter:**

**The consent row must be backfilled on every match.** `checkWaivers()`'s fallback path matches only responses on the **active** `form_versions` row — the landmine `mem_waiver_consents` was created on 2026-08-17 to defuse. Bump the waiver wording and everyone covered only by the fallback silently reads as unsigned. `checkWaivers()` already backfills via `recordWaiverConsent()`; the door flow must not bypass that, or a wording change the week before a session blocks a hall full of people.

**Signing at the door needs a route.** Members have an in-app `/waiver` page, so the member can sign on their own phone while standing there. A QR to it at the door would save real time. Worth confirming whether staff should be able to trigger it, or the member simply navigates there themselves.

---

## Pricing

`mem_hold_bookings()` currently snapshots `f.price_pence` — the **online** price. A walk-in must snapshot `walk_in_price_pence` (£10 rather than £7 for Skate Jam).

This is the one real change to the RPC: a walk-in mode that selects the door price and stamps `source = 'walk_in'`. Everything else about it — the row lock, the capacity check, the expired-hold sweep, the price snapshot onto the booking — is unchanged and already correct.

**Where an offering has no `walk_in_price_pence` set, the door flow must refuse rather than silently fall back to the online price.** Charging £7 at the door because a field was blank is a quiet revenue leak that nobody would notice.

---

## Capacity

Walk-ins must consume capacity, or the room can be oversold by exactly the people standing in it. `mem_hold_bookings()` already handles this correctly, with the right fallback (`coalesce(occurrence.capacity, venue.default_capacity)`).

The capacity check must stay **inside the existing row lock**. Doing it in application code reintroduces the race the RPC exists to prevent, and the door is precisely where two staff might add people simultaneously.

Note that capacity is currently **unlimited on every course run** unless explicitly set, because the course-run path has no venue fallback (found 2026-08-27). Courses are unlikely to take walk-ins, but the asymmetry should not surprise anyone later.

---

## Build scope

- **Migration** — a walk-in mode on `mem_hold_bookings()` (door price, `source = 'walk_in'`, confirmed-on-payment as now)
- **New** — participant name-search endpoint (admin-gated); an admin route that creates the hold and returns a payment link; the door UI on the register
- **Reused unchanged** — Stripe Checkout, the webhook that confirms bookings, `checkWaivers()` / `recordWaiverConsent()`, `isAgeEligible()`, the register, `MarkAttendedButton`
- **Not needed** — any `payment_method` column (card is the only method), and any non-member data model

---

## Open questions — all answered 2026-08-27, before the build

1. **ANSWERED: they self-register on their own phone.** A genuine stranger with no membership at all. Membership is a condition of attending, so someone who has never signed up cannot be added. Do they self-register on their own phone at `/signup` and then get searched for — or should staff be able to create the account for them at the door? Self-registration is far less work and keeps the account genuinely theirs, but is slower at a busy door.
2. **ANSWERED: Stripe Checkout.** Payment link mechanism — Stripe Checkout (reuses the existing flow verbatim, including the webhook) or a Stripe Payment Link? Checkout is the smaller build and the better-proven path here.
3. **ANSWERED: existing expiry, plus an explicit release action** — staff can now end a hold early from the register, because a hold consumes capacity for ~41 minutes and the room would otherwise read as full while people queued. Shortening the hold is not an option: Stripe Checkout enforces a 30-minute minimum expiry. Original question: what happens if they never complete payment? The existing hold expiry (30 minutes plus grace, swept by pg_cron) already releases it. Confirm that is acceptable at the door, or whether staff need to see and cancel a pending walk-in explicitly.
4. **ANSWERED: nothing further.** Stripe emails a receipt, and the existing webhook sends the booking-confirmation email with ticket links, unchanged. Original question: receipt. Stripe emails one for Checkout payments. Confirm nothing further is wanted.
