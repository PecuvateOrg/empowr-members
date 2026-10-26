# Spec — Member messaging and installable app (PWA)

**Status: READY TO BUILD 2026-10-26** (open questions answered by the owner the same day). Scope agreed with the owner the same day: one-way messages (options A + B) and push alerts. Two-way chat (option C) is deferred; when it comes, replies go to PecuvateCRM, not a new inbox in Members.

## Why this is needed

On 2026-10-26 the Roller Quad Camp start time was wrong on every booking. Telling the 8 booked families meant a developer querying the database and sending email by hand, under time pressure, on the morning of the camp. Staff have no way to reach the people booked on a session.

What staff need: pick a session, write a message, and every family booked on it is told — by email, in their account, and on their phone's lock screen if they installed the app.

## Who can send

Uses the two staff roles Members already has (`src/lib/admin.ts`):

| Role | Gate | Can message |
|---|---|---|
| Admin | `ADMIN_EMAILS` | Everything below |
| Coach / door team | `CHECKIN_EMAILS` (`getAuthedCheckinStaff`) | Families booked on **one session**, today to 7 days ahead |

Coaches are limited to session audiences because their need is operational ("running late", "bring knee pads"). Wider audiences stay admin-only.

## Audiences

| Audience | Who receives it | Role |
|---|---|---|
| One session | Accounts with a `confirmed` booking on that occurrence | Coach, admin |
| One offering | Confirmed bookings on any **upcoming** occurrence of that offering (e.g. every camp day) | Admin |
| One member | A single account (found with `lib/member-search.ts`) | Admin |

**No "all members" audience in this version.** These are service messages about something a person has booked, which need no marketing consent. A message to everyone is marketing and belongs in Brevo, where consent and unsubscribe are already handled.

Cancelled bookings are excluded. One message per **account**, not per booking: a parent with two children on the session gets one message naming both.

## What the member receives

Each message goes out on every channel available to that account, at once:

1. **Email** (always) — Resend, from `bookings@empowrcic.org`, replies to `bookings@`. Subject and body as written, plus the session name and date in a fixed footer and a link to the message in their account.
2. **In-app inbox** (always) — `/messages` in the member area: newest first, unread shown bold, a badge on the nav (SiteHeader + BottomNav). Opening a message marks it read.
3. **Push notification** (if they allowed it on a device) — title = subject, body = first line, tapping opens the message.

An **urgent** tick (coach and admin) puts "URGENT:" in the subject and push title. It changes nothing else — every message sends immediately.

## Installable app (PWA)

Already in place: `public/site.webmanifest` (name, icons, `display: standalone`, theme colour).

To add:

- **Service worker** (`public/sw.js`): receives push events and shows the notification; on tap, opens or focuses the app at the message. No offline caching of pages in this version — booking data must never come from a stale cache.
- **Install prompt:** a dismissible banner in the member area. On Android/desktop Chrome it uses the browser's install prompt. On iPhone it shows "Tap Share → Add to Home Screen" (iOS has no prompt). Dismissed = hidden for 30 days.
- **Push permission request:** asked only after a clear action — a "Turn on alerts" button on the account page and in the install banner — never on page load (browsers penalise that, and it gets refused). Explains first: "Get alerts about your bookings, like a change to a session time."
- **iPhone limit:** push works only once the app is added to the home screen (iOS 16.4+). The account page says so.

## Data model

New tables (shared `empowr-cic` project — read `gotchas.md` and the Supabase blueprint before adding):

- `mem_messages` — `id`, `sender_user_id`, `sender_role` (`admin` | `coach`), `sender_name`, `audience_type` (`occurrence` | `offering` | `account`), `audience_id`, `subject`, `body`, `urgent`, `created_at`.
- `mem_message_recipients` — `message_id`, `account_id`, `email_status`, `email_id` (Resend), `push_sent_count`, `read_at`. Unique `(message_id, account_id)`.
- `mem_push_subscriptions` — `id`, `account_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`. A push that returns 404/410 deletes its row.

RLS: members can read only their own recipient rows and the messages they belong to, and update only their own `read_at`. Inserts go through service-role API routes behind the role gates above.

**Account deletion:** `mem_erase_account()` must delete the account's push subscriptions and recipient rows. Add this in the same migration.

## Sending

`POST /api/admin/messages` (role-checked by audience):

1. Resolve recipients from the audience and **show staff the count and names before sending** ("6 families, 7 children"). Sending needs a second click.
2. Insert the message and recipient rows.
3. Email: Resend batch send (≤100 per call), one per account, idempotency key = message id. Store each email id; a failed send is shown on the message, not swallowed.
4. Push: Web Push with VAPID keys (new secrets, stored via `/sync-secrets`, Netlify = production) to every subscription of each recipient.
5. Staff see a sent log at `/admin/messages`: who sent what, to how many, email delivered/failed counts, read count.

## Out of scope (this version)

- Replies / two-way chat (option C) → PecuvateCRM later.
- WhatsApp (`whatsapp_opt_in` exists; CRM channel planned).
- Scheduled messages, attachments, "all members" broadcasts.
- Offline pages.

## Sender name and replies (owner, 2026-10-26)

1. **Coach window: today to 7 days ahead** — confirmed. It gives time for a change to reach families before the session.
2. **Sender name follows the sender's role**, decided server-side from the role gate, never typed by the sender:
   - Coach → `"<Coach first name> at Empowr CIC" <bookings@empowrcic.org>`, and the email, inbox and push sign off with the coach's name. Families get a named person to talk to.
   - Admin → `"Empowr CIC" <bookings@empowrcic.org>`, no personal name.
   - The coach's name comes from their own `mem_accounts.name`. A coach whose account has no name cannot send until it is set (the send screen says so). The name is stored on `mem_messages.sender_name` at send time, so the sent log stays right if the name later changes.
   - An email on both lists (`ADMIN_EMAILS` and `CHECKIN_EMAILS`) is treated as admin. The send screen shows "Sending as: …" before the confirm click.
3. **Replies go to `bookings@` for now**, including coaches' messages; the admin team answers them.

**Later (with option C):** as the coach team grows, a reply should reach the coach running that session. That needs coaches assigned to sessions (nothing in Members records this today) and replies landing in PecuvateCRM, routed to that coach. Not in this version.

## Build order

1. Tables + RLS + erase-account change (migration; regenerate the ledger with `dump-ledger.mjs`).
2. Admin/coach send screen + email + inbox (`/messages`, nav badge) — useful on its own.
3. Service worker, install banner, push permission, push sending.
4. Verify live with tech@pecuvate.com: install on Android and iPhone, allow push, send a session message from a coach account, confirm email, inbox, and lock-screen alert; deny-permission and expired-subscription paths.
