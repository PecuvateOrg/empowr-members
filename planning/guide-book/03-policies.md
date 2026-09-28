# 3. Policies: what a customer can and can't do

The published rules are **Programme Policies v1.2** and **Terms & Conditions v1.2**. The
app enforces them, so if the app refuses something, that is the policy working.

## The general rules

| Rule | Detail |
|---|---|
| **48-hour window** | A customer can cancel (for a refund) or move a booking **at least 48 hours before** the session. Inside 48 hours, the app won't let them. They email instead. |
| **Refunds go to the card** | Always to the card they paid with, usually within 5–10 working days. There is no account credit for a customer's own cancellation. |
| **Moving a date** | Same session, a different date, **once per booking**, with no money changing hands. Dates less than 48 hours away aren't offered as the new date. |
| **Courses** | Booked as a whole block, so **individual weeks can't be moved**. Whether a course can be cancelled depends on its setting (table below). |
| **When Empowr cancels a session** | Everyone booked is emailed, and **either refunded or credited**. Staff choose one for the whole date. See [04-admin-guide.md](./04-admin-guide.md). |
| **Subscriptions** | Cancel any time through **Membership → Manage or cancel**. Cover continues to the end of the paid month. |
| **Changing a booking a second time** | Not self-serve. The customer emails **enquiries@empowrcic.org**. |

## Per-session settings

Each session has its own **Cancellation policy** and **Members can move to another date**
settings, set in **Admin → Offerings**. What customers see follows these switches, and
the booking pages only mention moving a date where it's allowed.

⚠️ **These change.** Read on **2026-09-28** from the live system. Before quoting one to a
customer, check the offering in the admin.

| Session | Customer can cancel for a refund (48h+) | Customer can move date (once, 48h+) | Walk-ins at the door |
|---|---|---|---|
| Sk8 Skool for Kidz | ✅ Yes | ✅ Yes | ✅ Yes |
| Sk8 Skool for All Ages | ✅ Yes | ✅ Yes | ✅ Yes |
| Skate Jam | ✅ Yes | ✅ Yes | ✅ Yes (door price higher than online) |
| SYNKRON8: Roller Dance for Beginners | ✅ Yes | ✅ Yes | ✅ Yes |
| Roller Skate Events 15+ | ✅ Yes | ✅ Yes | ✅ Yes (door price higher than online) |
| **All Ages Roller Disco** | ❌ **Non-refundable** | ❌ No | ✅ Yes (door price higher than online) |
| **Roller Quad Camp** | ❌ **Non-refundable** | ❌ No | ✅ Yes (door price higher than online) |
| Beginners Foundation (course) | ✅ Yes | ❌ No (course) | ❌ No |
| Prep to Street Skate (course) | ✅ Yes | ❌ No (course) | ❌ No |

Prices are on each session's page and in **Admin → Offerings**. They're left out here
because they change.

## What the customer sees when the app says no

| Message | Why |
|---|---|
| "This session is non-refundable." | The session is set non-refundable (Roller Disco, Camp) |
| "Cancellations must be made at least 48 hours before the session." | Inside the window |
| "This session can't be moved to another date." | Moving is switched off for that session |
| "Courses are booked as a whole block, so individual dates can't be moved." | It's a course |
| "This booking has already been moved once…" | The one move has been used |
| "Bookings must be moved at least 48 hours before the session." | Inside the window |
| "There are no other dates available for this session at the moment." | No other date is 48h+ away with space |

## When staff are asked to make an exception

The app has no override for a customer's own cancellation or move. Anything outside the
rules is a **discretionary decision for the office**, not the door. Take the details
(name, session, date, what they want) and pass them on. Don't promise an outcome.

Refunds outside the self-serve rules are done by an admin in Stripe. Cancelling a whole
session uses the admin's **Cancel session**, which handles refunds and emails itself.
