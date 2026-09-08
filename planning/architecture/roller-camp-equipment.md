# Roller Squad Camp equipment

Standard online Roller Squad / Roller Quad Camp bookings collect one equipment
choice per participant before payment. External HAF bookings, subscriptions,
walk-ins and other offerings are outside this change. Equipment choices do not
change ticket prices. Hire includes full protective gear and a helmet.

The camp gate requires offering type `camp` and either the existing
`roller-quad-camp` or `roller-squad-camp` slug, or an exact matching camp title.
Confirm the intended catalogue offering matches this gate before rollout.

## Database prerequisite — apply before deploying the application

The application requires three nullable columns on `public.mem_bookings`.
No live schema change has been applied by this PR. Pecuvate should apply the
following additive change through the Supabase Management API, then regenerate
the private hub's schema-of-record ledger with `dump-ledger.mjs` and update its
registry, following `CLAUDE.md`. This is a reviewable schema proposal, not a
migration file in this public application repository.

```sql
begin;
alter table public.mem_bookings
  add column skate_choice text,
  add column hire_skate_size text,
  add column protective_gear text;

alter table public.mem_bookings
  add constraint mem_bookings_roller_equipment_check check (
    (
      (skate_choice is null and hire_skate_size is null and protective_gear is null)
      or
      (skate_choice = 'hire'
        and hire_skate_size in ('C10 – UK 1', 'UK 1 – UK 3', 'UK 4 – UK 7')
        and protective_gear = 'provided')
      or
      (skate_choice = 'own' and hire_skate_size is null
        and protective_gear in ('own', 'borrow'))
    ) is true
  );
commit;
```

Keep existing RLS and grants on `mem_bookings`. This change introduces no public
read policy, new table or direct client write path. Equipment is stored on the
booking, not the participant profile or Stripe metadata, so later bookings and
siblings remain independent. Historical rows remain NULL; do not infer choices.

The API validates the exact selected participant set before creating holds,
then saves equipment to the held rows with account and pending-payment guards
before creating Checkout. If equipment storage fails, the existing failure path
cancels pending holds and refuses to start payment. Payment completion continues
to confirm the same booking rows through the existing webhook.

## Admin and check-in

The existing session selector opens the relevant register. A new equipment panel
shows totals by size, full gear/helmet totals, and a searchable child/booking list.
Only `online` rows with `confirmed` or `attended` status count. Pending, cancelled,
refunded, credited, no-show, walk-in and subscription rows are excluded from these
preparation totals. Filtering the list never changes the session totals.

The full existing register remains beneath the panel: medical/additional notes,
age, emergency contact, waiver checks, departure details and check-in controls
remain intact. Equipment is also included in the child's expanded register detail.
The course-run roll has the same equipment summary if a camp is sold as a block.

Historical missing choices are explicitly identified and excluded from known
equipment totals. Equipment read failures display an unavailable warning and
hide totals, while the original safety/check-in register still loads.

## Review and rollout checks

- Review the booking and admin HTML mock-ups in `planning/mockups/`.
- Run `verify:roller-equipment`, `verify:roller-equipment-booking` (Node 22.19+
  with experimental module mocks), relevant existing register/consent suites and TypeScript.
- Apply the database prerequisite in a test environment and check the camp gate.
- Using a test payment environment, book siblings with different hire sizes and
  an own-skates child borrowing gear; verify saved choices and admin totals.
- Verify a failed equipment save never redirects to payment, pending payments
  are excluded, successful payment includes the child, and cancellation removes
  them from the equipment totals. Check-in must not remove their equipment.
- Confirm all existing child/safety fields and check-in actions remain visible
  at phone and tablet widths before production deployment.

No additional hire charge or equipment stock limit is introduced.
