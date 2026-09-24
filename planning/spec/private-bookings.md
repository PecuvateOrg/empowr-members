# Private bookings — agreed build specification

Status: agreed product requirements, with outstanding decisions listed below. Not a completed implementation or approval to deploy.

Source: the private-booking mock-up review conversation. The latest user corrections take precedence over earlier proposals.

## Scope and relationship to existing plans

Add customer private bookings and admin management to the existing Empowr membership, waiver and check-in platform. Match the public website's actual logo, colours, typography and components during implementation.

This specification supersedes the older `CONTEXT.md` exclusion of self-service birthday bookings for this feature. Private bookings have their own cancellation policy; do not inherit ordinary session cancellation/credit rules. Other offerings are unaffected.

Public entry point: https://eela.empowrcic.org/private-bookings

Reference previews in this review package:

- [Customer prototype](private-bookings-prototypes/customer.html)
- [Admin check-in prototype](private-bookings-prototypes/admin-check-in.html)

These are local demonstrations with fictional records. They do not create memberships, verify waivers, take payments, send emails, save database bookings or update Google Calendar.

## Booking types and pricing

| Type | Time | Ticket and pricing rules |
| --- | --- | --- |
| Birthday party | Saturday, 3–5pm | At least 10 paid tickets at £20 each, plus one additional free birthday ticket. Minimum £200 for 11 skaters. |
| 1-to-1 Sk8 Skool coaching | One or two hours within 3–5pm | One skater. Preview uses £40/hour; confirm final rate before launch. |
| Private group Sk8 Skool coaching | One or two hours within 3–5pm | Preview uses minimum 3 skaters and £20/person/hour; confirm current catalogue rules before launch. |
| Custom booking | Agreed by email | Email enquiry, no immediate payment or reservation. Staff add the agreed booking manually. |

Birthday quantities entered by customers are paid tickets. Always show the total including the extra free birthday ticket; e.g. 12 paid + 1 free = 13 places. Include the birthday person in equipment requirements, registration and the register capacity.

Coaching equipment costs £5 per skater per booking for skate hire and protective gear together. Do not charge £5 for each component or multiply by the number of hours. The preview also offers protective gear only at £5; confirm this option's final price before launch.

## Availability and sequential coaching hours

Use UK local time, Europe/London, including daylight-saving changes. Each interval is exclusive; this is not a shared session with multiple unrelated bookings in the same hour.

- A birthday requires the entire 3–5pm interval to be free.
- Two-hour coaching runs 3–5pm and requires both hours free.
- One-hour coaching starts at 3pm when 3–4pm is free.
- Only an existing confirmed coaching booking covering 3–4pm unlocks 4–5pm for another one-hour coaching booking on that date.
- Do not offer 4–5pm on otherwise empty dates.
- Either one-hour coaching booking prevents a birthday booking on that date.
- A manual unavailable block is not a coaching booking and must not unlock 4–5pm.
- Calendar events block overlapping times. Do not assume an arbitrary busy event is a qualifying first-hour coaching booking: identify its linked booking/type.
- A temporary first-hour checkout hold must not unlock the second hour before the first booking is confirmed.

Customers choose duration and see dated availability. Past or conflicting intervals cannot be purchased. The preview shows sample Saturdays; these are not real calendar availability.

## Customer booking and payment

1. Choose type, quantity, duration where relevant and an available date/time.
2. For coaching, choose equipment for each place before payment. Do not request skater names on the initial selection screen.
3. Continuing temporarily holds the chosen interval while the customer completes membership and payment. The preview uses 10 minutes; make the duration a confirmed configuration value.
4. Require the host to become a member or sign in before payment. Membership here means the existing registration flow, not an assumed purchase of a paid subscription.
5. For coaching, select the actual skaters from registered adult/child profiles during checkout, registering missing profiles through the existing flow. Verify required waivers. Associate each selected skater with their equipment choice; prevent duplicate selection.
6. Show the price, equipment additions and the no-cancellation/no-transfer rule before payment.
7. Verify payment on the server before confirming and consuming availability. Confirmed payment triggers the booking confirmation and calendar synchronisation.
8. Failed payment does not confirm a booking. On unpaid expiry, release the hold. Retrying must not create duplicate bookings or payments.

Engineering requirements: reserve intervals atomically in the booking system; recheck conflicts at checkout; handle payment callbacks idempotently; reconcile late payments/expired holds explicitly. Google Calendar alone is not a concurrency lock. If calendar synchronisation fails after payment, retain the confirmed reservation in the booking system and alert staff for retry/reconciliation.

## Equipment and coaching rules

For each coaching place offer own equipment, skate hire with protective gear, and the protective-gear-only option shown in the preview (price confirmation outstanding).

When skate hire is chosen, require a non-empty size before checkout:

- C10–UK1
- UK1–UK3
- UK4–UK7

Display on both 1-to-1 and group coaching:

> Under 18s must wear full protective gear, including a helmet. Adults are advised to wear full protective gear, especially beginners.

> Inline skates aren’t permitted for these Sk8 Skool coaching sessions. Please use quad skates.

Coaching confirmation goes directly to the booking customer and includes skaters, time and equipment. Do not send a party invitation or ask them to collect guest responses afterwards.

## Birthday preparation and invitations

After confirmed payment, send the host their confirmation, receipt, secure booking-management link and a booking-specific guest invitation link to share.

Each parent/guardian uses the invitation to sign in or register, select/register the child, complete the required waiver and choose hire size or own skates. Adults can complete their own details. Existing members still join this specific booking and confirm their equipment needs. The birthday person follows the same process.

Collect individual equipment choices in this registration/waiver journey rather than maintaining a second, conflicting aggregate hire form. Sum the responses for the host and staff.

