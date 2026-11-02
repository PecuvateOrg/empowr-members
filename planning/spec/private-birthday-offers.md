# Private birthday offers

Staff create an offer from Admin > Private bookings for a free Saturday inside the public 14-day notice period. The offer fixes the date, paid places, venue and current price. It includes the normal free birthday place and respects the total capacity.

- Creating an offer does not reserve the date or send an email. Staff copy the generated link into their reply.
- The payment deadline is exactly 48 hours after link creation. It does not restart on opening, registration or checkout retries.
- Customers can view the offer signed out. Sign-in and free account registration preserve the offer through the existing `next` flow.
- Only an authenticated account can start payment. Availability is checked again under the calendar lock. The usual short checkout hold protects payment, without holding the date for the offer's 48 hours.
- Stripe hosted checkout needs at least 30 minutes for a new session. The UI asks customers to start checkout at least 31 minutes before the deadline (or party start). An existing session can still be resumed until its own expiry. No session is created beyond the offer deadline or party start.
- Payment uses the existing private-booking Checkout and webhook confirmation. The offer can produce only one confirmed booking. Repeated checkout requests reuse a booking and Stripe idempotency key.
- Skate sizes are due seven days before the party. Standard bookings keep 14 days. Offers inside one week remain allowed and tell the customer to contact Empowr to arrange hire. The same wording appears in confirmation and preparation pages.
- Prices, waivers, guest registration and cancellation terms otherwise remain unchanged.

## Release

Apply the new `ops/sql/members-private-offers.sql` through the maintainer PR process before deploying the code. The new table has no client grants or RLS policies; only service-role handlers can access it, and creation requires admin authentication. Do not change an already-applied SQL file.

Run `verify:private-offers`, `verify:private-offer-routes`, `verify:private-offers-sql`, existing private-booking/webhook suites and TypeScript. All three new scripts run in CI: the verify workflow derives its suite list from package.json. The register loaders already exist on main. The SQL fixture suite tests the new functions with the repository's original private-booking schema; maintainer dry-run against the current database remains required. Verify a sandbox payment and new-account email confirmation return path before enabling customer use.

The hold RPC calls `mem_private_lock_date` before reading an existing booking; that function cancels expired holds synchronously, without waiting for the scheduled sweep. Confirmation and booking-detail reads use `select('*')`, which includes `equipment_deadline_days`; the optional TypeScript field preserves compatibility with existing test fixtures and defaults ordinary bookings to 14 days.
