# Phase 2 — Memberships

**Done when:** a member can subscribe to a plan online, manage it (card, cancel) via Stripe Customer Portal, book any entitled session with zero payment, and part-pay a non-entitled booking with credit balance. Membership status stays in sync with Stripe automatically.

**Blocked by:** nothing. Q3, Q5, Q6 and Q8 all closed 2026-08-31.
**Requires:** Phase 1 live.

---

## Status 2026-09-02

| Step | State |
|---|---|
| 1 — Entitlement gate | **Partly closed.** Q1, Q2, Q4, Q7 answered. Q3, Q5-confirmation, Q6, **Q8 (Skate Jam seasonality)** open — see [entitlement-intake.md](./entitlement-intake.md). |
| 2 — Stripe Billing setup | ✅ **DONE.** 5 plans, Prices in test **and** live keyed by `lookup_key`, portal configuration created for both modes. |
| 3 — Subscription lifecycle | ⚠️ **Code done; NOT verified through a real Stripe delivery.** `active → past_due → active → cancelled`, upsert idempotent, ownership guard, bad signature → 400 — all proven by **self-signed events against a local server**, never by Stripe delivering to the deployed endpoint. On 2026-09-01 that gap turned out to be hiding a live fault: the production webhook endpoint was subscribed only to `checkout.session.*`, so `customer.subscription.created` was never delivered and a live subscription would have charged the card and written no `mem_memberships` row. Endpoint fixed; **still needs one real subscription end to end before this reads DONE.** |
| 4 — Entitled booking path | **Not started, and no longer urgent.** Q3/Q5 are closed, so it is unblocked. Its money-losing half was split out and shipped on 2026-09-02 (`1f0f3a8`): a covered member is now **refused** rather than charged twice — `coverForOccurrence()` is the one place entitlement is resolved, and the register reads it too. What remains is the positive half: materialising £0 booking rows so a subscriber has capacity, a waiver gate and a check-in control like anyone else. Until then a subscriber cannot be checked in at all. |
| 5 — Credit redemption | Not started. |
| 6 — Member UI + verify | ✅ **DONE** (`40d2dd8`, 2026-09-01, live). The subscribe choice renders on `/sessions/[slug]` beside the per-session price, `/membership/[planId]` completes it, `/membership` is management. All 5 plans are `active=true`. ⚠️ A standalone `/membership` shop was built first and **rejected** — the decision belongs where both prices are visible together. |

**Verified by test-clock?** No — a Stripe test clock was never needed. Step 3 was proven instead by self-signed events against a local server (the test-mode webhook endpoint had been dead since go-live). See DEVLOG 2026-08-26.

⚠️ **Q8 blocks the Skate Jam plan specifically** — it runs Sept 3–Mar 25 only, and nothing yet decides what a monthly subscription does out of season. The other four run year-round.

---

## Step 1 — Entitlement definition gate (no code before this closes)

⚠️ **The "£30 general / £50 Roller Disco" framing was stale and is gone** — the £50 tier is retired and there is no general plan. Subscriptions are **per session slot**: Skate Jam £25, Sk8 Skool Kidz £30 **per slot** (Mon and Wed are separate), All Ages £40, SYNKRON8 £45. Answered: plans (Q1), coverage (Q2), family (Q4 — **per participant**), pricing structure (Q7). Open: caps (Q3), advance booking (Q5), dunning (Q6), seasonality (Q8). Full list with recommended defaults: [entitlement-intake.md](./entitlement-intake.md).
**Done when:** all of Q3-Q8 are ADR'd. Plans and entitlements are already written.

## Step 2 — Stripe Billing setup

✅ DONE. Products + recurring Prices per plan in **both** modes, referenced by **`lookup_key`** rather than Price ID (`stripe_price_id` is held NULL by a CHECK constraint — a stored ID would be correct in only one environment). Customer Portal configured as a **separate configuration** (live `bpc_1U8zvc…`, test `bpc_1U8noL…`, `metadata.app=members`, plan switching **off**), passed explicitly so the account default — which belongs to Heroes — is never used.

## Step 3 — Subscription lifecycle

Subscribe flow (plan page → Stripe subscription Checkout); webhooks: `customer.subscription.created/updated/deleted`, `invoice.payment_failed` → `mem_memberships.status` (`active`/`past_due`/`cancelled`); grace behaviour for `past_due` ADR'd (proposed: entitlements pause until paid).
**Done when:** Stripe test-clock run drives status through all three states correctly.

## Step 4 — Entitled booking path

Booking flow checks active membership + entitlement + period cap before the payment step; covered → booking confirms at £0 with `source = member`; capacity and waiver gate still apply.
**Done when:** a member books an entitled session with no Stripe interaction; a capped plan blocks the (n+1)th booking in-period.

⚠️ **The refusal is already built — do not rebuild it.** `coverForOccurrence()` (`lib/membership.ts`) resolves who is entitled to an occurrence and is used by `/api/bookings`, the booking page and the door register. Step 4 **replaces the 409 with a £0 booking row**; it does not need a second entitlement read, and adding one would reintroduce exactly the drift that function exists to prevent.

⚠️ **Q5 means the rows must be created on the subscriber's behalf**, for every occurrence in their slot — handling a lapsed waiver, a full session and the seasonal pause. That is the bulk of the work, not the £0 pricing.

## Step 5 — Credit redemption

Checkout part/full payment from `mem_credits` balance (oldest first, respecting expiry); remainder via Stripe; `redeemed_booking_id` set atomically.
**Done when:** a £15 booking with £10 credit charges £5 and marks the credit spent.

## Step 6 — Member UI + verify

Membership card on account page (plan, renewal date, usage vs cap), portal link, member pricing shown in catalogue. /webapp-testing e2e; deploy; registries; memory/DEVLOG; compress this file.

---

## Not in Phase 2
- Pausing/freezing memberships (only if ADR'd in Step 1)
- Gift memberships, family-plan pricing tiers beyond what Step 1 defines
- Attendance-based plan analytics (P3 reporting)
