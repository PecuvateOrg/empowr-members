#!/usr/bin/env bash
# Local-network preview of Members: a production build served from this
# workstation to anyone on the same Wi-Fi/LAN, costing no Netlify minutes.
#
#   bash ops/lan-preview.sh            # build, then serve on port 3100
#   PORT=3200 bash ops/lan-preview.sh  # another port
#
# What it talks to (same as a Netlify deploy preview, minus two things):
#   - Supabase: the LIVE empowr-cic database. There is only one. Anything
#     saved here is real (bookings, blocks, members).
#   - Stripe:   TEST mode, always. The live key is never loaded, and the
#     script refuses to start if the key is not a test key.
#   - Resend:   real email. A confirmation goes to the member's real inbox.
#   - OFF:      Brevo newsletter sync and the Netlify catalogue rebuild hook
#               (a rebuild would spend the build minutes this exists to save).
#   - Stripe webhooks cannot reach a LAN address, so a test payment will not
#     confirm unless `stripe listen` forwards to it.
#
# Sign in with a password: magic links point at the address Supabase allows,
# not this machine. Admin access follows ADMIN_EMAILS as in production.

set -euo pipefail

PORT="${PORT:-3100}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS="$HOME/projects/_config/skills/sync-secrets/scripts"
LAN_IP="$(hostname -I | awk '{print $1}')"
URL="http://${LAN_IP}:${PORT}"

# Test-mode Stripe key, preset so run-with-secrets does not load the live one
# (an already-set variable always wins there).
# shellcheck disable=SC1091
source "$SECRETS/inject-secrets.sh" MEMBERS_STRIPE_PAYMENTS_RESTRICTED_KEY_TEST >/dev/null
export STRIPE_SECRET_KEY="${MEMBERS_STRIPE_PAYMENTS_RESTRICTED_KEY_TEST:-}"
unset MEMBERS_STRIPE_PAYMENTS_RESTRICTED_KEY_TEST
case "$STRIPE_SECRET_KEY" in
  rk_test_*|sk_test_*) ;;
  *) echo "lan-preview: refusing to start - the Stripe key is not a TEST key." >&2; exit 1 ;;
esac

export NEXT_PUBLIC_SITE_URL="$URL"

# Everything else from the vault. The child drops the live webhook secret,
# Brevo and the rebuild hook before Next ever sees them.
run() {
  "$SECRETS/run-with-secrets.sh" --site "Empowr Members" --with-production -- \
    env -u STRIPE_WEBHOOK_SECRET -u BREVO_API_KEY -u NETLIFY_CATALOGUE_BUILD_HOOK "$@"
}

cd "$REPO/src"
echo "lan-preview: building (Stripe TEST mode, live database)..."
run npx next build
echo
echo "lan-preview: serving at $URL  - share this with anyone on the network."
echo "             Ctrl+C to stop. Branch: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
run npx next start -H 0.0.0.0 -p "$PORT"
