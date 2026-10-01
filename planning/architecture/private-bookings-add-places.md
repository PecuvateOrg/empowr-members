# Private bookings — adding places after booking, and gear-only hire

Status: **APPROVED by the owner 2026-10-01**, with a 48-hour cutoff for online additions. Build in progress.
Implements owner decisions 2 and 3 of 2026-10-01 in [../spec/private-bookings.md](../spec/private-bookings.md).
Blocks switching on birthday parties and group coaching; 1-to-1 coaching is live without it.

## How it works today (the constraint)

A private booking has **one** Stripe payment: `mem_hold_private_booking` prices it and records
`paid_places` / `total_places`, the webhook calls `mem_confirm_private_booking` with that one checkout
session. Nothing can add money or places to a booking once it is confirmed.

- **Birthday:** the host pays for N skaters; `total_places = N + 1`. Guests fill places themselves through
  the invite link, which refuses anyone without a signed waiver, and stops at `total_places`.
- **Group coaching:** the host picks every skater from their household when booking, each with equipment.

## The design: a separate "top-up" payment per addition

A new table, `mem_private_booking_topups`: one row per addition, with its own Stripe checkout.

| Column | Meaning |
|---|---|
| `private_booking_id` | the booking it adds to |
| `added_places` | how many skaters it adds |
| `places` | group coaching only: who and what equipment |
| `amount_pence` | price, worked out in SQL (never trusted from the browser) |
| `source` | `online` (host) or `door` (staff at check-in) |
| `status` | `pending_payment` → `confirmed`, or `expired` |
| checkout session / payment intent / `created_by` | the payment and who started it |

Two new SQL functions, the same shape as the booking's own pair:

- **`mem_hold_private_topup`** — locks the booking, checks it is confirmed and not yet started (online: at least 48 hours before the start; door: any time before the end), prices the
  addition, and **reserves** the places: confirmed places **plus other pending top-ups** must stay ≤ 80, so
  two people adding at once cannot overshoot. Pending top-ups expire after 30 minutes (the platform hold).
- **`mem_confirm_private_topup`** — on payment: marks it confirmed, raises `paid_places` / `total_places`,
  and for group coaching inserts the new skaters' places. Runs once per checkout, so a repeated Stripe
  event changes nothing (the same guarantee tested today for bookings).

The Stripe webhook gets one more branch, identified positively by metadata `kind=private_topup` (the
Stripe account is shared with Heroes, so nothing else is treated as ours). The booking's original payment
and its rules are untouched.

**Prices** (all from the booking type row, so changing a price needs no code):
- birthday: £20 per added skater, equipment included
- group coaching: £20 per skater per booked hour, plus £5 equipment hire for each skater hiring

### 1. Online — "Add skaters" on the host's booking page

- Birthday: choose how many more (shows the new total and price) → Stripe → the invite link has that many
  more places. Guests still join through the link, so the waiver rule is unchanged.
- Group coaching: choose skaters from the household (waiver required, same as booking) and equipment →
  Stripe → they appear on the booking.
- **Closes 48 hours before the start** (owner, 2026-10-01: the team and equipment need preparing). After that, additions are made at the door. Enforced in SQL, with the 80 cap, not just in the form.
- Host gets a short confirmation email; staff get the same alert as for a new booking.

### 2. At the door — "Add a paid skater" on the private check-in screen

Reuses the walk-in pattern already in production: staff start it, **the customer pays on their own phone**
through a Stripe link/QR code shown on screen, and the screen updates once Stripe confirms.

- Birthday: staff enter how many extra skaters → payment link → the extra places open on the invite link,
  so each child still signs a waiver before skating.
- Group coaching: staff pick the member's skater (as for a walk-in; waiver checked, fail closed) and
  equipment → payment link → the skater is added and can be checked in.

### 3. Gear-only hire ("pads and helmet, own skates")

- New equipment value `gear` alongside `own` and `hire` (an additive change to the database enum).
- Same £5 as full hire: the SQL price counts `hire` **and** `gear`. Birthday stays included.
- Every form offers three choices: own skates and gear / equipment hire (skates, pads, helmet — size
  needed) / protective gear only (no size).
- Check-in, the staff equipment summary and emails say "Gear only", so nobody prepares skates.
- `mem_hold_private_booking` and `mem_join_private_booking` are updated in the same migration.

## Order and proof

1. **Migration** (one, additive): enum value, top-ups table with RLS + service-role-only grants, the two new
   functions, updated pricing in the two existing ones. Proved first in the PGlite harness
   (`verify:credit-sql`) with tests for: price per type, 80 cap including pending top-ups, concurrent
   top-ups, expiry, a repeated webhook, a top-up on a cancelled or past booking (refused).
2. **Gear-only** in the UI (smallest, ships on its own).
3. **Online add**, then **door add**.
4. **Stripe test-mode run on the LAN preview** of each path, as done for 1-to-1 today, before switching
   birthday and group on.

Each step is its own PR. Migration applied only with owner OK.

## Not included (say if wanted)

- **Removing** skaters or partial refunds: bookings stay non-refundable, per the spec.
- Changing the date or length of a booking.
- A physical card reader at the door: everything is Stripe, paid on the customer's phone.
