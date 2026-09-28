# 4. Admin guide

Two staff areas:

- **Door check-in**, at members.empowrcic.org/checkin: for door staff. Registers and
  walk-ins only.
- **Admin**, at members.empowrcic.org/admin: for admins. Everything below.

Both use the same register screen, so the door sections apply to both.

---

## Before anyone skates: the safeguarding rules

1. **Check the waiver.** If a row says **"No waiver — do not let them take part"**, it
   means exactly that, with no exceptions on the night. The **Mark attended** button isn't
   offered for that person. They can sign on their phone at /waiver. Then refresh.
2. **Read the flags under each name.** Medical notes, how a child is leaving, and the
   emergency contact show as badges. Tap the **arrow** on the right of a row to open the
   full detail.
3. **Children are collected in person unless the register says otherwise.** A
   "leaving unaccompanied" arrangement belongs to **that date only**. If none is shown,
   the child is handed over in person.

---

## The Admin home page

Tiles: **Check in**, **Offerings**, **Guides**, **Venues**, **Analytics**, **Restore a
lost booking**. Below them, **Next 7 days** lists every upcoming session with its
booked count. Tap one to open its register.

---

## Check in and registers

**Check in** lists **Today** and **Tomorrow**. Tap a session to open its **register**.

At the top: the session, the time, **"X of Y places"**, and a line like **"12 booked ·
2 subscribed · 1 awaiting payment"**.

### The main table

| Column | What it shows |
|---|---|
| Name | Skater, age, and safety flags |
| Status | Confirmed / Attended / Payment pending, plus the waiver badge |
| Paid | Amount paid. **Door** means a walk-in. **Subscribed** means covered by a subscription (paid monthly, nothing today). |
| Check in | **Mark attended** button (shows **Checked in** once done), the waiver warning, or **Release place** for an unpaid hold |

### Checking someone in

- **Scan their ticket's QR code** with your phone camera. It opens their check-in page
  directly. Check the name matches the skater, then press **Mark attended**.
- **No phone or no ticket?** Find them on the register and press the same button.
- **Subscribers** are in the main table like everyone else, tagged **Subscribed**. Press
  **Mark attended** in the same way. They have no ticket, so find them by name.
- Checking in twice is safe. It just tells you they're already in.

### "Recently subscribed" (below the table)

These people subscribed **since the last nightly catch-up** and haven't been added to the
table yet. Their place is reserved and their waiver badge is shown. **There's no Mark
attended button for them yet.** Let them in and tick them off by hand. They move into the table
automatically, usually within a day.

> ⚠️ The older in-app "Checking people in" guide says every subscriber is in a separate
> list with no button. That was true before subscribers were added to registers
> automatically, and it's being rewritten.

### Payment pending and "Release place"

**Payment pending** means someone is on the card payment page right now, or walked away
from it. The place is held for about 30 minutes, then **released automatically**.
Normally, leave it alone.

Only press **Release place** → **Yes, release** if you need that place back **now** and
you're sure they aren't paying (for example, they've told you they're leaving). **It
can't be undone.** If they then pay anyway, they're charged with no place, and the office
has to refund them.

### Over capacity

A red **Over capacity** box means more people are entitled to attend than the room holds,
usually because of subscribers. Run the session. Tell the office the same day so sales
can be stopped.

### Roller Quad Camp: skates and gear

Camp registers have a **Skates & protective gear** panel at the top: skate hire totals by
size, and a searchable, filterable list of each child's choices. Use it to prepare kit
before the day.

### Courses (Beginners Foundation)

Courses have **one register per week**. From **Check in**, under **Beginners Foundation**,
tap **Open register** for the course, choose the **session date**, then **Mark attended**
for each person. Future dates show **"Check-in opens on the session date."** Other course
types still use a paper register.

---

## Walk-ins (someone turns up without booking)

Only on sessions that have a **door price** set (see [03-policies.md](./03-policies.md)).
Otherwise the register says walk-ins can't be taken, and why.

1. On the register, press **+ Add walk-in (£X at the door)**.
2. **Search by name** (2+ letters) → **Search**. Everyone attending needs a member
   account. If nobody is found, they sign up on their own phone (it takes a couple of
   minutes), then search again.
3. Check the result before taking money:
   - **Already on the register**: don't take payment.
   - **Already covered by [subscription] — do not take payment**: their monthly
     subscription covers it.
   - **Outside the age range**: they can't join this session.
   - **No waiver on file**: they sign at /waiver on their phone, then search again.
