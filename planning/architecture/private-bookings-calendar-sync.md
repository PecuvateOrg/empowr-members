# Private bookings — Google Calendar sync

Status: **PLAN — owner answered all four questions 2026-10-01 (below); build in a later session.** Nothing here is built.
Implements owner decision 1 of 2026-10-01 in [../spec/private-bookings.md](../spec/private-bookings.md):
the general@empowrcic.org account, calendar **"Empowr Bookings"**.

## Why

Staff read the "Empowr Bookings" Google Calendar; online bookings never reach it. At go-live the
calendar's own bookings were not in Members either and had to be copied in by hand as blocks
(2026-10-01). Until this ships, every booking taken by phone or email must be blocked in
**Admin → Private bookings** by staff.

## Shape: one-way, Members → Calendar

**Members stays the source of truth** (spec: "Google Calendar is not a launch dependency… calendar
sync is a later mirror"). The calendar becomes a read-only *view* for staff. It is never read back:
a staff member editing or adding an event in the calendar does **not** change availability, so new
outside bookings keep going into Members (block or "paid before online booking"), never the calendar.

| In Members | In the calendar |
|---|---|
| Booking confirmed (online paid, or staff-recorded) | Event created |
| Skaters added (online or door top-up confirmed) | Event updated with the new total |
| Block added | "Unavailable" event created (so staff see why a date is shut) |
| Booking cancelled / block removed | Event deleted |
| Booking awaiting payment | Nothing (holds come and go every 30 minutes) |

**Event content** (staff-only calendar, but kept minimal):
- Title: `BOOKED: Birthday Party — 14 skaters` / `BOOKED: Group coaching — 5` / `BOOKED: 1-to-1 coaching` / `Unavailable — <note>`
- Time: the booking's own start/end (Europe/London).
- Description: host's name, hire size counts and gear-only count, and a link to the door check-in
  screen. **No** guest names, children's details, medical notes or phone numbers — those stay in Members.

## How it stays right when Google is down

1. **Write after, never inside, the booking.** The calendar call happens after the database has
   confirmed the booking. A failure can never undo or block a paid booking (spec acceptance scenario:
   "Calendar write failure does not free a paid interval; staff receive a reconciliation alert").
2. **Idempotent by design.** Each event's Google ID is derived from the Members booking id, so
   "create" twice is harmless and a retry can never make a duplicate.
3. **A reconcile job puts it right.** A Netlify scheduled function (hourly) compares every future
   booking and block with the calendar and creates, updates or deletes to match. It is also how the
   existing six blocks and anything made before launch get onto the calendar the first time.
4. **Staff are told** if the calendar has been failing for more than an hour (one email to
   bookings@, not one per booking).

New column: `mem_private_bookings.calendar_synced_at` (when the event last matched), so the job and an
admin view can see what is out of date. One additive migration.

## What the owner sets up once (about 10 minutes, Google side)

1. In Google Cloud (any project on the empowrcic.org account): **create a service account** — a
   robot login for Members. Enable the **Google Calendar API**. Create a **JSON key**.
2. In Google Calendar as general@: **share "Empowr Bookings" with the service account's email**,
   permission **"Make changes to events"**.
3. Give the key to Claude **through the vault** (never pasted in chat). Claude stores it as
   `MEMBERS_GOOGLE_CALENDAR_SA_KEY_PROD` and distributes it to Netlify with the calendar's ID
   (`MEMBERS_GOOGLE_CALENDAR_ID`), like every other credential.
4. For testing: a second calendar (e.g. "Empowr Bookings — TEST") shared the same way, used only by
   the LAN preview.

Step-by-step screenshots-level instructions are written for the owner at the start of the build.

## Build order and proof

1. Migration (`calendar_synced_at`) — additive, applied with owner OK.
2. `lib/google-calendar.ts`: authenticated client + one pure function that turns a booking into an
   event. Unit-tested (titles, times across the October clock change, no personal data leaks).
3. Hook the writes into the four places that change a booking: webhook confirm, top-up confirm,
   staff record/block/unblock, cancellation.
4. The hourly reconcile job + the "failing for an hour" alert.
5. **LAN preview against the TEST calendar:** book, add skaters, block, unblock, cancel; then switch
   off the network and confirm the booking still completes and the job catches up afterwards.
6. Owner check, merge, first live reconcile run copies existing blocks/bookings into the real calendar.

One PR, one build.

## Owner answers (2026-10-01)

1. **Delete the ~60 "Available" placeholder events** once the sync is live — yes. (Done by the first
   live reconcile run's checklist, after confirming the sync wrote the real bookings.)
2. **Blocks appear** as "Unavailable — <note>" — yes.
3. **Host's name in the event** — yes; nothing else personal.
4. **Only general@ needs access for now.** More people are added later **on Google's side** (calendar →
   Settings and sharing → Share with specific people); nothing to build. Default new staff to "See all
   event details": anyone with "Make changes" can edit synced events (the hourly reconcile restores
   them, and calendar edits never change availability in Members).

## Not included

- Reading the calendar back into Members (two-way sync). Rejected: two sources of truth is how the
  2026-10-01 near-double-booking happened.
- Customer-facing calendar invites.
