# Spec — Pay-on-the-door attendance

**Status:** Not started. Requested 2026-08-27, to be built once the open questions below are answered.

**Card only.** Empowr operates as a non-cash business (confirmed 2026-08-27). Cash and bank transfer are explicitly out of scope, which removes most of the "record how they paid" requirement — see [Payment](#payment).

---

## Why this is needed

Every booking that exists today was created by a member, through Stripe Checkout, in advance. There is **no admin route anywhere that creates a booking** — the only two admin routes touching `mem_bookings` are check-in (updates status) and occurrence-cancel (refunds).

So a person who turns up without having booked online cannot be recorded at all. Staff can mark an *existing* booking attended (added 2026-08-27), but an unbooked walk-up has nothing to mark.

Skate Jam already advertises **£10 on the door** against £7 online, so the door population is real and priced — just unrepresentable.

---

## What already exists

Genuinely reusable, not "close enough":

| Piece | State |
|---|---|
| `mem_booking_source` enum value `walk_in` | Exists, **never written by anything**. This feature is what it was declared for. |
| `mem_offerings.walk_in_price_pence` | Exists and is populated (Skate Jam £10). Currently **display-only** — rendered publicly, editable in admin, consumed by nothing. |
| `checkWaivers()` (`lib/waivers.ts`) | Works, but is keyed on account email plus existing `mem_participants` rows — see [The waiver problem](#the-waiver-problem). |
| `/admin/checkin`, register, `MarkAttendedButton` | Built 2026-08-27. This feature adds to that page. |
| `mem_hold_bookings()` capacity locking | Works, but is the wrong shape for the door — see [Capacity](#capacity). |

---

## The blocker: non-members cannot be represented

This needs a decision before anything is built.

The schema chain is:

```
mem_participants.account_id  NOT NULL
        |
        v
mem_accounts.user_id         NOT NULL  ->  auth.users
```

So **a participant cannot exist without an account, and an account cannot exist without a real auth user.** There is currently no way to represent a person who has no login. `mem_participants.dob` is also `NOT NULL`, so any new person needs a date of birth captured at the door — which age eligibility needs anyway.

The requirement that non-members be "searchable by name and added as a PAYG attendee" therefore does not fit the current data model. The fix is a deliberate choice:

| Option | Trade-off |
|---|---|
| **A. Real account per attendee** | Creates `auth.users` + `mem_accounts` + `mem_participants`. Needs an email at the door and puts them in the auth system without asking. Heaviest — but they become a real member who can self-serve later. |
| **B. One shared "Door" system account** | A single `auth.users` / `mem_accounts` row owns every PAYG participant. **Zero schema change** — waiver gate, register, check-in and capacity all keep working untouched. Downside: these are not real members, and if one later signs up they become a duplicate participant record. |
| **C. Make `mem_accounts.user_id` nullable** | Cleanest conceptually — an account without a login. But this is a shared database and `user_id` is load-bearing for RLS and the signup trigger; needs a careful audit before being touched. |
| **D. Separate `mem_door_attendees` table** | Strongest separation, but creates a second class of person that the waiver gate, register and check-in each key off `participant_id` and would all need to learn about. |

**Recommendation: B for launch, with A available later as a "convert to member" action.** It ships without touching a shared-database constraint, and every downstream system keeps working unchanged. The duplicate-record risk is real but small and recoverable; C and D both spend materially more risk on a population whose size is still unknown.

---

## The waiver problem

The rule — no valid waiver, no check-in — is right, and mostly already enforceable. But the search cannot work the way it first appears.

**Members and walk-ins live in different tables.** `lib/waivers.ts` states this directly: the standalone app at `waiver.empowrcic.org` "stays the public route for walk-ins, who are not members and have no account here". So:

- A **member's** waiver is in `mem_waiver_consents`, keyed by `participant_id`
- A **walk-up's** waiver is in the Waivers app's own `people` / `waiver_responses` tables, with **no Members record at all**

So "search the member database by name" would not find the very population this feature exists for. The door search must query **both**:

1. `mem_participants` — by name, for members
2. `people` / `waiver_responses` — by name, for anyone who signed the standalone waiver

**The fallback path has a known landmine.** `checkWaivers()`'s fallback matches only responses on the **active** `form_versions` row. `mem_waiver_consents` was built on 2026-08-17 specifically to defuse this: bump the waiver wording and everyone covered only by the fallback silently becomes "unsigned". The door flow must therefore prefer a `mem_waiver_consents` row and **backfill one on every successful door match**, exactly as `checkWaivers()` already does via `recordWaiverConsent()`. Without that, a wording change the week before a session would block a hall full of people at the door.

**Waiver status must be displayed, never inferred.** Three distinct states, shown explicitly:

| State | Door action |
|---|---|
| Valid consent found | Proceed |
| Found but expired or revoked | **Blocked** — new waiver required |
| No record found | **Blocked** — new waiver required |

Blocked means blocked: the check-in control is disabled, not merely warned about. The waiver is a UK GDPR Article 9 record and an insurance condition, so a staff override is deliberately not offered.

---

## Payment

Card-only removes the multi-method requirement. What remains is a fork nobody has decided:

| Option | Notes |
|---|---|
| **1. External terminal, Members records it** | Staff take the card on whatever terminal they use today; Members stores only *that* it was paid. Simplest build. Downside: **money lands outside Stripe**, so takings reconcile against a second system, and Members holds an assertion rather than a payment. |
| **2. Stripe payment link or QR, attendee pays on their own phone** | Members generates a Stripe payment for `walk_in_price_pence`; the attendee scans and pays. Keeps **one** payment surface, reconciles automatically, produces a real `payment_intent`, needs no hardware. Slower per person, and depends on signal at the venue. |
| **3. Stripe Terminal (hardware)** | Proper card-present integration. Real cost, much larger build. Out of scope for now. |

**Recommendation: 2, falling back to 1 if venue connectivity makes it impractical.** Everything financial in this estate already reconciles through Stripe; option 1 quietly creates a second silo that someone reconciles by hand forever.

If option 1 is chosen, `mem_bookings` needs no `payment_method` column at all — card is the only value — but it does need to distinguish "paid on the door" from "paid online", which `source = 'walk_in'` already provides.

---

## Capacity

Door bookings must consume capacity, or the room can be oversold by exactly the people standing in it.

`mem_hold_bookings()` already does row-locked capacity checking with the right fallback (`coalesce(occurrence.capacity, venue.default_capacity)`), but it is the wrong shape here: it creates a `pending_payment` row with a 30-minute expiry, intended for a Stripe redirect. A door booking is either paid or not happening.

**Either** extend that RPC with a mode that inserts `confirmed` directly, **or** add a sibling `mem_book_at_door()`. Either way the capacity check must stay inside the same row lock — doing it in application code reintroduces the exact race the RPC exists to prevent, and the door is precisely where two staff might add people simultaneously.

Note also that capacity is currently **unlimited on every course run** unless explicitly set, because the course-run path has no venue fallback (found 2026-08-27). Courses are less likely to take door attendees, but the asymmetry should not surprise anyone later.

---

## Flow

On a session's register, reached from `/admin/checkin`, a **+ Add pay-on-the-door attendee** button:

1. **Search by name** across `mem_participants` and `people` / `waiver_responses`
2. **Each result shows** name, whether they are a member, and waiver status as one of the three states above
3. **No valid waiver** → blocked, with a prompt to complete one at `waiver.empowrcic.org`. A QR to that form would save significant door time
4. **Not found at all** → capture name and DOB, then the same waiver requirement applies
5. **Age eligibility** checked against the offering's `age_min` / `age_max` on the session date, reusing the existing `isAgeEligible()`. Skate Jam is 15+ and that must not be bypassable at the door
6. **Payment** per the option chosen above
7. **On confirmation** create the booking with `source = 'walk_in'`, `price_paid_pence = walk_in_price_pence`, status `attended` (they are, by definition, present), consuming capacity
8. Row appears on the register labelled **Paid on the door**, visually distinct from online bookings

---

## Build scope

- **Migration** — whatever the PAYG decision requires (option B needs a seed row, not a schema change), plus the door-booking RPC
- **New** — name-search endpoint spanning both databases; door-booking creation endpoint; the door UI on the register
- **Reused unchanged** — `checkWaivers()` / `recordWaiverConsent()`, `isAgeEligible()`, `MarkAttendedButton`, the register itself
- **Not needed** — a `payment_method` column, given card-only; `source = 'walk_in'` carries the distinction

---

## Open questions

1. **How is the card actually taken?** (Payment options 1–3.) This shapes the build more than anything else.
2. **How should a PAYG attendee be represented?** (Options A–D.) Recommendation is B.
3. **Should a door attendee who later signs up be linkable to their door history**, or is a duplicate acceptable? Answering "linkable" pushes toward A.
4. **Do door attendees need a receipt or confirmation email?** Nothing in the requirement says so, but a card payment with no receipt is unusual, and Resend is already wired.
