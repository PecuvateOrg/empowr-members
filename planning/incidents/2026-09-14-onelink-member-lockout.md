# Member locked out of checkout by a Onelink account — Bunmi

**Date:** 2026-09-14
**Reported:** member used Onelink, a code was sent to a phone number, the wrong
number had been entered, and she now cannot book.
**Member:** Bunmi — `phatfig@gmail.com`, `cus_VFpguaw0XZ9nLG`,
`mem_accounts.id = f92379e0-1e25-4ffb-9060-3ba101ca313c`
**Status:** Root cause identified with high confidence but **not proven**.
No code changed. Companion to
[2026-09-14-onelink-subscription-failures.md](./2026-09-14-onelink-subscription-failures.md).

---

## 1. What she was trying to buy

The **October roller camp**, £55, course run `6c519802-cfaa-4fe6-8ec4-7cf2aa3f5052`.
Not an ordinary session — these bookings carry `course_run_id`, not
`occurrence_id`.

| Attempt | Created | Outcome |
|---|---|---|
| 1 | 13 Sep 20:28 | Checkout session expired unpaid; hold cancelled 20:59 |
| 2 | 14 Sep 19:42 | Checkout session expired unpaid; hold cancelled 20:13 |

Her Stripe customer was created at the same minute as her first attempt.

---

## 2. What is NOT wrong — everything on our side is healthy

Checked and cleared, so these can be ruled out:

- **Capacity is fine.** Camp run capacity 16, currently **10 taken — 6 places
  free.** She is not being turned away for a full camp.
- **No stuck holds.** Both bookings are `cancelled`, released on schedule by the
  expiry sweep. Nothing of hers is sitting on a place, and no stale
  `pending_payment` row is blocking a retry.
- **The waiver gate passed.** It fails closed *before* Checkout; she reached
  Checkout twice, so the waiver is signed.
- **Her account is intact** — created 07 Sep, one participant.

**She never reached a payment attempt.** Her Stripe customer has **zero payment
methods** and **zero PaymentIntents**, ever. Nothing was declined; the card form
was never submitted. Whatever stopped her happened on the Stripe Checkout page
before any card details were taken.

---

## 3. Root cause — consistent, but not proven

Stripe's documented Onelink behaviour:

> *"Onelink automatically detects if a customer is enrolled by using their email
> address, phone number, or browser cookie. The customer receives a one-time
> passcode to authenticate their session."*

If Bunmi enrolled in Onelink with a mistyped phone number, the passcode goes to
a number she does not control. Onelink then recognises `phatfig@gmail.com` on
every subsequent checkout — ours included — and asks for a code she can never
receive.

This is **not specific to Empowr**. A Onelink account is a Stripe *consumer*
account keyed to her email and phone. It would follow her to any merchant on the
Onelink network.

**Why this is not proven:** there is no Stripe-side artifact linking her to
Onelink. Two expired sessions with no payment attempt are equally consistent
with "saw £55 and did not complete". The report is what points at Onelink, and
the payment data is consistent with it — no more than that.

**What would prove it:** ask her what she saw. A code prompt she could not pass,
an email field she could not edit, or a "check your phone" screen would confirm
it. So would a screenshot.

---

## 4. Only she can fix it — and that is the important part

**Empowr cannot repair a member's Onelink account.** It belongs to Stripe and the
consumer, not to the merchant. It is not visible or editable from the Empowr
Stripe Dashboard.

