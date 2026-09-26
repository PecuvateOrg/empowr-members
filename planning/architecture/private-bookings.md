# Private bookings — build design

Implements [planning/spec/private-bookings.md](../spec/private-bookings.md). This file
is the *how*; the spec is the *what*. Where they disagree, the spec's
"Deliberate changes" section says which one moved and why.

Status: **design, not built.** No schema has been applied and no application
code exists yet.

---

## Why a separate model, not `mem_bookings`

`mem_bookings` is one row per participant per seat on an occurrence or a course
run, priced per row, with capacity counted by rows. A private booking is none of
those:

| | `mem_bookings` | Private booking |
|---|---|---|
| What is sold | A seat | An exclusive time interval |
| Priced | Per participant row | Per booking (tickets, hours, hire) |
| Who attends | Known and paid for at checkout | Birthday guests register *after* payment, from their own accounts |
| Capacity | Row count ≤ capacity | The interval is free or it is not |
| Target | `occurrence_id` XOR `course_run_id` | A date and a start/end time |

Forcing it into `mem_bookings` would mean a third target column on a table
every live checkout, capacity count, register, transfer and cancellation path
reads. None of those paths change under this design: **the basket, walk-ins,
transfer, cancellation and subscriptions are untouched.**

---

## Schema

### Enums

```sql
create type mem_private_kind   as enum ('birthday', 'coaching_one', 'coaching_group', 'custom', 'block');
create type mem_private_status as enum ('pending_payment', 'confirmed', 'cancelled');
create type mem_private_source as enum ('online', 'manual');

-- Shared with planning/spec/admin-manual-booking.md. Created here first so the
-- general manual-booking path reuses it unchanged rather than defining its own.
create type mem_payment_handling as enum ('paid_bank_transfer', 'paid_stripe_manual', 'comp', 'owed');
```

### `mem_private_booking_types` — rates and launch switch

One row per bookable kind. The hold function reads the price from here **under
its lock**, so the client never supplies a price.

| Column | Notes |
|---|---|
| `kind` PK | `birthday`, `coaching_one`, `coaching_group`, `custom` (never `block`) |
| `title` | Customer-facing name |
| `unit_price_pence` | Birthday: per paid ticket. 1:1: per hour. Group: per person per hour. `null` for custom (quoted) |
| `min_places` | Birthday 10 paid tickets, 1:1 exactly 1, group 3 |
| `max_places` | `null` until Empowr sets it (open decision) |
| `hire_price_pence` | Coaching £5 per skater **per booking**, never per hour. Birthday `null` — hire is included |
| `venue_id` | The Ladywell Centre. Set when seeding, **never written into this public repo** |
| `active` | **Seeded `false`.** Online booking is refused until Empowr signs off, so the code can deploy dark |

Seed values, from the Empowr CIC KB (`entities/private-bookings`, supplied by
Empowr 2026-08-17):

| Kind | Unit | Min | Hire |
|---|---|---|---|
| `birthday` | £20 per paid ticket (+1 free birthday place) | 10 | included |
| `coaching_one` | £40 per hour | 1 (fixed) | £5 |
| `coaching_group` | £20 per person per hour | 3 | £5 |
| `custom` | quoted | — | — |

Not a new `mem_offerings` row: offerings are read by the public catalogue,
static params, the capacity RPCs and analytics, and every one of those would
need an exclusion. A separate table has no readers until this feature adds them.

### `mem_private_bookings` — the reserved interval

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `kind` | `mem_private_kind` |
| `status` | `mem_private_status` |
| `source` | `online` or `manual` |
| `starts_at`, `ends_at` | `timestamptz`, `check (ends_at > starts_at)` |
| `during` | `tstzrange(starts_at, ends_at, '[)')`, generated, stored |
| `host_account_id` | `mem_accounts`. **Null only for `block`** (check constraint) |
| `paid_places` | Birthday: paid tickets. Coaching: skaters |
| `total_places` | Birthday: `paid_places + 1`. Coaching: `paid_places` |
| `price_pence`, `hire_pence` | Snapshot at hold time. `price_pence` includes hire |
| `stripe_checkout_session_id` | unique, nullable |
| `stripe_payment_intent_id` | nullable |
| `expires_at` | Hold expiry. Null once confirmed |
| `payment_handling` | `mem_payment_handling`. **Required when `source = 'manual'` and kind is not `block`** |
| `created_by_user_id` | `auth.users.id` of the admin. **Required for `manual` and `block`** |
| `note` | Internal only — manual payment note or block reason. Never rendered to a customer |
| `invite_token` | Birthday only. Random 32 bytes, set on confirmation |
| `cancelled_at`, `created_at`, `updated_at` | |

