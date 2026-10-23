# Account deletion

Specified 2026-10-22 (owner-agreed design). Not built. Fulfils the Phase 3 item "account deletion — anonymise bookings, keep financial records, delete participants/medical data".

## Principle

"Delete my account" starts a **request**, not an immediate delete. The account is locked at once, money is settled at once, and anonymisation runs automatically after a **14-day grace period** that the member can cancel. Nothing in the process waits on staff action; the grace period is an undo window for the member, and also protects against a hijacked session deleting an account.

Hard delete is used only for accounts with no history. Everything else is anonymised, because RESTRICT FKs (2026-09-28) block deleting accounts that hold credits or memberships, and `mem_bookings` would otherwise cascade away financial records.

## Scenarios

The erasure assessment runs when the member opens the delete screen and again when the job fires. Scenarios combine; they are applied in this order.

| # | Situation | Handling |
|---|---|---|
| G | Hold condition present (see Automatic holds) | Erasure is held automatically and staff are emailed. Member is told the request is received and being reviewed. Staff release or reverse the hold from the admin account view. |
| B | Active Stripe subscription | Cancelled immediately on request (no further billing). Not resumed if the request is cancelled — member re-subscribes. |
| D | Upcoming bookings | Cancelled on request under the normal cancellation policy: 48+ hrs → full refund to card; under 48 hrs or non-refundable offering → no refund. The delete screen lists each booking and its outcome before the member confirms. |
| E | Unspent credit | Shown on the delete screen and forfeited at erasure. Member is told they can spend it, or ask staff for a refund, before confirming. |
| F | Waiver or other safeguarding record still inside its retention window (see Retention) | `people` record and waiver kept; the existing nightly waiver job removes them on schedule. Link from `mem_participants` is severed. |
| C | Past bookings / payments | Anonymised: booking rows, amounts, dates and Stripe IDs kept for **7 years from the session date** (privacy policy §5, "Programme booking records"); personal fields removed. |
| A | No bookings, payments, credits, memberships or waivers | Login and `mem_accounts` deleted outright at the end of the grace period. |

## What erasure does

The database decides what can be deleted: bookings, credits, refunds, memberships and private-booking places point at `mem_accounts` / `mem_participants` with NO ACTION or RESTRICT foreign keys (checked live 2026-10-22), so a member with history cannot be hard-deleted and must be anonymised.

1. **Stripe**: the Members customer is redacted (only what Stripe must keep for invoices remains). Done at erasure, never at request, so staff can still reverse during the grace period. Every call is scoped to Members' own objects (the Stripe account is shared with Heroes).
2. **Brevo**: the contact is deleted, and the nightly Brevo reconcile must skip erased accounts so it cannot re-add them.
3. **Completion email** is sent while the address still exists.
4. **`mem_erase_account()`**, one transaction, idempotent:
   - each participant with no history is deleted, which runs the existing waiver-archive trigger, exactly like "remove from household";
   - each participant with history has their waivers archived the same way, is unlinked from them, and keeps only an anonymous row: name "Deleted skater", birth year only (date of birth coarsened to 1 January; the column is required and read in about 50 places), no emergency contact, medical notes, travel method or waiver link;
   - the account row becomes "Deleted member" with no phone, WhatsApp opt-in, Stripe customer id or staff hold note.
5. **The login is deleted.** `mem_accounts.user_id` becomes nullable with ON DELETE SET NULL (it was NOT NULL ... CASCADE), so the anonymous account row survives to anchor the retained records.
6. **Audit** on the `mem_account_deletions` row: dates, scenarios, counts, what was kept and until when. No personal data.

The locked state during the grace period is a Supabase auth ban: the member is signed out and cannot sign in, with no app-wide checks needed. Cancel and confirm links work without signing in.

## Grace period and emails

On request: account locked (no logins/bookings), subscription cancelled, upcoming bookings cancelled/refunded, request recorded with `erase_after = now() + 14 days`.

| When | Email | Content |
|---|---|---|
| Day 0 | Request received | What was requested; what happened to bookings, membership and credit; what is kept and for how long; the deletion date; **Cancel deletion** button |
| Day 7 | Halfway reminder | Deletion date; cancel button |
| Day 13 | Final notice | 24 hours left; cancel button |
| Day 14 | Deletion complete | Confirmation and what was kept until when. Sent **before** the email address is erased |
| On cancel | Account reactivated | Account is active again; reminders stop. Cancelled bookings and subscription are not restored |

Request and cancel both need an emailed confirmation link (same mechanism as login), so a hijacked session alone cannot delete or keep an account.

## Reason for leaving

Optional question on the delete screen; never required (GDPR). Choices: Child no longer skating · Moving away · Too expensive · Not happy with sessions · Rather not say · Other (free text). Stored without any link to the person so it survives erasure; reportable in the Empowr Dashboard.