The documented recovery is an **account reset** at
[support.onelink.com](https://support.onelink.com) (formerly `support.link.com`):

- Resetting lets her set a new phone number **even when she cannot access the old
  one**.
- It requires verifying the **email address** on the account — which she does
  control.
- **It destroys saved data**: saved payment methods, addresses and purchase
  history on that Onelink account are lost. Harmless here; she has no saved
  payment method with us.

Relevant pages:
- Reset / change phone: `support.link.com/how-to-reset-your-account?status=phone`
- No access to phone or email: `support.link.com/questions/can-i-update-my-phone-number-or-email-address-if-i-no-longer-have-access`
- Delete the account: `support.link.com/questions/how-do-i-delete-my-link-account`

---

## 5. The real gap: staff cannot rescue her

There is **no admin path to book this member onto the camp without Stripe
Checkout.** Verified:

- No manual / offline / mark-as-paid route exists anywhere under
  `src/app/api/admin/` — searched, zero hits.
- The only admin payment route is `POST /api/admin/walk-ins`, and it has two
  disqualifying problems here:
  1. It resolves **the same Stripe customer** (`getOrCreateStripeCustomer` on the
     participant's account), so it lands on the same email and hits the same
     Onelink detection.
  2. It takes an `occurrence_id`. **It cannot book a course run at all**, so it
     cannot sell a camp place under any circumstances.

So a member blocked at Stripe Checkout cannot be booked by staff by any means.
Today that costs one £55 camp place; the same gap applies to any member who
cannot complete Stripe Checkout for any reason.

---

## 6. Open question that decides whether code needs to change

**Can a recognised Onelink user dismiss the passcode prompt and just type a
card?**

Stripe's docs do not say. `docs.stripe.com/payments/link/link-payment-integrations`
covers integration modes only, not the checkout UX.

This splits the outcome cleanly:

- **If there is an escape hatch** → this is a member-support matter. Bunmi resets
  her Onelink account, or clicks past the prompt. No code change needed.
- **If there is not** → then passing `customer` without `customer_update`, which
  renders the email **read-only** (Stripe's API reference states this
  explicitly), leaves an affected member with no way out on a live booking flow.
  That would be a genuine defect across all three payment routes.

Note carefully: the docs say the email is **not editable**. They do *not* say
Onelink is unavoidable. Do not conflate the two — the first is documented, the
second is an inference.

Deliberately **not** tested by creating a live Checkout session against her
customer: a live session with a line item and no `mem_bookings` hold risks
charging her for a place she does not get. A test-mode Onelink probe would not
reproduce a live consumer's enrolment state, so it would not settle it either.

---

## 7. Recommended next steps

1. **Tell Bunmi to reset her Onelink account** at support.onelink.com, then book
   again. Warn her that saved payment details on that account are lost.
2. **Ask her what she actually saw.** This is the only thing that confirms the
   diagnosis, and it takes one message.
3. **Reassure her the camp is not full** — 6 of 16 places remain, so there is no
   rush-induced pressure to pay by a route she does not trust.
4. **Decide on the staff-rescue gap** (section 5). An admin "record a booking,
   take payment separately" path would cover this and every future variant. Worth
   its own ticket; not something to bolt on during an incident.

---

## 8. Second member, same evening — Michelle Attakora-Bonsu

**Reported via the widget:** "I have paid but I don't know if it has gone
through."

**She has NOT paid. No money has been taken. Her card has not been charged.**

Verified four ways:

- Checkout session `cs_live_a1XcBRfXHQc2D6yV0nuOqDn4u06AkT5VdQ3yRG1zkvBMCSidfNBltCae8n`
  (created 21:22, £55, same October camp run) sat `open` / `unpaid` with
  **`payment_intent: null`** right up to its 21:53 expiry.
- Her customer `cus_VGDlKWGd4ZAFsI` has **zero PaymentIntents, ever**.
- **Every** live charge on the account today is accounted for and none is hers:
  20:51 £55 (Charlotte Everett-Hare), 15:27 £30 + 15:26 failed £30
  (little.eeee), 15:15 £10 (Jess Leeman). Four charges, total.
- Only one Stripe customer exists for her email, and no PaymentIntent anywhere
  references her name or customer id.

So there is **no money-without-booking situation** — the failure mode that would
actually be serious here. The absence of a confirmation email is correct
behaviour: notifications fire from the webhook on payment, and no payment
occurred.

**Her booking:** `9a2dcafb-7e54-4d8d-9352-9d069188eedd`, `pending_payment`,
hold expiring 22:03 (session expiry 21:53 + `HOLD_GRACE_MINUTES`). Once it
releases she can simply book again — the camp run has room.

### Is this the same Onelink wall as Bunmi?

Same signature — zero PaymentIntents, never reached the card form — but **the
camp checkout is not systematically broken**, so do not assume it:

| October camp run `6c519802` | Count |
|---|---|
| confirmed | 9 |
| cancelled (failed/abandoned) | 3 |
| pending (Michelle) | 1 |

And the nine successful £55 payments used every route, Onelink included:
Apple Pay ×5, plain card ×2, **Onelink ×3**. Onelink demonstrably works on this
exact product.

So Michelle may have hit the Onelink prompt, or may simply have abandoned a
confusing page. **Ask her what screen she is on** before assuming.

### What to tell her

1. **She has not been charged** — categorically. Nothing is pending against her
   card.
2. Wait a moment for the hold to clear, then **book again**; there are places
   left.
3. If she is stuck on a "Onelink / enter the code we sent" screen, that is the
   issue from sections 3-4 above and she should reset her Onelink account.
