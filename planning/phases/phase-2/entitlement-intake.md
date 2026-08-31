# Phase 2 Step 1 — Entitlement Intake (for Jasmine/Shaun)

Take-into-the-conversation version of the entitlement definition gate. Each
question states what is already known and gives a **recommended default** — so
the answer can be a confirmation rather than a design exercise. Settled answers
go into `planning/decisions/CONTEXT.md` as ADR rows, per Step 1's done-when:
*"`mem_membership_plans` + `mem_plan_entitlements` rows can be written directly
from the ADRs."*

> **Rewritten 2026-08-26.** The previous version of this file was stale in two
> ways and should not be relied on from git history: it framed Q1 as
> *"Roller Disco £50/month; General membership from £30/month"*, and it built
> its whole priority argument around unblocking a **PassKit membership pass**.
> The £50 tier is retired, there is no general plan, and PassKit was removed
> from this project entirely on 2026-08-17.

---

## Status: ALL QUESTIONS CLOSED (Q1/Q2 by the KB 2026-08-26; Q3/Q5/Q6/Q8 by Empowr 2026-08-31)

`vaults/EMPOWR CIC/entities/sessions.md` (as_of 2026-08-25) is the declared
single source of truth for what sessions exist, and it now defines
Subscriptions directly.

### Q1 — Which plans exist ✅ CLOSED

A Subscription is **per session**, not a sitewide plan:

| Session | Subscription | Drop-in price |
|---|---|---|
| Skate Jam | £25/month | £7 online / £10 door |
| Sk8 Skool for Kidz (Monday **&** Wednesday) | £30/month | £10 |
| Sk8 Skool for All Ages | £40/month | £12.50 |
| SYNKRON8: Roller Dance for Beginners | £45/month | £15 |

Courses (Beginners Foundation, Prep to Street Skate L1/L2) and Camps are paid
per course and have **no** Subscription option.

A free **Empowr Member** account is a separate concept from a paid
Subscription — every Member can book any session individually without one.

### Q2 — What each plan covers ✅ CLOSED

Each Subscription covers exactly its own offering. No cross-session coverage,
no type-level coverage. In schema terms every `mem_plan_entitlements` row uses
`offering_id`, and `offering_type` stays null.

---

## Answered by Empowr, 2026-08-26

- **Q4 — per participant.** ✅ One Subscription covers one named skater. Two
  children in the same slot need two Subscriptions. Schema updated
  (`mem_memberships.participant_id`).
- **Q7 — £30 is per weekly SLOT, not per programme.** ✅ Sk8 Skool for Kidz
  Monday and Wednesday are separate £30 Subscriptions; a child doing both
  costs £60/month. The KB summary table has been corrected at source. Plans
  restructured 4 → 5.
- **Q5 — intent confirmed:** a Subscription enrols the participant in that
  day and time indefinitely until they cancel. ⚠️ **Still to put to the team:**
  whether "no need to book each date" means literally not reserving a place.
  Capacity, the waiver gate and the door register all key off a booking row,
  so a subscriber who simply turns up is invisible at check-in. Suggested
  resolution: it removes the need to **pay** each date, with a one-tap
  "reserve my place".
- **Q6 — use Stripe's defaults for retries.** ✅ Confirm the final action in
  Billing settings while you are there (see below).

---

## ALL ANSWERED — 2026-08-31 (Empowr)

Q1, Q2, Q4, Q7 were closed by the KB on 2026-08-26. The four below closed on
2026-08-31. **Step 1 is complete; Steps 4-6 are unblocked.** Full rationale for
each is in `planning/decisions/CONTEXT.md`.

### Q3 — Session caps per period ✅ NO CAP

`sessions_per_period` stays NULL. The team's first answer was "4 a month", and
the maths behind it was right — 52 weeks ÷ 12 = 4.33 is exactly why some months
carry five occurrences. But a cap of 4 charges for 4.33 and delivers 4 in those
~4 months a year (£7.50 per session against £6.92), **and it contradicts Q5**:
if the place is reserved indefinitely then it is reserved all five times, so a
cap means turning a child away at the door from a place they hold. Capping at 4
with the price cut to ~£27.70 was offered as the consistent alternative and not
taken.

### Q5 — Does a subscriber still reserve a place? ✅ YES, INDEFINITELY

No booking action, ever, for as long as the subscription is active — turn up and
be checked in. That is the stated incentive to subscribe. The earlier suggested
compromise (a one-tap "reserve my place") is explicitly rejected.

⚠️ **This is the largest build item in Steps 4-6, and it is not a config flag.**
Capacity, the waiver gate and the door register all key off a booking row, so
the system must create those rows on the member's behalf for every occurrence in
their slot. It has to handle a lapsed waiver, a session at capacity, and the Q8
season pause.

### Q6 — Failed payments ✅ WARN, THEN REVERT TO PAY-AS-YOU-GO

Reverting is already how the app behaves — entitlements drop at `past_due`. The
warning is the new part, and it is **split rather than duplicated**:

- **Stripe's own failed-payment email** covers the per-attempt "update your
  card" nudge. It owns the retry timing and carries a working payment-update
  link, and can point at our own management page. Copy is not editable — only
  branding (logo, colour) is.
- **Members builds ONE branded email for the terminal event**, which is the only
  part Stripe cannot express: the reserved place is gone, you are back to paying
  per session, here is how to resubscribe.

⚠️ Stripe's toggle is **account-level**, so enabling it starts sending to Heroes
donors too. That is a gap-closer there rather than a problem — Heroes currently
notifies staff only, never the donor.

⚠️ **The end-of-retry action itself is still unverified.** Intent is "cancel the
subscription", accepted for both apps. It lives in Billing → Revenue recovery →
Retries and **Stripe exposes no API to read it** (checked, 2026-08-31), so it
needs eyes on the Dashboard.

### Q8 — Skate Jam out of season ✅ PAUSE AND AUTO-RESUME

Stripe's `pause_collection` takes a `resumes_at`, so season end sets the
September resume date in the same call. No member action, no resubscribe. This
unblocks activating the Skate Jam plan, the only one gated on it.

## Once answered

1. One ADR row per question in `planning/decisions/CONTEXT.md`
2. Update the Subscriptions section of `entities/sessions.md` in the KB —
   it is the source of truth, so any change lands there first
3. Re-run `/sync-kb` so the CRM chat widget stops quoting the old policy
4. Step 1 closes; Steps 4–6 unblock
