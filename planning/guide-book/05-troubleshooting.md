# 5. Troubleshooting

Find what the customer is saying, or which alert arrived, and follow the steps. If none
of these fit, take the details (name, email, session, date, what they see on screen) and
pass them to the office. Don't guess at a fix.

**Useful first question:** "What does the screen say, exactly?" Most messages in the app
say what to do next.

---

## "The customer says…"

### Accounts and signing in

**"I never got the confirmation email."**
Check spam and junk. Wait two minutes. Check the spelling of the email. If it was
mistyped, they sign up again with the right one.

**"I've forgotten my password."**
Easiest: sign in with **Email me a link** instead. Or use **Forgotten your password?**.
The reset link expires after an hour.

**"It says no account found."**
They haven't signed up with that email. They may have used a different address. If not,
they **Create an account**.

**"I'm signed in but can't book anyone."**
Nobody has been added as a skater yet. **Your account → Your household → Add myself as a
skater** or **Add a child or someone else**.

### Waivers

**"It keeps saying I need a waiver."**
The waiver is per person. Check the named person is ticked under **Who does this cover?**
on /waiver, then **Save waiver**. If they signed on the separate waiver site, they may have
used a different email or spelled the child's name differently. Signing again in the app
fixes it.

**"I signed on the waiver site and it's not recognised."**
As above. Signing in the app takes a minute and is recorded permanently.

### Booking and paying

**"My child is greyed out."**
The reason is shown beside their name: outside the age range, already covered by a
subscription (nothing to pay), or waiver needed.

**"It said nothing was held / not enough spaces."**
One of the sessions in their basket is full. **Nothing was charged.** Remove or change
that booking (the basket outlines it where it can), then **Continue to payment** again.

**"The early bird price disappeared."**
The early-bird tickets sold out while they were booking. Open that booking from the
basket (**Edit**) and choose **Standard**.

**"It says someone is already booked on this session."**
They booked it already. Check **My bookings**, then remove the repeat from the basket.

**"I paid but I don't know if it went through."**
1. Ask them to check **My bookings**.
   - **Confirmed**: it's done. The ticket is under **View ticket**.
   - **Payment pending**: they're mid-payment, or left the payment page. If they didn't
     finish paying, **they haven't been charged**. The hold clears within about 30
     minutes, then they can book again.
   - Nothing there at all: go on.
2. Ask whether money actually left their account: a bank notification, not just a
   screen they saw.
   - **No money taken** → nothing is owed. They book again.
   - **Money taken, no booking** → pass it to an admin now: name, email, session, amount,
     time. An admin checks Stripe and, if it's real, uses **Restore a lost booking** or
     refunds. Tell the customer it will be sorted and they won't pay twice.

**"The payment page asked for a code sent to a phone (Onelink)."**
Onelink is Stripe's "remember my card" service. It's the customer's own account with
Stripe, not with Empowr, and **Empowr cannot reset it**. If the code goes to a phone they
don't have:
- Look on the payment page for an option to **pay without Onelink**, or to enter card
  details directly, and use that.
- Otherwise they reset their Onelink account at **support.onelink.com**. That allows a new
  phone number after confirming their email. Resetting deletes the cards saved in Onelink,
  which doesn't matter for Empowr.
- Reassure them: **if they didn't get past that screen, they haven't been charged.**

**"Can you book it for me?"**
For an ordinary booking, no. It has to be done from their account. Walk them through
[02-customer-journeys.md](./02-customer-journeys.md) E on their phone. At the door, use a
**walk-in**.

### Tickets and the door

**"I can't find my ticket."**
**My bookings → View ticket**, or the link in the confirmation email. At the door, staff
can find them on the register by name, so no ticket is needed.

**"The ticket says 'no longer valid'."**
That booking was cancelled or refunded. Check **My bookings** for another one. If it's a
surprise to them, pass it to the office.

**"I subscribe but I'm not on the register."**
Look in **Recently subscribed** below the table first. Anyone the automatic add missed
(for example, on a newly added date) waits there until the overnight catch-up. If they're in neither place, the subscription isn't active right
now: cancelled, or a payment failed. Take them as a **walk-in at the door price** if the
session has one, and ask them to check **Membership** (a **Payment failed — update your
card** badge means their card was declined). Don't let them in free.

**"I'm in the table *and* I paid for today."**
They paid for a session their subscription already covers. Let them skate, then tell the
office so the payment can be refunded.

### Cancelling, moving, refunds

**"The app won't let me cancel or move."**
The screen gives the reason. See the table in [03-policies.md](./03-policies.md). Anything
beyond that is an exception for the office.

**"When will my refund arrive?"**
It goes back to the card they paid with, usually within **5–10 working days**, depending
on their bank.

**"I moved my child's booking. Do I need to do anything?"**
If the child was allowed to leave on their own, **yes**. That permission was for the old
date only. Until it's given again for the new date, staff will expect to hand the child
over in person.

**"I want to change it again."**
A booking can be moved once. Further changes go to **enquiries@empowrcic.org**.

### Subscriptions

**"How do I cancel my subscription / change my card?"**
**Membership → Manage or cancel**. They stay covered to the end of the month they've paid
for.

**"My Skate Jam subscription stopped charging."**
Expected outside the season (3 September – 25 March). It restarts automatically.

---

## "An alert email arrived…"

These come to the **bookings inbox**.

| Subject starts with | Meaning | Do |
|---|---|---|
| **New booking —** | Someone booked and paid | Nothing. For information only. |
| **New subscription —** | Someone subscribed | Nothing. They're added to registers automatically. |
| **⚠️ Payment taken, no booking** | The customer was charged, but their held place had already been released | **Act today.** Admin: **Restore a lost booking** with the Checkout reference (`cs_…`) from the email. Or refund in Stripe if the customer has since rebooked, or no longer wants it. |
| **⚠️ Payment taken, booking status unknown** | The customer was charged. The app couldn't check whether their booking survived. | Look the customer up (register, or ask them to check **My bookings**). Don't assume either way. Restore or refund as above. |
| **⚠️ Checkout closed without payment settling** | Stripe closed a checkout whose payment hadn't completed | Check Stripe for that payment. If money did arrive, treat it as "Payment taken, no booking". |
| Slot ambiguity warning | A subscription plan matches its sessions in a way the system can't resolve | Pass it to the developer. No customer action. |

⚠️ **Each alert is sent once.** There's no reminder and no queue. An alert that has been
read but not dealt with is a customer who has paid for nothing. Reply-all or forward it
with what you did, so everyone can see it's handled.

---

## Where to send things

| Thing | Goes to |
|---|---|
| Change a booking beyond the self-serve rules, exceptions, complaints | enquiries@empowrcic.org (the office) |
| Payment problems, refunds, restoring lost bookings | An admin |
| Something looks broken in the app (an error page, a button that does nothing) | The office, with a screenshot, the time, and what they pressed |
| HAF-funded camp places | The Holiday Activities site. Not booked in this app. |
