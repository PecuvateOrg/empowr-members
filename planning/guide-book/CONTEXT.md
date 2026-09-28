# Guide Book — Workspace Index

The staff runbook for Empowr Members: how the platform works, how to guide a customer
through it, and how to use the admin area. Written for **Empowr staff and volunteers,
not developers**. Plain language, the words that appear on screen, and "if this
happens, do this".

This is the **source draft**. It is written here first so it can be checked in one
place, then built into a page in the admin area (`/admin/guides`), beside the existing
check-in guide. See [Building the admin page](#building-the-admin-page) below.

| File | Covers | Read it when |
|---|---|---|
| [01-how-it-fits-together.md](./01-how-it-fits-together.md) | Accounts, households, waivers, bookings, subscriptions, and who can see what | You are new, or something "doesn't make sense" |
| [02-customer-journeys.md](./02-customer-journeys.md) | Every step a customer takes, screen by screen, with the exact button names | Walking a customer through something |
| [03-policies.md](./03-policies.md) | Cancelling, moving dates, refunds, walk-in prices, per session | A customer asks "can I…?" |
| [04-admin-guide.md](./04-admin-guide.md) | The admin area: check-in, registers, walk-ins, offerings, dates, cancelling a session, restoring a lost booking | Using the admin yourself |
| [05-troubleshooting.md](./05-troubleshooting.md) | "The customer says…" and "An alert email arrived…" with what to do | Something has gone wrong |

---

## Accuracy

- **Describes what is live**, meaning the `main` branch deployed at
  members.empowrcic.org, checked on **2026-09-28**. Anything on a branch that is not
  merged is left out, or marked **Not live yet**.
- **Per-session rules (refunds, moving dates, door prices) come from the live
  database**, not from code comments, and were read on 2026-09-28. They are
  per-session switches that staff can change in the admin, so
  [03-policies.md](./03-policies.md) can go out of date without any code changing.
  Re-check the offering in the admin before quoting a rule to a customer.
- Session content (what a session *is*, who it's for, the programme) comes from the
  Empowr CIC knowledge base, not from here.

## This repository is public

Everything in this folder is readable by anyone. Keep it to **how things work**. Never
add customer names, emails, booking or payment references, staff email addresses, or
open security problems. Worked examples use invented names.

---

## Building the admin page

Notes for whoever turns this into `/admin/guides/...` pages:

1. **The existing check-in guide is out of date and gives door staff the wrong
   instruction.** `/admin/guides/check-in` and `/checkin/guide` still say subscribers
   have "no Check in button" and appear only in a separate list. Since Phase 2 Step 4,
   subscribers appear **in the main register table**, tagged **Subscribed**, with a
   normal **Mark attended** button. The separate list is now **Recently subscribed**. It catches
   the gaps only: a date added after someone subscribed, or an automatic add that failed.
   The nightly catch-up clears both.
   [04-admin-guide.md](./04-admin-guide.md) has the corrected version. Rewrite both
   guide pages in the same change that adds the new ones.
2. **"Restore a lost booking" is admin-only in practice.** The page's own comment says
   the whole door team can reach it. However, `/admin/*` is gated to `ADMIN_EMAILS`, and
   there is no route to it under `/checkin`. The API accepts door staff, but the page
   does not. Decide which is intended, then make the guide and the code agree.
3. Door-only staff (`CHECKIN_EMAILS`) see `/checkin`, not `/admin`. Anything written
   for them has to be reachable from `/checkin/guide` too, as the current check-in
   guide is.
4. **Cancelling a session with subscribers is broken.** `Refund everyone` finds no
   payment behind a subscriber's £0 booking, counts it as failed, and doesn't email
   them. The session is already marked cancelled. `Credit everyone` issues £0 credits.
   The guide gives staff a manual workaround. Fix the route, then delete that step from
   [04-admin-guide.md](./04-admin-guide.md).
5. **The Over capacity box is also out of date.** It still says "Subscribers hold no
   booking", which stopped being true at Step 4. Reword it in the same change.
6. Split by audience in the UI: the door guide stays short and mobile-first. The admin
   guide and customer-help pages can be longer.