The overlap rule is a constraint, not application code:

```sql
alter table mem_private_bookings
  add constraint mem_private_no_overlap
  exclude using gist (during with &&)
  where (status in ('pending_payment', 'confirmed'));
```

- **Half-open ranges.** `[15:00, 16:00)` and `[16:00, 17:00)` do not collide.
- **No extension needed.** A single range column uses core GiST. `btree_gist` is
  not installed on this project. There is one bookable space, so venue is not
  part of the constraint. If a second private-hire venue is ever added, install
  `btree_gist` and add `venue_id with =`.
- **Blocks are rows in this table** (`kind = 'block'`, `status = 'confirmed'`,
  cancelled to unblock). A block therefore occupies its interval under the same
  constraint as a booking, with no second check to keep in step.
- **The constraint is the backstop, not the only check.** A status-filtered
  exclusion would reject a new hold against an expired hold that has not been
  swept yet, so the hold function releases that date's expired holds first
  (the same pattern as `mem_hold_bookings`).

### `mem_private_booking_places` — who attends

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `private_booking_id` | FK, `on delete no action` — paid bookings are never deleted |
| `account_id` | The account that registered this place. Host for coaching, guest for birthdays |
| `participant_id` | `mem_participants`, must belong to `account_id` |
| `equipment` | `own` or `hire` |
| `hire_size` | `C10-UK1`, `UK1-UK3`, `UK4-UK7`. **Required when `equipment = 'hire'`** (check) |
| `is_birthday_person` | At most one per booking (partial unique index) |
| `checked_in_at`, `checked_in_by_user_id` | Undo sets both back to null. Not a refund |
| `created_at` | |

`unique (private_booking_id, participant_id)`.

Coaching places are written by the hold function at checkout. Birthday places
are written one at a time as guests register, after payment.

---

## Functions

All are `service_role`-only unless stated. EXECUTE is revoked from `public`,
`anon` and `authenticated` explicitly (PUBLIC gets EXECUTE by default).

### `mem_private_slot_problem(kind, starts_at, hours, manual)` → text or null

One predicate that returns why an interval cannot be booked, or null if it
can. The public availability read and the hold both call it, so the date picker
can never offer something the hold then refuses.

It checks, in London local time (`at time zone 'Europe/London'`):

1. Saturday, starting 15:00 or 16:00 exactly, ending no later than 17:00.
2. Birthday and two-hour coaching start at 15:00 and run two hours.
3. **Lead time:** the date is at least 14 days ahead (KB rule). Skipped for
   `manual`, because staff enter bookings that were already agreed.
4. **16:00 one-hour coaching** only when a **confirmed** `coaching_one` or
   `coaching_group` booking covers 15:00–16:00 that date. Pending holds and
   blocks never qualify.
5. **Members sessions at the venue:** no `scheduled` `mem_occurrences` row
   overlaps, resolving venue exactly as `mem_hold_bookings` does,
   `coalesce(o.venue_id, f.venue_id)`. Empowr's All Ages Roller Disco runs in
   this space.
6. No active private booking or block overlaps.

### `mem_hold_private_booking(...)` → `mem_private_bookings`

Arguments: account, kind, `starts_at`, hours, paid places, a JSON array of
coaching places (`participant_id`, `equipment`, `hire_size`), expiry minutes,
and — manual path only — `created_by_user_id`, `payment_handling`, `note`,
and a quoted price for `custom`.

1. `pg_advisory_xact_lock` on the London date. This serialises every hold for
   that Saturday, which the sequential-hour rule needs and a constraint cannot
   express.
2. Release expired `pending_payment` holds on that date.
3. `mem_private_slot_problem(...)`, raising `mem_private_<reason>` if non-null.
4. Type row must be `active` (online path) and the kind online-bookable
   (never `custom` or `block` online).
5. Coaching: every participant belongs to the account, count matches the kind's
   rules, hire rows carry a size, no duplicates.
6. Price, computed here:
   - Birthday: `unit × paid_places`
   - 1:1: `unit × hours`
   - Group: `unit × places × hours`
   - Coaching hire: `hire_price × count(hire)`, **once per booking**
7. Insert the booking and, for coaching, its places. An `exclusion_violation`
   becomes `mem_private_unavailable`.

Manual bookings are `confirmed` immediately with `expires_at = null`. Online
holds are `pending_payment`, 30 minutes, then extended to the Checkout expiry
plus `HOLD_GRACE_MINUTES` exactly as the basket does.

### `mem_join_private_booking(...)` → `mem_private_booking_places`

The birthday guest step. Arguments: booking, guest account, participant,
equipment, hire size, `is_birthday_person`.

