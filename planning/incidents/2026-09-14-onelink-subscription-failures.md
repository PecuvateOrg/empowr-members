# Stripe Onelink on Members — what is actually wrong

**Date:** 2026-09-14
**Status:** Diagnosed. Nothing changed — Members is live and trading.
**Evidence:** live Stripe account `acct_1TBhN2CpJGJ55gu5` (Empowr CIC), read-only
via Stripe CLI; test-mode API probes; Stripe's API reference.
Window: since go-live, 01 Sep 2026.

> **SUPERSEDED IN PART, 2026-09-15 — Klarna is back on membership checkout (PR #65).**
> Empowr reviewed this and decided Klarna is worth offering to members paying for
> several children. That is their call and it stands; §2 and §5 below recommend the
> opposite and are kept only as the record of what was found on 14 Sep. One thing
> was learned after this was written and is now proven in the Klarna UK sandbox:
> on a £30/month plan Klarna offers **"Pay in full" only** — no Pay in 3, no Pay
> later — so it does not spread the cost of a membership. Its instalment value is
> on one-off bookings, which pin `["card"]` for a real reason. See
> `2026-09-14-onelink-member-lockout.md` and the Empowr KB page
> `entities/payments-internal`.

> **Correction, same day.** An earlier version of this file claimed Onelink was
> reachable only on the subscription route, and recommended excluding it. Both
> claims were wrong. Live payment data shows Onelink is used on **every** route
> and is the single most popular way members pay. The recommendation is
> reversed. What survives is the Klarna finding.

---

## Naming

Stripe has renamed **Link** to **Onelink**. In the API it is still `link`. "The
One Link" is Stripe's wallet — the "Pay faster with Onelink" button on the
Checkout page. It is not a link handed out by staff at the door.

---

## 1. Onelink appears on every route — in two different forms

This is the fact that overturns the first draft. Live succeeded PaymentIntents
for Members bookings and walk-ins — routes that pin `payment_method_types: ["card"]`:

| Method used | Count |
|---|---|
| card, autofilled by **Onelink** (`card.wallet.type = link`) | 13 |
| card, autofilled by **Apple Pay** | 14 |
| card, typed manually | 11 |

And the five live membership subscriptions:

| Method | Count |
|---|---|
| `link` (Onelink as a first-class payment method) | **4** |
| `card` | 1 |

So there are two distinct things, and they must not be confused:

- **`card` + `wallet.type = link`** — Onelink authenticated the member and
  autofilled a **card**. The charge is a card charge. This happens on the
  card-only routes and is **completely unaffected by `payment_method_types`**.
- **`type = link`** — Onelink as a first-class payment method, which can draw
  on a bank account or Onelink balance, not only a card. Available only because
  `link` is in the list.

**Pinning `["card"]` does not remove the Onelink prompt or its one-time-passcode
step.** It only downgrades Onelink from a payment method to a card autofill.
Roughly **34–80% of successful Members payments come through Onelink.** It is
the most-used payment route on the platform, not a fault.

---

## 2. The real defect: Klarna

`POST /api/memberships/subscribe` omits `payment_method_types` entirely, so it
inherits the account's **Default** payment method configuration
`pmc_1TBhNYCpJGJ55gu5ItpYALF1`. Live subscription sessions therefore offer:

```
card, klarna, link, revolut_pay, amazon_pay
```

against `["card"]` on [bookings](../../src/app/api/bookings/route.ts#L364) and
[walk-ins](../../src/app/api/admin/walk-ins/route.ts#L321).

Nobody decided to offer **Klarna buy-now-pay-later on a £30/month children's
skating membership.** It arrived by omission. Usage to date: **zero.**

Revolut Pay and Amazon Pay: also **zero** uses, both redirect-based.

That Default configuration is **shared with Empowr Heroes** — changing it in the
Dashboard changes Heroes' donation checkout. The fix must be code-side.

---

## 3. What the failure data shows

Members sessions since 01 Sep, excluding staff test accounts:

| Path | Sessions | Paid | Expired unpaid | Abandon rate |
|---|---|---|---|---|
| Bookings + walk-ins | 49 | 37 | 12 | **24%** |
| Subscriptions | 8 | 5 | 3 | **38%** |

Abandonment happens on both paths. "Expired unpaid" is the ordinary
abandonment signal on this account, not a fault signature. 3 of 8 is far too
small to carry a causal claim.

Subscription sessions expire after **24 hours** (Stripe's default), not the 31
minutes bookings use — so an expired subscription session means the member
closed the tab, not that they sat stuck on a prompt.

**The two who failed on the subscription path:**

- **matthewearnshaw@hotmail.com** — 05 Sep 17:58 and 07 Sep 09:20, both expired
  unpaid. Has never paid Empowr anything.
- **j.alleyne@hotmail.co.uk** (Jordaan Alleyne) — 02 Sep 13:17, expired unpaid.

Jordaan's full timeline that afternoon:

```
13:17  subscription   £25.00   EXPIRED UNPAID
13:50  booking         £7.00   PAID
13:52  booking         £7.00   PAID
13:52  booking         £7.00   PAID
```

Suggestive, but it does **not** isolate Onelink: Onelink was available on both
pages. The differences are subscription vs one-off, £25 recurring vs £7, and
Klarna's presence. He may simply have decided against a monthly commitment and
bought individual sessions instead.

Account-wide there are **zero** non-succeeded PaymentIntents and **zero**
SetupIntents — no card was ever declined. Plain abandonment produces the same
zero, so this rules out declines and nothing more.

**Both failures remain unexplained.** Stripe's event log has aged past 08 Sep,
and Checkout does not record which method an abandoning customer selected.

### Also struggling — on the card-only path

- **cliftonbarrett@gmail.com** — £10, three attempts (03 Sep ×2, 10 Sep), never paid.
- **phatfig@gmail.com** — £55, two attempts (13, 14 Sep), never paid.

If the two people who reported trouble were **booking** rather than subscribing,
these are the likelier candidates.

---

## 4. Verified API facts (test-mode probes, 14 Sep)

| Probe | Result |
|---|---|
| `excluded_payment_method_types: ["link"]` | **API error — `link` is not an excludable value.** Onelink cannot be excluded per-session. |
| `payment_method_types: ["card","apple_pay"]` | **API error** — `apple_pay`/`google_pay` are not valid values; they ride on `card`. |
| `payment_method_types: ["card"]` | → `['card']` |
| `payment_method_types: ["card","link"]` | → `['card','link']` |
| `excluded_payment_method_types: ["klarna","revolut_pay","amazon_pay"]` | → `['card','link']` |

Also confirmed: with multiple methods, *"Stripe dynamically reorders them to
prioritize the most relevant"* — **display priority cannot be set from the API.**

---

## 5. Recommendation

**Drop Klarna, Revolut Pay and Amazon Pay. Keep Onelink.**

```ts
excluded_payment_method_types: ["klarna", "revolut_pay", "amazon_pay"],
```

Result: `card` (carrying Apple Pay, Google Pay and Onelink card-autofill) plus
`link`. Code-side only; no effect on Heroes.

- **Keep Onelink** because 4 of 5 subscribers chose it and a third of booking
  payments use it. Removing `link` would not remove the Onelink prompt anyway —
  it would only stop new subscribers funding from a bank or Onelink balance.
- **Drop Klarna** — zero usage, and BNPL does not belong on a child's activity.
- **Drop Revolut Pay and Amazon Pay** — zero usage, both redirect-based, and
  since display order cannot be controlled they cannot be demoted to "lower
  priority"; they would simply compete for attention.

**Existing subscribers are unaffected** — the four active `link` subscriptions
keep their saved payment method and renew normally. This changes new checkouts
only.

**Do not disable Onelink in the Dashboard** — that configuration is shared with
Empowr Heroes.
