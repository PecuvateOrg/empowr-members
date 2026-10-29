# Discount codes

Admin page: `/admin/discounts`, under Members & money. Admins can create codes
for all bookable sessions or one offering (all dates of that session type),
choose an integer percentage or a fixed GBP amount per participant-place,
set an optional expiry, and pause/reactivate codes. Terms are immutable after
creation; pause and create another code to change them. Codes have unlimited
redemptions while active. Subscriptions and private bookings are outside scope.

Members apply one code in the basket. A server quote reads current prices.
The existing booking hold RPC remains authoritative for availability and prices;
`mem_apply_booking_discount` locks the held rows, checks the code again, and
rejects any mismatch with the quoted discount or net total. Discounts apply to
early bird prices too, and precede account credit. Fixed discounts are capped at
the individual place price. A nonzero basket below the 30p card minimum is
refused with an explanation; a zero balance is confirmed without Stripe.

`price_paid_pence` stores the price after the discount and before account credit,
preserving the existing refund accounting contract. `discount_code_id` and
`discount_pence` preserve the promotion and saving on each booking. No Stripe
coupon is created and discounts do not affect other apps sharing the account.

## Release sequence

1. Verify `ops/sql/members-discount-codes.sql` against the current private shared
   schema ledger, including existing booking/credit triggers and constraints.
   The local contract fixture is not a substitute for that integration check.
2. Apply that SQL transaction through the shared Supabase Management API and
   regenerate the private schema-of-record ledger using its `dump-ledger.mjs`.
   Update the private database registry. Do not hand-author a migration here.
3. Run the existing checkout/credit tests and new discount tests, then the
   project's security and deployment checks. Deploy the app after the schema.
4. In a sandbox, verify admin creation/pause, mixed eligible/ineligible basket,
   expired code rejection, free booking confirmation, paid webhook fulfilment,
   and refund amounts. Check staff/member confirmation email delivery.

Pausing stops new redemptions. A checkout already created retains its agreed
price until it completes or expires. To roll back the application, leave the
additive schema and historical booking discounts in place.

## Local verification

`ops/scripts/verify-discounts.ts` covers calculation and input validation.
`ops/scripts/verify-credit-checkout.ts` includes discounted card payments,
discount-before-credit ordering, rejected codes, and free confirmations.
Use the same module-mocking loader as `verify:credit-checkout`.

This change does not deploy or modify the shared database by itself.