It locks the booking row, requires `confirmed` and a future start, requires the
participant to belong to the guest account, and refuses when the number of
places has reached `total_places`.

### `mem_public_private_availability(from_date, to_date)`

`security definer`, callable by `anon` and `authenticated`. It returns, per
Saturday and interval, only *available or not* — never who booked or why. This
mirrors `mem_public_occurrence_capacity`, and it exists because anonymous
visitors cannot read `mem_private_bookings`.

### Hold expiry

Add a **new** pg_cron job, `members-release-expired-private-holds`, every
minute. Leave the existing `members-release-expired-pendings` job alone.

---

## RLS and grants

- RLS on for all three tables, with no anon policies.
- Hosts can select their own bookings (`host_account_id = member_account_id()`),
  and an account can select its own places. All writes go through API routes
  using the service client, as elsewhere.
- **Host view of guest places** is served by the server with the service
  client after an explicit host check, and returns only first name, equipment,
  hire size and waiver-ready yes/no. It never returns waiver answers, emails or
  anything from the guest's account.
- **Guests** reach a booking only through `invite_token`. The join page reads
  kind, date, time, the host's first name and places remaining, and nothing
  about payment.
- After applying, verify with a **REST probe as well as SQL**. Anon must be able
  to call the availability RPC and nothing else.

---

## Application

### Customer

| Route | Purpose |
|---|---|
| `/private-bookings` | Choose kind, duration, places, equipment. Date picker fed by the availability RPC. `?type=one\|group\|party` preselects the kind |
| `POST /api/private-bookings` | Signed-in only. Checks waivers for coaching skaters with the existing `checkWaivers(hostEmail, participants)`, which covers one account, as coaching places are the host's own. Then hold, Stripe Checkout, link session |
| `/private-bookings/[id]` | Host view: booking summary, preparation status, invite link (birthday) |
| `/private-bookings/join/[token]` | Guest: sign in or register, pick or create participant, waiver, equipment, join |

Stripe Checkout settings match `createBookingCheckout`:

- `mode: payment`, `payment_method_types: ["card"]`, the account's Stripe
  customer, and 31-minute expiry.
- Metadata `{ kind: "private_booking", private_booking_id, account_id }`.
- Card only for the same reason as bookings: redirect methods break an
  interval hold.

**Birthday guests do not need a cross-account primitive.** Each guest acts on
their own account and pays nothing, so the waiver check is the existing
single-account `checkWaivers(guestEmail, [participant])`. Blocked walk-ins and
door group payments are a different problem: staff aggregate several accounts
into one payment. The private-bookings spec previously said otherwise, and has
been corrected.

### Stripe webhook

Add a branch **before** the existing `checkout.session.*` handling:

- Look up `mem_private_bookings` by `stripe_checkout_session_id`. **A matching
  row is the positive identification.** Metadata is only a hint, and the
  account is shared with Heroes.
- If no row matches, fall through to the existing code **unchanged**. Every
  existing branch decides ownership by querying `mem_bookings`, which would
  otherwise treat a private-booking session as "not ours" and do nothing.

The private branch handles all four outcomes the booking branch handles:

| Event | Action |
|---|---|
| Completed, not paid | `sendStaffStrandedHoldAlert` with `completed_unpaid` |
| Completed, paid, row pending | Confirm, set the payment intent and invite token, then send the confirmation |
| Completed, paid, row already released | `paid_holds_released` alert. The slot may since have gone to someone else, so this is a staff decision: refund, or restore if the interval is still free |
| Expired | `pending_payment` to `cancelled` |

A failed database read raises `check_failed`, exactly as the existing branch
does.

### One confirmation sender

`sendPrivateBookingConfirmation(service, bookingId)` is called by **both** the
webhook and the admin manual path. `admin-manual-booking.md` already warns
that copies drift. It sends:

- **Host:** summary, the non-refundable and non-transferable terms, and for a
  birthday the invite link and the equipment deadline (the date minus 14 days).
- **Staff:** an alert to the existing `links.staffBookingAlerts`
  (`bookings@empowrcic.org`), for online bookings only.

### Admin (`getAuthedAdmin()` only)

| Route | Purpose |
|---|---|
| `/admin/private-bookings` | List, filtered by date and kind, online and manual together |
| `/admin/private-bookings/[id]` | Host, guest list with search, waiver readiness, hire totals by size, check-in |
| `POST /api/admin/private-bookings` | Manual booking: any kind including `custom`. Requires `payment_handling`; records `created_by_user_id` and `note`. Obeys every slot rule except lead time |
| `POST /api/admin/private-bookings/blocks` | Block 15–16, 16–17 or 15–17 with an internal reason. Unblock sets `cancelled`. A clash with a paid booking is refused and named — never overwritten |