"Not happy with sessions", or any scenario G flag, sends staff a copy of the request so someone can reach out. The request goes ahead unless the member cancels it.

## Automatic holds

Checked when the request is made and again immediately before erasure. Any hit puts the request on hold with no staff action needed to trigger it:

- An open Stripe dispute (chargeback) on any of the account's payments, read live from Stripe.
- A refund that has been started but not settled.
- A booking on the account attended within the last 7 days, so any incident from a recent session can be logged before the data goes.
- A staff-set hold on the account (for a safeguarding concern or incident staff know about that the system cannot see). Staff can set this at any time; it has the same effect as the automatic checks.

Only a staff hold or an open Stripe dispute puts the request ON HOLD (status `held`, staff emailed, legal@ copied). The other conditions are temporary: a session in the last 7 days, a refund still settling, or a Stripe check that could not run simply delay erasure, and the nightly job tries again the next night. Holding every recently active member for a person to release would bury the holds that matter (decided in build, 2026-10-23).

A held request does not erase at day 14. It stays locked and held until staff act on the admin account view:

- **Release hold**: erasure goes ahead (immediately if the 14 days have passed).
- **Reverse**: the request is cancelled and the account restored, with the "Account reactivated" email sent. Staff can reverse any pending request, held or not, during the grace period.

Every hold, release and reverse is emailed to staff and recorded in the audit row. Erasure itself cannot be reversed once it has run.

## Staff alerts

Owner 2026-10-22: deletions are tracked in **PecuvateCRM Escalations**, the same place the Members contact form already sends to.

- **One escalation per deletion request**, updated as it moves through: requested → held → released / reversed → erased. Events recorded on it: request, cancel, hold, release, reverse, erasure, and the "Not happy with sessions" reason.
- **No personal data in the CRM.** The escalation carries an anonymous account reference, the scenarios, the dates and a link to the Members admin account view. It never holds a name, email or child details, so nothing personal survives erasure in the CRM.
- **Actions stay in Members.** Release and reverse are done on the Members admin account view; the CRM is for visibility and tracking.
- **Legal holds** (a Stripe dispute, or a staff-set safeguarding/incident hold) are tagged as legal on the escalation, and an email goes to `legal@empowrcic.org` with a direct link to that escalation in the CRM. The email carries no personal data either.
- **Fallback:** if the escalation cannot be created or updated, the same alert goes by email to `bookings@empowrcic.org`, so no event is lost.

## Retention

Owner 2026-10-22 (decision log):

| Record | Kept |
|---|---|
| Everyday child records: waivers, collection consents, and the DOB, emergency contact and health details they hold | Until the child turns 21, or 3 years after their last session, whichever is later |
| Safeguarding concern records: incidents, allegations, referrals | Until 25, or 7 years after the last session, whichever is longer. Never deleted automatically or by account deletion. Not held in Members; a staff-set hold protects any account they relate to |
| Adult waivers | 3 years after the last session covered (or from signing if none) |
| Booking and payment records | 7 years from the session date, anonymised |

At erasure, participants are handled exactly as "remove from household" already does: `mem_participants` details are deleted and each signed waiver moves to the team-only waiver archive, which keeps it for the period above. Adult and child participants follow the same path; only the retention period differs.

The nightly job already applies 21 / 3 years to waivers. One change is needed: collection (departure) consents are deleted at a flat 3 years, and must follow the child rule (until 21, or 3 years after the last session). The household-removal message already states the correct rule.

## Decided in build (2026-10-23)

- **Erase date** = 14 days after confirming, or 7 days after the last session the member is still booked on (their own bookings and courses, and private bookings they host or have a place on), whichever is later. Bookings kept on deletion (inside 48 hours, non-refundable) still happen, and the register needs the skater's details for them. The delete page and the confirmation email show the real date. A session still to come also defers erasure at run time.
- **Overdue alert**: a request still deferred 7 days past its date emails staff once (the one-month UK GDPR clock is running).
- **Stripe disputes**: the live Members restricted key cannot read disputes (403, checked 2026-10-23). A charge Stripe marks as disputed is therefore treated as an open dispute and held for staff. Adding "Disputes: Read" to the key makes the check exact. Every other permission erasure needs (list charges, retrieve/delete customers, retrieve/cancel subscriptions) was probed with non-existent ids and is granted.
- **Links** are signed with an HMAC derived from `SUPABASE_SERVICE_ROLE_KEY`. Rotating that key invalidates every outstanding confirm and "Keep my account" link; staff "Reverse" on /admin/deletions is then the way back for a member who wants to keep their account. Add to the rotation runbook.
- **Brevo during the grace period**: the contact is deleted at erasure, not at request, so Brevo marketing can still reach the member during the 14 days.
- **A failed refund on confirm** sends the same staff refund alert as the self-serve cancel route.
