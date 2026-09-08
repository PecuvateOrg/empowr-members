# Testing payments locally, without live money

Proven end to end on 2026-09-08 while verifying PR #53 (camp equipment).

Before this, there was **no way to exercise any payment path on this project
without taking real money**. Subscriptions and bookings had only ever been
proven by real customers paying; cancellation and refunds had never run once,
in any mode. This is the procedure that closes that.

---

## Why not a registered Stripe webhook endpoint

The obvious approach — register a test-mode endpoint pointing at a Netlify
deploy preview — does not work, and it is worth writing down why so nobody
rebuilds it:

- **Deploy-preview URLs are per-PR** (`deploy-preview-53--…`), so an endpoint
  registered for one PR is useless for the next.
- **A stable branch URL is not available**: the site is configured
  `allowed_branches: ['main']`, so a `staging` branch would not build.
- The historical endpoint `we_1TraTSCpJGJ55gu5LdKiZb3e` still exists, is
  **disabled**, and points at the **production** URL — which holds the *live*
  endpoint's signing secret, so its test events could never verify. **Do not
  re-enable it.**

`stripe listen` avoids all of this: it registers no endpoint, has no URL, and
issues its own signing secret. It works on any branch, forever.

> An older note in `workspace-docs/…/memory.md` rejected test mode partly
> because "Stripe CLI login key expired — `stripe listen` 401s". That is no
> longer true; the CLI is authenticated (verified 2026-09-08, API version
> `2026-02-25.clover`).

---

## The procedure

### 1. Start `stripe listen`

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### 2. Start the dev server with the *same* signing secret

`.env.local` holds a self-signed placeholder for `STRIPE_WEBHOOK_SECRET` that
will **not** match `stripe listen`. Signature verification fails silently-ish
if they differ. Capture the secret into a variable rather than pasting it:

```bash
SECRET="$(stripe listen --print-secret)"   # never echo this
STRIPE_WEBHOOK_SECRET="$SECRET" npx next dev -p 3000
```

Next.js does not override variables already present in `process.env`, so the
shell value wins over `.env.local`.

### 3. Sign in without a mailbox

Generate a magic link with the service role key and hand the `hashed_token` to
the app's own callback, which calls `verifyOtp` and sets the session cookie:

```
POST {SUPABASE_URL}/auth/v1/admin/generate_link   {"type":"magiclink","email":"…"}
GET  localhost:3000/auth/callback?token_hash={hashed_token}&type=magiclink
```

Use `tech@pecuvate.com` — the standard test identity, and it already exists.

### 4. Pay with `4242 4242 4242 4242`

Any future expiry, any CVC. **Assert the checkout URL contains `cs_test_`
before automating a payment** — that one check is what stops a scripted test
ever touching live money.

---

## What this proves, and what it does not

| | proved by this | |
|---|---|---|
| application code — validation, holds, DB writes, hold release | **yes** | identical in both modes |
| webhook handler logic and signature verification | **yes** | `checkout.session.completed` → `[200]` |
| refund *logic* | **yes** | refunds are an outbound `stripe.refunds.create` call, not a webhook |
| the **production** endpoint's wiring and `enabled_events` | **no** | per-endpoint config; only a live payment exercises it |
| whether the **live restricted key** is permitted to refund | **no** | auth ≠ entitlement; check the key's scopes in the dashboard |

---

## Two traps that cost real time

**The database is shared.** Stripe can be put in test mode; Supabase cannot —
one project serves local, preview and production. **A local test booking writes
real rows to the production database**, and a test child will appear on a real
door register. Always:

- record a baseline count first, and diff against it after cleanup;
- use an obviously-named fixture (`ZZ TEST …`);
- delete everything afterwards and *verify* the counts returned.

**An inactive offering cannot be booked.** It is tempting to stage the test on
an `active = false` offering so it never appears publicly. The booking *route*
allows it (service client, RLS bypassed) but `mem_hold_bookings()` requires
`f.active = true` and raises `mem_not_bookable` → HTTP 409. The offering must be
active for the moment of booking. Mitigate with **capacity 1**, activate and
book in one scripted step, and rely on `/sessions` being ISR-cached for 5
minutes — in practice it never becomes visible.

---

## Known contamination: test Stripe customer ids in production rows

`mem_accounts.stripe_customer_id` is written by whichever environment books
first. Because every environment shares one database, a **local/preview test
writes a TEST-mode `cus_…` into the production row.**

Confirmed 2026-09-08 for `tech@pecuvate.com` (`cus_VBwAdv68d6zy1f`, written
2026-09-03). Stripe's own response:

> *No such customer: 'cus_VBwAdv68d6zy1f'; a similar object exists in test mode,
> but a live mode key was used to make this request.*

That account would now fail on its next **live** booking. It is only a test
account today, but the mechanism is not limited to test accounts: any account
used for local testing acquires this. Null the column to recover — the code
creates a customer when it finds none.