Show the actual equipment deadline: two weeks before the party. Explain that all sizes are needed by then to prepare for the special day. Reminders should help the host chase incomplete responses; timing is to be configured. Do not promise equipment availability for late responses until the late-booking policy is agreed.

Show registered count versus booked places, equipment choices received and missing responses. Without an expected guest list, an unregistered guest has no known name: display missing counts. A named expected-guest-list feature is optional, not assumed agreed scope.

## Membership, waivers and privacy

- Link attendees through stable member/child identifiers, not name matching alone.
- Check actual stored waiver records and applicable validity. A self-reported checkbox is only a mock-up simulation, not production verification.
- Inspect and reuse the platform's existing membership-to-waiver mapping. Resolve unmatched records without inventing a second membership.
- Guests see invitation details, their registration/waiver steps, equipment choices and “Your place is covered by the host.”
- Guests cannot access the host's amount paid, receipt, billing information or booking-management functions. Enforce this server-side, including API responses and links, not merely by hiding UI.
- The host sees preparation statuses, not private waiver answers. Restrict staff details to authorised roles.

## Admin: manual bookings, check-in and blocks

Staff can add bookings already agreed by email, including existing paid birthday parties. Capture host member, type, date/time, quantities and payment status. Mark already-paid bookings without charging again. Manual bookings must obey the same conflict rules and reserve the corresponding calendar interval.

Birthday bookings entered manually get the same invitation and preparation flow. Coaching bookings attach skaters and equipment directly. Custom bookings are entered after agreement by email; the enquiry itself does not reserve availability.

Add a Private bookings filter to admin check-in, with date and type filters: Birthday party, 1-to-1 and Group coaching. Include both online and manually entered bookings.

Opening a booking shows host, type, date/time, searchable guest list, membership/waiver readiness, checked-in totals and equipment quantities at a glance. Search its attendees by child name. If missing, search the wider member database, identify the correct profile, check waiver status and add it without duplicating membership. Do not silently exceed paid capacity.

Covered attendees check in without payment. Keep the separate £20 pay-on-the-door option following the existing cashless flow: payment must succeed before check-in. Confirm which extra attendees this option applies to and how it increases capacity. Allow undoing an accidental check-in without treating it as a payment refund.

Staff can block 3–4pm, 4–5pm or the full 3–5pm, with an optional internal reason, and later unblock it. Do not expose the reason to customers. Removing a manual block must not remove overlapping booking reservations or unrelated calendar events. Flag paid-booking conflicts rather than overwriting or cancelling the booking.

## Cancellation and transfer policy

Customers cannot cancel or transfer private bookings, including moving them to another date. Display this before payment and in confirmation. Do not provide customer cancellation/date-change controls. Expiring an unpaid checkout hold is not cancelling a confirmed booking.

Handling a session Empowr cannot deliver remains an operational decision to confirm; do not infer that customer restrictions resolve it.

## Current preview coverage and limitations

Customer preview demonstrates dates, coaching durations, sequential hour availability, equipment selection/size validation, simulated membership and payment, party preparation, guest registration and price hiding. Admin preview demonstrates basic manual booking details, member lookup, hire totals and simulated check-in/payment.

Still to build or fully represent: real calendar integration, persistence, payments, membership/waiver verification, secure guest access, emails/reminders, admin date/type filters, comprehensive imported booking management and unavailable blocks. Website brand matching is also pending. Mock-up helper data is not a production data model.

## Outstanding decisions before launch

1. Calendar/account to connect, eligible dates and classification of existing events.
2. Maximum birthday/group capacity; handling and payment for added attendees.
3. Final coaching catalogue rates/minimums; protective-gear-only price.
4. Online payment provider. Existing project documents reference Stripe; SumUp was demonstrated for door payments. Inspect existing integration rather than assuming a provider change.
5. Custom enquiry destination email and enquiry fields (contact, preferred date, estimated numbers, requirements).
6. Bookings or equipment changes within the two-week birthday deadline and equipment availability checks.
7. Missing-waiver arrivals, especially children without their parent present.
8. Empowr-initiated inability to deliver a paid booking.
9. Hold duration and reminder schedule.

## Acceptance scenarios

- Empty Saturday: one-hour coaching offers 3–4pm, not 4–5pm; birthday and two-hour coaching can use 3–5pm.
- Confirmed 3–4pm coaching: only 4–5pm remains bookable for coaching; birthday/two-hour booking blocked.
- Manual first-hour unavailable block: neither birthday nor a newly unlocked 4pm coaching option is offered.
- Simultaneous checkout attempts cannot reserve the same interval; expiry/payment retries do not create duplicate confirmations.
- Ten paid birthday tickets produce £200 and eleven attendee places.
- Two-hour coaching equipment is charged once per selected skater, not twice; missing hire size blocks progression.
- Initial coaching selection has no skater name input; members/children are identified after authentication and before payment.
- A guest cannot retrieve host billing data or access host management routes.
- Paid manual bookings block online availability and appear in dated admin check-in without recharging.
- A child already registered can be found in the database and linked to the correct booking with existing waiver status.
- Calendar write failure does not free a paid interval; staff receive a reconciliation alert.

## EELA booking buttons

Change "Enquire to book" to "Book now" on the 1-to-1, group coaching and birthday party pages. Each link must preselect its corresponding booking type. Keep custom bookings as email enquiries.

The customer preview accepts `?type=one`, `?type=group` and `?type=party`. Use equivalent type selection on the deployed booking route; its public URL is still to be established. Do not link live customer booking buttons to a local file or to simulated payments.

EELA companion changes belong in `PecuvateOrg/empowr-eela`. This PR supplies the Members specification and prototypes only; the live EELA buttons and production booking implementation remain to be built.
