# Phase 2 — Memberships

**Done when:** a member can subscribe to a plan online, manage it (card, cancel) via Stripe Customer Portal, book any entitled session with zero payment, and part-pay a non-entitled booking with credit balance. Membership status stays in sync with Stripe automatically.

**Blocked by:** entitlement definitions — Q3, Q5-confirmation, Q6 and Q8 remain open.
**Requires:** Phase 1 live.

---

## Status 2026-08-27

| Step | State |
|---|---|
| 1 — Entitlement gate | **Partly closed.** Q1, Q2, Q4, Q7 answered. Q3, Q5-confirmation, Q6, **Q8 (Skate Jam seasonality)** open — see [entitlement-intake.md](./entitlement-intake.md). |
| 2 — Stripe Billing setup | ✅ **DONE.** 5 plans, Prices in test **and** live keyed by `lookup_key`, portal configuration created for both modes. |
| 3 — Subscription lifecycle | ✅ **DONE and verified e2e.** `active → past_due → active → cancelled`, upsert idempotent, ownership guard blocks foreign events from writing, bad signature → 400. Portal verified through the deployed app with the live key. |
| 4 — Entitled booking path | Not started — blocked on Q3/Q5. |
| 5 — Credit redemption | Not started. |
| 6 — Member UI + verify | Not started. **Nothing renders a plan yet**, and all 5 plans are `active=false`. |

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