4. Adult: press **Take payment**. Child: press **Continue**, answer **Leaving
   unaccompanied after this session** (leave it off if they're being collected, which is
   normal), then **Take payment**.
5. A **QR code** and **Copy payment link** appear. They scan it and pay on their own
   phone. The place is held for about 30 minutes, and the register updates itself when
   the payment lands. **Add another** for the next person.

---

## Offerings (sessions, courses, camps, events)

**Admin → Offerings** lists everything, with **Inactive** marking anything hidden from the
public.

**Creating or editing an offering:**

| Field | Notes |
|---|---|
| Title, URL slug | The slug is the web address: lowercase-with-hyphens. Don't change it on a live session. Links from EELA point at it. |
| Type | Lesson, drop-in, event, camp, course |
| Booking model | **Per date** (book each date) or **Per course** (one payment covers every week) |
| Description, What to bring | Shown on the public session page |
| Min / Max age | Enforced at booking, subscribing, and walk-ins |
| Price / Walk-in price / Early bird price | **In pence**: 700 = £7. Leave walk-in blank to turn walk-ins off. |
| Venue | Default venue for its dates |
| Cancellation policy | **Standard (48h cancel and refund window)** or **Non-refundable** |
| Members can move to another date | The self-serve date move |
| Active (visible on the public site) | Untick to hide without deleting |

⚠️ The cancellation and move settings **are the customer-facing policy**. Changing them
changes what customers are offered straight away. Check with the office first.

### Dates (for "per date" offerings)

Inside an offering: add dates with **Starts**, **Ends**, **Venue** (blank = offering
default), **Capacity** (blank = venue default), and **Early bird capacity** (blank = no
early bird). Early-bird places are **included in** the capacity, not extra, and need an
early-bird price on the offering.

Each date shows **"X booked (Y paid · Z subscribed) / N capacity"** and has **Register**
and **Edit**. A date with no bookings can be removed. Once anyone has booked, you get
**Cancel session** instead.

### Course runs (for "per course" offerings)

Add a run with a **Label** (e.g. "Sept 2026 intake"), start and end dates, weekly start
and end times, price (blank = offering price), capacity (blank = unlimited), and venue.

---

## Cancelling a session (Empowr cancels)

On the offering's date → **Cancel session**:

1. Optionally write a **Reason**. It's shown in the email to customers.
2. Choose **one** outcome for everyone on that date:
   - **Refund everyone**: money goes back to each card. **Use this one.**
   - **Credit everyone**: gives each booking a credit that expires in 12 months.
     ⚠️ **Customers can't spend credit yet.** Credit notes aren't live, so a credit
     today is a balance they can't use. Don't choose this until spending is live.
3. Every booked customer who **paid** is emailed "Session cancelled". Unpaid holds are
   just released.
4. **If the session had subscribers, contact them yourself.** Their places aren't paid per
   session, so the refund step can't process them. The result says **"N failed — check
   logs"**, where N is usually the number of subscribers. They are **not** emailed, and
   they still show as booked on the cancelled date. Before you cancel, open the
   **Register** and note who is tagged **Subscribed**, then tell them the session is off.
   (A fix is due. This step goes away when it lands.)

---

## Restore a lost booking

Rare, but important. It's for when **a customer paid but has no booking and isn't on the
register**. You'll normally learn about it from a **"Payment taken, no booking"** alert
email to the bookings inbox (see [05-troubleshooting.md](./05-troubleshooting.md)).

1. **Admin → Restore a lost booking**.
2. Paste the **Checkout reference** from the alert email. It starts with `cs_`.
3. **Restore this booking**. The app checks with Stripe that the payment is real, gives
   the place back, and emails the ticket. It never takes or refunds money.
4. Read the result:
   - "The member has been emailed their confirmation and ticket": done.
   - "⚠️ … the confirmation email did NOT send": **tell the customer yourself**.
   - "This session is now over its capacity": tell whoever runs the door.
   - If it says the session is full, only an admin gets **Restore anyway, over
     capacity**.
   - If it says the customer has **already booked again**, don't restore. Refund the
     duplicate payment in Stripe instead.

(Currently only admins can open this page. See the note in [CONTEXT.md](./CONTEXT.md).)

---

## Venues

**Admin → Venues**: name, postcode, address, and default **capacity**. The venue capacity
is used by any date that doesn't set its own.

## Analytics

**Admin → Analytics**: new signups this week and month, total takings, how far people get
(**Signed up** → **Added a skater** → **Booked and paid**), a weekly trend, and
subscriptions. If it says **"Could not load the
figures"**, the numbers failed to load. It isn't showing zero. Try again later.
