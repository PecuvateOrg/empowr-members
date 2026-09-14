# Spec — Admin manual booking (payment taken separately)

**Status: PROPOSED 2026-09-14.** Not built. Written after two members failed
camp checkout on consecutive evenings and staff had no way to help either of
them — see
[incidents/2026-09-14-onelink-member-lockout.md](../incidents/2026-09-14-onelink-member-lockout.md).

---

## Why this is needed

**A member who cannot get through Stripe Checkout cannot be booked by anyone,
by any means.**

The walk-in feature (built 2026-08-28) closed the "member turned up without
booking" gap, but it closed it *through Stripe Checkout*. Every booking-creating
path in the product still ends at a Stripe payment page:

| Path | Creates a booking? | Requires Stripe Checkout? |
|---|---|---|
| `POST /api/bookings` (member) | yes | **yes** |
| `POST /api/memberships/subscribe` | no (webhook does) | **yes** |
| `POST /api/admin/walk-ins` | yes | **yes** |
| every other admin route | no | — |

So when Checkout itself is the obstacle, there is no fallback. Observed
2026-09-13/14: two members, both buying the £55 October camp, both with **zero
PaymentIntents** — neither ever reached the card form. One reported being stuck
behind a Onelink passcode sent to a mistyped phone number. Staff could do
nothing but tell her to fix a Stripe consumer account Empowr cannot see.

This is not an Onelink feature. Onelink is one cause. The same dead end applies
to a declined card, a wallet loop, a member who phones in, a member without a
card, a bursary place, a staff child, or a place already paid by bank transfer.

**Note the second, independent gap the same incident exposed:** walk-ins takes
an `occurrence_id`, so it cannot sell a **course run** (camp) place *at all*,
even when Stripe is working perfectly. This spec covers both.

---

## What already exists and can be reused

| Piece | State | Reuse |
|---|---|---|
| `mem_booking_source` value `member` | Exists, **never written by anything** | Candidate for the new source, or add `manual` — see Open questions |
| `mem_booking_status` | `pending_payment, confirmed, cancelled, credited, refunded, attended, no_show` | Needs no new value; a manual booking goes straight to `confirmed` |
| `mem_hold_bookings(uuid, uuid[], uuid, uuid, integer)` | Row-locked capacity check + price snapshot + hold | **Reuse for occurrences.** It is the only safe capacity path; do not hand-roll an INSERT |
| `getAuthedAdmin()` / `getAuthedCheckinStaff()` in `src/lib/admin.ts` | Built, email-allowlist based | Gate on `getAuthedAdmin()` — see Authorisation |
| Waiver gate (`checkWaivers` / `persistWaiverMatches`) | Fails closed on every booking path | **Must run here too** |
| Age eligibility (`ageEligibleForPlan`, `planAgeBounds`) | Built | Must run here too |
| Booking confirmation email + ticket | Fired from the Stripe webhook | Needs a non-webhook trigger — see Notifications |

---

## What this is NOT

- **Not a refund or discount tool.** It records that a place is taken and how
  the money was handled. It does not move money. Stripe remains the only thing
  that charges a card.
- **Not a way to bypass the waiver.** The waiver gate is a safeguarding control,
  not a billing step. It fails closed here exactly as everywhere else. A member
  without a signed waiver cannot be manually booked either.
- **Not available to check-in staff.** See Authorisation.

---

## Behaviour

### Entry point

Admin → the occurrence or course run → **Add booking manually**.

Staff pick: participant(s) → payment handling → optional note → confirm.

### Gates, in the same order as every other booking path

1. Participants resolve to **one account** (mixed accounts refused).
2. **Age eligibility** against the offering's bounds.
3. **Waiver — fails closed.** No signed waiver, no booking.
4. **Capacity** — atomic, via `mem_hold_bookings()` for occurrences.

Nothing is recorded until all four pass. The only gate that differs from the
member path is that there is no payment step.

### Payment handling — required, not optional

Staff must choose one, and the choice is stored, not free text:

| Value | Meaning |
|---|---|
| `paid_bank_transfer` | Money received outside Stripe |
| `paid_stripe_manual` | Charged via the Stripe Dashboard, not this app |
| `comp` | Deliberately free — bursary, staff child, goodwill |
| `owed` | Place held, money not yet received |

`price_paid_pence` is snapshotted as normal. For `comp` it is `0`; the chosen
price must still be recorded separately so a comped place does not silently
become a £0 place in revenue reporting.

**Why an enum and not a note:** a free-text reason drifts from the data and
nothing validates it. A comped place and an unpaid place are materially
different and finance has to be able to tell them apart without reading prose.

### Audit trail — mandatory

Every manual booking records **who created it, when, and why**:

- `created_by_user_id` — the admin's `auth.users.id`, not an email string
- `payment_handling` — the enum above
- `note` — free text, optional, for the human story
- `created_at`

This is the control that makes the feature safe. A path that creates a confirmed
booking with no money moving is a way to give away paid places; it is acceptable
only because every use is attributable.

Surface it: manual bookings should be visibly marked as manual in the admin
booking list and on the register, never indistinguishable from a paid booking.

---

## Authorisation

**`getAuthedAdmin()` only — not `getAuthedCheckinStaff()`.**

Check-in staff are a deliberately wider group (`CHECKIN_EMAILS`) who work the
door on a phone. Walk-ins is correctly available to them because it *takes
money*. This route gives away places, so it belongs to the narrower
`ADMIN_EMAILS` group.

Do not widen this later without revisiting the audit trail.

---

## Notifications

The booking confirmation email and ticket currently fire from the **Stripe
webhook**, which will never run for a manual booking.

The member must still receive their ticket — a booking the member cannot see is
worse than no booking, because staff believe it exists. Extract the
confirmation-send from the webhook handler into a function both paths call.

Do not copy it. Two send paths will drift, and the one that drifts is the rarely
exercised one.

---

## Course runs — the second gap

Walk-ins takes an `occurrence_id` and cannot book a course run. This route
**must** accept either:

- `occurrence_id` → use `mem_hold_bookings()`, then confirm
- `course_run_id` → capacity check against `mem_course_runs.capacity`

There is no row-locked RPC for course-run capacity today. Write one, mirroring
`mem_hold_bookings()`. Do not do a read-then-insert: two admins booking the last
camp place at once would both succeed.

---

## Open questions

1. **`member` or a new `manual` source value?** `mem_booking_source.member`
   exists and is unused. It may have been declared for exactly this, or for
   something else — check the original migration's intent before consuming it.
   A wrong reuse is harder to unpick than a new value.
2. **Should `owed` bookings expire?** A place held for money that never arrives
   is the same problem holds were invented for. Suggest: no automatic expiry
   (it would cancel a real child's place), but a visible "unpaid manual
   bookings" list for admin.
3. **Refunds.** If a `paid_bank_transfer` booking is cancelled, Stripe knows
   nothing about the money. The cancel path must not silently attempt a Stripe
   refund and must tell staff to handle it manually. **Check the existing cancel
   path before building** — per project memory, refunds and cancellations have
   never actually run in production.
4. **Does this need to appear in analytics funnels?** A manual booking has no
   funnel. It should probably be excluded from conversion metrics rather than
   counted as a conversion with no journey.

---

## Sizing

Small-to-medium. Most of it is reuse: the gates, the RPC, the customer
resolution and the confirmation email all exist. The genuinely new work is the
course-run capacity RPC, the `payment_handling` enum and audit columns, the
admin UI, and extracting the confirmation-send out of the webhook.

The riskiest part is not the code — it is that this is the first path in the
product that creates a confirmed booking without money moving. Build the audit
trail first, not last.
