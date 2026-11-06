# Members timetable and private booking calendar sync

Implementation: `jobs/private-calendar.ts`, dispatched by `jobs/lambda.ts`.
This is an AWS job, not a public endpoint. It mirrors Members into the shared
Bookings calendar every five minutes. Google never changes Members availability.

The same job also mirrors every upcoming scheduled date of active public offerings
(Skate Jam and all other per-occurrence sessions), even with no ticket bookings.
Weekly per-run courses use the same seven-day date expansion as course attendance,
with local London times across BST changes. Session events contain the offering
title, run label where applicable, and full venue address/postcode. Date/run venue
overrides take precedence over the offering venue. Each date is one event, never
one event per ticket or member.

Cancelled, unpublished or hard-deleted public session dates/runs are removed by
listing only future events with this integration's session marker after complete
database reads. Incomplete course dates/times are flagged for staff and existing
events for that run are retained; no meeting time is guessed. Courses sold per run
are expanded from the run, not duplicated from any associated occurrences.

Confirmed bookings (including manually paid parties awaiting an organiser),
blocks, place totals and equipment summaries are reconciled. Cancelled future
bookings remove only their integration-owned events. Pending payments are skipped.
The event includes the host name, venue and authenticated staff link, never guest
names, contact details, waiver data, payments or internal notes. Blocks use the
generic title Unavailable because notes may contain personal details.

## Maintainer setup before enabling

1. Enable Google Calendar API in the organisation's Google Cloud project. Create
   a dedicated service account and JSON key. Put the key in the existing secrets
   vault, never chat, source control or build logs. No domain-wide delegation.
2. Share the intended calendar with that account's email using **Make changes to
   events**. Use a separate test calendar first. Do not make the calendar public.
3. Configure these server-only environment variables on the dedicated Lambda:
   `MEMBERS_GOOGLE_CALENDAR_SA_KEY_PROD` (JSON), `MEMBERS_GOOGLE_CALENDAR_ID`,
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally
   `NEXT_PUBLIC_SITE_URL`. Set `MEMBERS_GOOGLE_CALENDAR_ENABLED=1` only after setup.
4. Bundle with `node ops/scripts/build-jobs.mjs`. Deploy the artifact to a dedicated
   Node 22 Lambda, handler `index.handler`, reserved concurrency 1, timeout 240s.
   EventBridge Scheduler: `rate(5 minutes)`, flexible window off,
   input `{"job":"private-calendar"}`. Configure retry/DLQ and a CloudWatch alarm
   for failures (including timeouts), with a monitored staff notification target.
   Also alarm on missing successful runs. This job does not send customer emails.
5. In the test calendar verify confirmed online/manual bookings, an unclaimed
   paid party, top-ups, equipment edits, organiser claim, cancellation and blocks.
   Disable Calendar access and confirm bookings remain intact; restore access and
   verify the next run catches up without duplicates. Check British summer/winter
   times and both staff links and calendar sharing permissions.
   Also test public session creation, time/location edits, cancellation, hard
   deletion, offering deactivation, weekly courses and incomplete course times.
6. Enable production, invoke once, inspect the job result and actual events, then
   enable the schedule. The first run imports existing future bookings and blocks.
   Review legacy manually created events for duplicates; this code deliberately
   does not delete those or the old Available placeholders.

## Operations and scope

Each event ID is derived from the booking UUID. Existing unrelated events are
protected by an ownership marker. Each run pages through all future/ongoing
bookings, rereads their latest state, and retries earlier failures. Read failures
abort safely; individual calendar errors are counted and fail the Lambda run.
Work is rotated between runs and processed with bounded concurrency; safe error
codes and record identifiers are logged without personal details. Google date
normalization is compared by instant, avoiding updates just for offset formatting.
No booking, payment or membership records are mutated. Booking success never
depends on Google. Changes made during a run converge on the next run.

Edit or cancel bookings in Members. Manual Calendar deletion can leave a Google
tombstone; a persistent 409/410 requires operator inspection rather than creating
a second event with a different ID. Past events are retained; backdated corrections
and hard-deleted private booking rows are not reconciled. Do not hard-delete private bookings.
Keep this job on one calendar; changing the target does not clean up the old one.

This implements the earlier plan with five-minute reconciliation instead of
checkout hooks and hourly reconciliation. It needs no database migration or
calendar_synced_at column. Operational alerts use the AWS job alarms, not a new
email sender. Admin sync-status UI and automatic legacy placeholder cleanup are
not part of this implementation. Disable via MEMBERS_GOOGLE_CALENDAR_ENABLED=0.

API contracts: [service account auth](https://developers.google.com/identity/protocols/oauth2/service-account),
[event IDs and insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[updates](https://developers.google.com/workspace/calendar/api/v3/reference/events/update),
[deletion](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete).
