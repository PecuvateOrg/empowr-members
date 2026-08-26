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

## Status: Q1 and Q2 are now CLOSED by the KB

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

## Still open

### Q3 — Session caps per period ⚠️ needs a decision

**Recommendation: no cap.** `sessions_per_period` stays NULL.

The monthly price **already assumes 4.33 sessions a month** (52 weeks ÷ 12).
So a cap of 4 would mean charging for 4.33 and delivering 4 — quietly
under-delivering in the ~4 months a year that have five occurrences. Not
capping is not generosity; it is what the price already prices in.

Against a cap, practically: the slot is physically weekly, so attendance is
self-limiting; a cap creates an unpleasant "you have used your four, that
will be £10" moment in week five; and it needs period accounting that does
not line up with Stripe's billing anniversary (a "calendar month" cap and a
"billing period" cap are different, and both are confusing to explain).

Confirm no cap, or give a number per plan.

### Q6 (follow-up) — confirm what Stripe's default actually does

Adopting Stripe's defaults means retries run for roughly three weeks. **The
part worth confirming is what happens at the end of that**, which is set in
Billing settings: leave as-is, cancel, mark unpaid, or mark uncollectible.

The concrete consequence: this app pauses entitlements as soon as a
subscription goes `past_due`, so during the retry window the member reverts
to paying per session. If Stripe's end action is **cancel**, a member whose
card fails for three weeks loses their slot entirely and has to resubscribe.
That may be fine — but it should be a decision, not a default nobody looked at.

### Q8 — Skate Jam is seasonal; what happens out of season? 🆕

Skate Jam runs **September 3 to March 25 only**. It is the only seasonal
session with a Subscription, and a monthly Subscription to it raises a
question nothing has answered yet: **does a Skate Jam subscriber keep paying
£25/month from March 25 to September 3, when there are no sessions?**

Three options: pause the subscription at season end and resume automatically;
cancel at season end and ask members to resubscribe; or keep billing
year-round and price it as an annual average. The first is fairest and Stripe
supports it, but it is unbuilt. **This blocks activating the Skate Jam plan
specifically** — the other four run year-round and are unaffected.

## Once answered

1. One ADR row per question in `planning/decisions/CONTEXT.md`
2. Update the Subscriptions section of `entities/sessions.md` in the KB —
   it is the source of truth, so any change lands there first
3. Re-run `/sync-kb` so the CRM chat widget stops quoting the old policy
4. Step 1 closes; Steps 4–6 unblock
