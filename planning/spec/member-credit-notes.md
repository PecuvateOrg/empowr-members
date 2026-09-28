# Member credit notes

Implemented locally September 2026. Not deployed and not applied to the live database.

Staff use `/admin/credits` to find an existing member by account holder name, verify identity and payment, and issue either the full value of a confirmed Members booking or an entered amount for an old-platform booking. Old-platform issuance records platform, original reference, session, date, reason and issuing staff identity. It does not create a historical Members booking or change anything on the old platform. The recipient must first have a Members account.

Members see notes, expiry, available balance and recent reservation/spending activity on `/account`. Booking forms offer an explicit credit checkbox for occurrences and course runs. The server checks the expected credit amount against the current balance and rejects stale quotes. Credit covers all or part of the booking; a full-credit booking requires no Stripe payment. Household places share the account balance. Recurring subscriptions and staff walk-in checkout are outside credit redemption scope.

The existing 12-month expiry is retained. Cancellation returns credit to its original note with the original expiry; an already-expired note does not become spendable again. New staff-issued credits use a new 12-month period. No self-serve switch from card refund to credit is introduced. Existing cancellation eligibility remains unchanged.

The database serialises credit allocation using account/credit row locks. A unique legacy platform/reference prevents duplicate issuance across accounts; a unique source-booking index prevents duplicate credits for a Members booking. Staff must still verify old-platform payments and refunds because this app cannot check the old platform's records. A stable issuance request UUID makes a repeated submission return the original note.

Reservations count against the balance immediately. Confirmation commits reservations; abandoned booking cancellation releases them in the same database transaction. Stripe's minimum GBP charge is handled by applying slightly less credit when necessary, retaining the remainder in the account. Asynchronous Checkout payments remain reserved until the success/failure event.

Refunds use a durable claim with the original card/credit split and a stable Stripe idempotency key. Credit returns only once the card refund succeeds. Pending refunds can be retried from the staff credit screen. Automated retries stop after 23 hours because Stripe's idempotency retention cannot safely be assumed beyond 24 hours; these require Stripe reconciliation. Credit-issued bookings cannot subsequently receive a second refund through these routes.

Issuance is visible immediately in the member account; this implementation does not send a separate credit-note email. Normal booking and cancellation emails include the payment split.
