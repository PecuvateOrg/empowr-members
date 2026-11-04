# Already-paid birthday party registration

Staff can record an already-paid birthday party before its organiser has an account. This is a new owner-authorised exception to the previous legacy-bookings-only manual entry policy; the existing member-search form remains available for legacy entries.

Staff supply the organiser's email, Saturday date, paid places and optional payment reference, and explicitly attest that payment was received. The system adds exactly one free birthday place. Existing minimum and total-capacity rules apply. It records the list price as the existing manual form does, not a new receipt or a payment transaction.

The date is reserved immediately as a confirmed manual birthday booking awaiting its host. It is not a temporary payment offer. No 48-hour payment expiry applies and no checkout is created. The private setup link remains usable until the party begins, unless the booking is cancelled.

The organiser creates a free account or signs in with the verified email supplied to staff. Login/signup preserve the setup path. Claiming attaches the existing reservation to that account atomically, creates its guest invite token and is safe to retry. A different account cannot take over the booking. Staff can retrieve recent setup links on the admin page.

The setup page reuses HouseholdManager for adding the birthday child and signing the waiver, then links to the existing guest-registration page for equipment and birthday-person selection. A separate guest link is provided to share with parents. Existing guest ownership, waiver and capacity checks remain in force. Guests see no host payment information. Standard equipment deadlines remain unchanged.

No email is sent automatically by this feature. Staff copy the setup link into their reply; the organiser shares the separate guest link. No customer data or sample live links belong in this public repository.

## Release

Apply `ops/sql/members-paid-party-registration.sql` before deployment through the maintainer process. It adds an enum value, extends the host constraint only for manual birthday bookings awaiting registration, and adds a service-only registration table and RPCs. Commit the SQL before invoking the new functions (Postgres enum additions require this). Existing bookings retain their host constraint.

Run the paid-party route and SQL fixture suites, TypeScript and existing private booking tests. Verify a fresh signup and email confirmation returns to setup, adding a child and waiver, claiming, guest registration, and the staff register in the deployed environment before customer use. No real payments are required for this flow.
