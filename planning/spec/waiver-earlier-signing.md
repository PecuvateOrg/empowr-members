# Waiver: sign when a skater is added, and inside the booking

Status: **Built and live 2026-10-04** (#103, #104). The team asked for adding a skater and signing to be one form, so Part 1 became that rather than a prompt after adding. Decisions are in `planning/decisions/CONTEXT.md`.

## Why

Customers find being stopped by the waiver at booking time confusing. PR #98
(2026-10-04) made the stop clearer: a banner, signed/needed badges and a
return link. But signing still means leaving the booking for `/waiver`.
Customers would rather have it done in advance.

## Why signing used to wait for booking, and why that no longer holds

- **2026-08-09:** the Waivers app deleted `waiver_responses` after 24 hours,
  deliberately, to keep as little data as possible. A waiver signed with no
  session attached was gone the next day, so a waiver had to be signed close
  to attending. That is the "people shouldn't sign without booking" reason.
- **2026-08-15 / 08-17:** retention was rebuilt as a 3-year evidence window,
  and Members got its own `mem_waiver_consents` table, which that purge
  doesn't touch. A waiver signed in `/waiver` already isn't tied to a booking.
  `submitWaiver()` writes the signing date as `session_date` and
  `session_id: null`.
- **2026-10-04:** retention is now 3 years, or until a child turns 21 if that
  is later. It is stated in Privacy Policy v1.5.

So nothing technical stops a waiver being signed before a booking. Today's
behaviour is a leftover of the 24-hour design, not a current rule.

## The build

### Part 1: offer the waiver when a skater is added

- `HouseholdManager.tsx`: after a successful add, show a panel:
  "Sign {name}'s waiver now so you can book straight away" with
  **Sign now** / **Later**.
- **Sign now** opens the waiver inline (see the shared component below), with
  that person preselected. The emergency contact entered for the skater is
  used to pre-fill the waiver's.
- If several people are unsigned, offer one waiver covering all of them. Don't
  ask once per person, because one waiver can cover a whole household.
- **Later** closes the panel. The existing "needs a waiver" banner and badges
  stay as they are.
- Also offer it at first account setup, if that has a separate step.

### Part 2: sign inside the booking

- `BookingForm.tsx`: the "Sign the waiver now" button opens the waiver in
  place (a modal, or a panel under the banner) instead of linking to
  `/waiver`.
- When it succeeds, call `router.refresh()`. The page recomputes
  `waiverSigned` from `checkWaivers()`, so the badges and gate update without
  the client having to work out cover itself.
- Signing happens *before* the hold (the gate blocks the hold, as decided
  2026-07-09), so no capacity timer runs while the customer signs.
- Do the same in `SubscribePanel.tsx` and the private-booking forms, or leave
  them using `WaiverLink`. Decide this during the build; the shared component
  makes it cheap.

### Shared component

- Change `WaiverForm.tsx` so it works both as a page and embedded:
  - add an `onSigned(covered)` prop; when it is passed, skip the full-page
    success screen and the `returnTo` navigation
  - add a `preselectIds` prop
- `/waiver` stays as it is, for links in emails and the account page.
- No API change: `POST /api/waivers` and `submitWaiver()` are reused
  unchanged.

### Unchanged

- The booking gate (`checkWaivers` / `persistWaiverMatches`) still fails
  closed on every path, including admin manual booking and walk-ins. Signing
  earlier is optional and is not a replacement for the gate.

## Issues found

1. **🔴 A signed waiver never expires, but its evidence does (raised 2026-09-04,
   still open).** `mem_waiver_consents.expires_at` is never written. When the
   waiver record is deleted after 3 years, the consent row stays with a null
   `waiver_response_id`, so the person still reads as covered. Signing earlier
   lengthens the time between signing and attending, which makes this easier
   to hit. **Fix in this build:** have `recordWaiverConsent()` set
   `expires_at` to the same date the evidence is deleted (3 years, or age 21
   if later). Then the gate asks for a new signature exactly when the old one
   disappears. This needs owner sign-off on making that the validity rule.
2. **🟡 Keeping as little data as possible.** Someone who signs and never books
   has their waiver and emergency contact kept for 3 years or more. The policy
   allows this, and "Later" keeps it optional. Check that the wording of
   Privacy Policy v1.5 covers waivers signed before any booking.
3. **🟡 A waiver signed under a different email is invisible to the gate
   (open).** This is unchanged by the build. Signing in-app under the account's
   own email avoids it, so the build may reduce it a little.
4. **🟢 Repeated prompts.** One add-then-prompt per person would annoy a parent
   adding three children. The single combined waiver in Part 1 handles this.

## How to measure it

`booking_blocked` with `reason = waiver_required` (analytics funnel spec)
should fall after release. Compare the 2 weeks before and after.

## Done when

- Adding a skater offers the waiver. Signing covers them, and the account
  badge turns to "signed" without reloading the page.
- On the booking page, an unsigned skater can be signed for without leaving
  it, and booking continues to checkout.
- The gate still refuses an unsigned skater on booking, subscribe, walk-in and
  private-booking join. Test this both ways: it refuses when unsigned and
  allows after signing.
- `expires_at` is written on new consents, if issue 1 is approved.
