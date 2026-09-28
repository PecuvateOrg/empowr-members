# 1. How it fits together

Read this first. Almost every customer question makes sense once you know these six
ideas.

## The six ideas

**1. One account, many skaters.** An **account** belongs to one adult (one email, one
password). That adult adds the people who skate, their **household**, including
themselves if they skate. A parent booking two children has one account with two (or
three) skaters in it.

> The most common early mix-up: a parent signs up, doesn't add themselves or their
> child as a skater, and then can't find anyone to book. The account is **not** a
> skater. Every person who skates has to be added under **Your household**.

**2. A waiver per person, once.** Every skater needs a signed risk waiver and consent
before they can be booked, subscribed, or taken as a walk-in. It is done **once per
person, not once per session**. Anyone who already signed on the separate waiver site
(waiver.empowrcic.org) with the same email is normally recognised automatically.

**3. Age is worked out from date of birth.** Each session has an age range. The app
greys out anyone outside it. Nobody needs to "choose" an age.

**4. Two ways to pay for a session:**

| | Pay per session (a **booking**) | Monthly (a **subscription**) |
|---|---|---|
| How | Add to basket → pay by card | Subscribe on the session's page → monthly card payment |
| Covers | One skater, one date (or one whole course) | One skater, one weekly session, every week |
| Ticket | Yes: a QR code ticket per skater | No ticket needed; they're on the register automatically |
| Cancel | Themselves, under the rules in [03-policies.md](./03-policies.md) | Any time, from **Membership → Manage or cancel** |

A child who goes to two different weekly sessions needs **two** subscriptions.

**5. The basket is the only way to pay.** Customers pick a session, choose who is
coming, and press **Add to basket**. They can add several bookings, then pay once. The
places are only held when they press **Continue to payment**. Until then, nothing is
reserved.

**6. A place is held for about 30 minutes while they pay.** When someone goes to the
card payment page, their places are held. If they don't finish, the hold drops off by
itself and the place goes back on sale. Nobody needs to do anything.

## Types of session

| Type in the app | What it means for booking | Examples (as of 2026-09-28) |
|---|---|---|
| Lesson / drop-in / event | Book **one date** at a time | Sk8 Skool, Skate Jam, SYNKRON8, Roller Skate Events, Roller Disco |
| Camp | Book one camp date; kit (skates, pads) chosen at booking | Roller Quad Camp |
| Course | Book the **whole course** in one payment, covering every week | Beginners Foundation, Prep to Street Skate |

HAF-funded holiday camp places are **not** booked in this app. They go through the
Holiday Activities site. Send those families there.

## Who can see what

| Person | Can use | Signs in at |
|---|---|---|
| Customer (member) | Their own account, household, bookings, tickets, membership | members.empowrcic.org |
| Door staff | **Door check-in** only: today's and tomorrow's sessions, registers, scanning tickets, taking walk-ins | members.empowrcic.org/checkin |
| Admin | Everything: check-in, offerings and dates, cancelling sessions, venues, analytics, restoring lost bookings, guides | members.empowrcic.org/admin |

Staff access is given by adding the person's email to an allowlist. They sign up as
normal first, then a developer adds their email. Door-only staff who try `/admin` are
sent to their own account page. That is expected, not a fault.

## What happens behind the scenes (so you can explain it)

- **Payments are taken by Stripe**, a secure card payment page. Empowr never sees card
  numbers. The booking only becomes **Confirmed** once Stripe tells the app the money
  arrived, usually within seconds.
- **Emails** come from the app automatically: account confirmation, sign-in links,
  password reset, booking confirmation with tickets, cancellation, date move, and
  session-cancelled notices. Replies go to Empowr's general inbox.
- **Subscribers are added to each register automatically** the moment they subscribe,
  for every future date. A catch-up runs every night for anything missed, such as a
  date added later. Until then, those people show in a separate **Recently subscribed**
  list on the register (see [04-admin-guide.md](./04-admin-guide.md)).
- **Staff alerts** go to the bookings inbox for each new booking and new subscription,
  and for anything that needs a human, such as a payment that arrived with no booking
  attached. See [05-troubleshooting.md](./05-troubleshooting.md).

## Things the app does not do (yet)

Knowing these saves time. Don't promise them to a customer.

- **No account credit or vouchers to spend.** Refunds go back to the card. (Credit notes
  are being built. **Not live yet.**)
- **No private or group bookings** through the app. (Specified. **Not live yet.**)
- **Staff can't book on a customer's behalf** for an ordinary online booking. At the
  door, use **walk-in**. For anything else, the customer books on their own phone.
- **Moving a booking to another date happens once**, and only for sessions that allow it.
  More changes go through the enquiries inbox.
- **A departure arrangement ("can leave on their own") belongs to one date.** It doesn't
  move with a booking that is moved to another date.
