# Members shop order history

Prepared behind `SHOPIFY_ORDERS_ENABLED=false`. This does not make the shop public.
No schema changes, database writes, webhook registration, or order copies.

## Activation

1. Configure a dedicated Shopify app installation for the intended store with read-only `read_orders` access and access to the order email protected customer field. Do not reuse ChatGPT's connector credentials or request write scopes.
2. Provision its Admin API token into AWS Amplify's **server-only** `SHOPIFY_ADMIN_ACCESS_TOKEN`. The token must remain valid; for expiring tokens, provision managed refresh/rotation before activation. Never paste secrets into chat or commit them.
3. Set `SHOPIFY_STORE_DOMAIN` to that store’s canonical `.myshopify.com` hostname. For full history grant `read_all_orders` alongside `read_orders`, then set `SHOPIFY_READ_ALL_ORDERS=true`; otherwise leave false and the UI states the 60-day limit. Confirm granted installation scopes before changing the flag.
4. Enable `SHOPIFY_ORDERS_ENABLED=true` on a deploy preview. Confirm with a consenting member's existing order: verified account email matches checkout email, pagination, line items, totals, payment/fulfillment states. A second member cannot see that order. Errors show unavailable, never empty history. Production code excludes test orders; no paid test purchases without authorization.
5. Complete required project deployment/security checks and PR review. Merge through existing owner workflow. Enable production only after authenticated acceptance checks pass.

## Identity and limitations

`getAuthedAccount()` verifies the Supabase session server-side. Only `user.email` with `email_confirmed_at` is used. No editable profile field, URL email or submitted order ID controls ownership. Each result's exact case-insensitive email is checked again; any mismatch or missing/redacted email rejects the response. Order data is uncached and not logged. The `/account/shop-orders` route inherits the account middleware guard.

This is same-verified-email order history, not SSO or alternate-email linking. Guest checkout with that email can appear. Changing a member's verified email changes which orders appear. Other-email purchases require support; no merging by name, phone or household. No shipping address or secret order-status URL is exposed. Twenty orders per page, up to fifty line items per order; bigger orders direct members to their confirmation email. Fulfillment status is shown, not a promise of delivered status.

API schema validated against Shopify Admin 2026-10 through the Shopify query tool using a non-customer `.invalid` email search (no orders returned).
References: https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders and https://shopify.dev/docs/api/usage/access-scopes
