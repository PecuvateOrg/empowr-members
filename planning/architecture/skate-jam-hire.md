# Free Skate Jam hire

Online pay-as-you-go bookings for the `skate-jam` offering offer own skates or
free adult UK-size skate hire. Subscriptions and walk-ins do not collect or
reserve hire. The Wednesday Sk8 Skool change is separate and not included.

Stock per size is configured in `mem_skate_jam_hire_sizes` using a private
deployment input, not hardcoded in the UI or committed to the public repository.
The schema defaults every size to zero until actual stock is configured.
They represent reusable stock for each session, not a lifetime sales limit.
Overlapping sessions would require a shared time-overlap inventory model;
the current programme treats each Skate Jam date as a separate hire allocation.

The form displays current counts and subtracts other selected participants'
choices. A browser basket holds no inventory. Checkout validates ownership,
session identity, participant coverage and the existing subscription/waiver gates,
then reserves all selected sizes in a single service-only database call before
payment. A conflict cancels the basket's pending booking holds and starts no
payment. Ticket prices, discounts and credit calculations are unchanged.

The database owns stock limits. Conditional counter updates serialize claims
against each occurrence/size. A booking trigger covers insert, cancellation,
refund, deletion, size changes, restoration and date transfers. A transfer to a
full size fails atomically, preserving the original booking and reservation.
Pending, confirmed, attended and no-show bookings hold pairs. Pending bookings
release when the existing expiry process changes their status to cancelled,
not merely when their timestamp passes: this respects the payment grace period.
Confirm the live expiry process and webhook behavior before release.

New nullable booking fields are `jam_hire_requested` and `jam_skate_size`.
Explicit own-skates answers are false/null; historical or older basket bookings
are null/null and reserve nothing. Any supplied hire selections must cover the
exact participant set. The basket shows each person's choice; admin and door
registers show confirmed/attended PAYG choices and size preparation totals.
Unavailable register reads show a warning while leaving the safety register
usable. Availability failures disable hire selection but permit own-skates
bookings. No public participant data or new public table access is introduced.

## Rollout prerequisite

`ops/sql/skate-jam-hire.sql` is a reviewed rollout input, not a generated
migration. Before deploying, use the connected Supabase Management API to
inspect the private shared schema ledger and live booking/transfer/expiry
functions and triggers. Apply the SQL in a test environment, regenerate the
private ledger with `dump-ledger.mjs`, and update its registry. Do not deploy the
application before the schema exists and the private stock quantities are seeded.
No live database change is included here.

Verify two independent PostgreSQL connections contending for the last pair,
multi-participant rollback, expiry and payment grace, successful payment,
cancel/refund, no-show/check-in, and transfer into a full size. Test true payment
completion against a sandbox, including fully discounted and credit-paid
bookings. Run the normal security/deployment checks before production rollout.
The local PGlite contract suite is not a substitute for that integration check.

## Verification

- `verify:skate-jam-hire`: input, PAYG checkout, no hire surcharge, own skates,
  stock conflict, inventory outage, subscription exclusion and legacy baskets.
- `verify:skate-jam-hire-sql`: seeded stock, inventory limits, atomic multi-person
  rollback, reservation lifecycle, transfers, permissions and expiry semantics.
- Existing basket, credit/discount checkout and camp equipment tests.
- Browser fixture at 390, 768 and 1280px using the real form/register components.

Rollback the app if needed while retaining the additive schema and historical
choices; removing the trigger would remove protection from later transitions.
