# Member credit rollout — not live

Local implementation is in this checkout. No production schema, application deployment, credit balance or payment has been changed.

## Verification completed

- TypeScript `tsc --noEmit`.
- `ops/scripts/verify-credits.mjs`: 13 tests using an isolated PGlite PostgreSQL database. Covers issuance, duplicates, account ownership/RLS, stale balance, partial use, tender split, replay, expiry release, GBP minimum and household allocations. This is a minimal schema fixture; it does not prove compatibility with the current production schema or real simultaneous transactions across separate database connections.
- `ops/scripts/verify-credit-ui.cjs`: real React components bundled for a local browser, mocked API responses. Staff lookup, legacy validation, integer-pence submission, member opt-in/out, balance-change error and mobile width. Next Link is replaced by a plain anchor in this test harness. This is not an authenticated live end-to-end test.
- Existing cancellation policy tests: 9 passed.
- Production build compiled and passed its type checks, but failed during catalogue page-data collection because this checkout has no Supabase URL/configuration. The initial sandbox build also could not download the Google font; the network-enabled rerun compiled successfully.

## Deployment prerequisites

1. Obtain the configured checkout/environment; use its secret store, not pasted credentials. The source here is an unpacked checkout without Git metadata. Reconcile changes against the current deployment branch before applying them.
2. Inspect the live schema and the shared `_config/registry/supabase.md`. The shared registry and schema ledger are absent here. Verify `mem_credits` columns/nullability (including nullable `source_booking_id` for external credit), booking status values and expiry sweep. Audit duplicate non-null source-booking IDs before adding the unique index. Do not delete conflicting historical credits automatically.
3. Apply `ops/scripts/member-credits.sql` through the Supabase Management API as one migration transaction; this file is deployment input, not a hand-authored ledger migration. Regenerate the shared `Empowr CIC/supabase/migrations/` ledger with its existing `dump-ledger.mjs` and update the registry. Do not create `src/supabase/migrations/`.
4. Before deployment, verify the existing expiry sweep only cancels expired `pending_payment` holds and excludes null expiry (asynchronous payment processing). Confirm the Stripe endpoint receives `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` in addition to completed/expired. Review the active Dashboard payment-method configuration and the app's restricted-key permissions for checkout and refund retrieval.
5. Build with configured nonproduction services and run separate-connection concurrency tests and Stripe test-mode flows: partial/full credit, abandoned checkout, duplicate callbacks, interrupted session linking, asynchronous success/failure, paid-after-released-hold reconciliation, mixed-tender cancellation and pending-refund retry. Verify member and staff emails. No real charge is needed for these checks.
6. Complete the repository's pre-deploy security and Netlify/Supabase checks, then deploy the application. The database changes must land first. Verify staff/member access controls and a controlled test account after deployment.

## Running the local checks

Install `@electric-sql/pglite` in a separate tooling directory. Set `CREDIT_PGLITE_MODULE` to its `dist/index.js` and run `node ops/scripts/verify-credits.mjs` from the project root.

For the component browser test, set `CREDIT_PLAYWRIGHT_MODULE` to the installed `playwright-core` package and `CREDIT_BROWSER` to a Chromium-compatible browser executable. Run `node ops/scripts/verify-credit-ui.cjs`. Its bundle is generated in an OS temporary directory and never enters app routes.

## Operational recovery

If Stripe session creation or linking is ambiguous, the member gets an explicit hold message and credit stays reserved for up to 45 minutes (Stripe Checkout expiry is 31 minutes). Do not manually reissue that credit while the hold is open. Processing asynchronous payments have no timed expiry and are released only by a failure event or reconciled by staff.

Pending refunds appear in the staff credit screen. Retry there within the 23-hour window. After it, inspect Stripe and reconcile the durable refund row before completing or retrying anything. A paid event for released holds returns a webhook error and requires reconciliation rather than spending credit that may have been reused.

Credit issuance does not send a separate email. Staff can tell the member that the note and expiry are available in their account.
