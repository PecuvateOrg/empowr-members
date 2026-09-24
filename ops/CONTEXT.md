# Ops â€” Deployment & Environment

Netlify deployment configuration for Empowr Members.

## Netlify

| Setting | Value |
|---|---|
| Site | `empowr-members` â€” ID `76f903e4-3795-406a-9478-34be6b0ed015` (account `pecuvate`) |
| Domain | members.empowrcic.org â€” live, Route53 CNAME â†’ empowr-members.netlify.app |
| Branch | main |
| **Base directory** | **src/** â€” Netlify's file scope starts here; any file a function or build step reads must live inside src/ |
| Build command | `npm run build` |
| Publish | `.next` â€” Netlify CI resolves publish relative to BASE (src/), so bare `.next` is correct; local `netlify deploy --build` resolves from the repo root and misleads â€” never CLI-deploy |
| Plugin | `@netlify/plugin-nextjs` (also in src/package.json devDependencies) |
| Node | 20 |

Config lives in `netlify.toml` at the **repo root** (never inside src/). git push to main auto-deploys â€” never fire a manual deploy on top.

Netlify env vars must be set via the API (`POST /accounts/{id}/env?site_id=`) â€” the MCP env-var tool silently fails; no scopes on free plan; never `envVarIsSecret`.

## Environment Variables

Production values are configured in Netlify. Local runs should follow the workspace secrets workflow; keep `src/.env.example` current without real values.

Secrets use the workspace Vault and the `secrets.netlify_site_vars` mapping. For current intake, distribution, and local-run instructions, use `_config/guides/secrets-system.md`; the retired local refresh script is no longer part of the workflow.

| Variable | Purpose | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | empowr-cic project URL | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for RLS-scoped reads | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Service client â€” all writes; bypasses RLS | Server-only |
| `STRIPE_SECRET_KEY` | Checkout sessions, refunds, subscriptions, Customer Portal. Restricted key â€” needs **Prices: Read, Subscriptions: Write, Customer portal: Write** (Read is not enough). Production is LIVE mode; `.env.local` is `rk_test_`. | Server-only |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Server-only |
| ~~`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`~~ | **REMOVED** â€” the app uses hosted Checkout redirect, no browser stripe-js. Deliberately absent from Netlify; do not re-add. | n/a |
| `RESEND_API_KEY` | Transactional email | Server-only |
| `BREVO_API_KEY` | Brevo Contacts API; member and operational session lists | Server-only |
| `BREVO_MEMBERS_LIST_ID` | Optional override for **Empowr Members**; permanent list ID 17 | Server-only |
| `BREVO_GENERAL_LIST_ID` | Optional override for **General**; permanent list ID 3. Members are removed from this list on enrolment | Server-only |
| `BREVO_*_LIST_ID` | Optional overrides; permanent IDs 7â€“16 live in `lib/brevo.ts` | Server-only |
| `ADMIN_EMAILS` | Comma-separated admin allowlist for middleware guard | Server-only |

## Go-Live Sequence

1. /pre-deploy-security (blocking)
2. /pre-build-check
3. /netlify-supabase-check
4. /netlify-deploy (site + domain + env vars)
5. Update `_config/registry/netlify-sites.md`, `github.md`, `env-vars.md` via /update-registry