- **Check-in** uses `getAuthedCheckinStaff()`, like the door.
- **Waiver readiness** groups places by account and calls `checkWaivers` per
  account, the pattern `admin-data.ts` already uses for the register.

### The reverse clash

`POST /api/admin/occurrences` and time changes through `PATCH` must refuse
(409, naming the booking) when a scheduled occurrence would overlap an active
private booking or block at the same venue. Staff resolve it by hand. A paid
private booking is never cancelled automatically.

---

## Relationship to `admin-manual-booking.md`

That spec covers manual bookings on `mem_bookings` (occurrences and course
runs) and is still unbuilt.

**Lands now, with private bookings:**

- The `mem_payment_handling` enum, with the same four values.
- The same audit fields: `created_by_user_id` as the `auth.users` id, a
  required payment-handling value, and an optional note.
- The same `getAuthedAdmin()`-only gate.
- A confirmation sender that is called by both paths rather than copied.

**Waits for that spec's own decisions:** its open questions 2 (do `owed`
places expire), 3 (cancelling a bank-transfer booking) and 4 (analytics).

**Answered by code — `'member'` is not free.** Its open question 1 proposes
reusing `mem_booking_source.'member'`. That value is already written by the
subscription materialisation job (`src/lib/materialize-member-bookings.ts`).
The general path needs a new value (`'manual'`). Private bookings have their
own `mem_private_source` enum and are unaffected.

---

## Phasing

**Phase 1 — needs nothing further from Empowr.** Rates come from the KB, and
types stay `active = false` until sign-off.

- Schema, functions, cron job, RLS and grants.
- 1:1 and group coaching end to end, with Stripe.
- Birthday booking, payment, invite link and guest registration.
- Webhook branch, confirmation sender and staff alert.
- Admin list, detail, manual entry, blocks, check-in and the reverse clash.

**Phase 2 — each waits on a named decision** in the spec's outstanding list:

- Adding skaters or paying at the door.
- A capacity cap.
- Protective-gear-only hire.
- Reminders.
- Google Calendar sync.
- The EELA "Book now" buttons (in `empowr-eela`, after launch).

Until calendar sync exists, **staff enter a block** for anything in Empowr's
own calendar that Members cannot see. The booking system is the source of
truth, and the calendar will be a mirror of it.

---

## Database prerequisite

Following the repository's convention, this is a reviewable proposal, not a
migration file:

1. Apply through the Supabase Management API. The database is shared with
   Waivers and the EFN dashboard.
2. Regenerate the schema-of-record ledger in the private hub with
   `dump-ledger.mjs`.
3. Update the Supabase registry.
4. Seed the type rows with `active = false`.

Applying to the shared production database is the owner's step.

---

## Verification

Each assertion is made to fail once on purpose before it is trusted.

**SQL**, against the live schema inside a **rolled-back transaction**, as PR
#77 did:

- **Timezone:** Saturday 24 Oct 2026 (BST) and Saturday 31 Oct 2026 (GMT), both
  15:00 London. A 15:00 UTC request on the GMT date is accepted, and on the BST
  date refused.
- Wrong day, wrong minute, a 16:00 start for two hours, and a 17:00 overrun are
  all refused.
- Lead time: 13 days refused, 14 accepted, and manual accepted at 2 days.
- **Empty Saturday:** 15:00 one-hour offered, 16:00 refused.
- 16:00 refused while 15:00 is held and unpaid, and accepted once it is
  confirmed coaching. A 15:00 block never unlocks 16:00.
- **Birthday:** refused if either hour is taken, including by a Members
  occurrence at the venue.
- **Prices:**
  - 10 paid birthday tickets: £200 and 11 places.
  - Two-hour group of 3 with 2 hires: 3 × 2 × £20 + 2 × £5 = **£130**.
  - One-hour 1:1 with hire: **£45**.
- Overlapping insert gives `exclusion_violation`. An expired unswept hold does
  not block a new hold.
- A 12th guest on 10 paid tickets is refused, and a second birthday person is
  refused.
- Inactive type is refused online and accepted manually.

**REST probe:** anon can call the availability RPC; it can neither call the
hold nor read bookings or places.

**Stripe test mode**, with `stripe listen`:

- Paid confirms.
- An expired session releases the hold.
- Paying after release raises the staff alert.
- **Heroes-shaped events and ordinary basket events are not affected.**

**Route checks** go in `ops/scripts/verify-private-bookings*.ts`, following
the existing `verify:*` scripts.
