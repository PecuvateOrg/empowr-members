#!/usr/bin/env bash
# Pre-push gate for the credit-notes SQL. Owner decision 2026-09-28.
#
# verify:credit-sql needs the schema ledger, which lives in the PRIVATE
# workspace repo, so CI (public repo) can only skip it. This hook is where it
# is actually enforced: any push that touches the credit SQL, its harness, the
# refund code — or, from the workspace repo, the ledger itself — runs the suite
# first and is refused if it fails.
#
# Installed as .git/hooks/pre-push in BOTH repos:
#   Empowr Members  — ln -s ../../ops/scripts/pre-push-credit-sql.sh .git/hooks/pre-push
#   empowr-cic-workspace — see the same line, pointing at this file.
# Hooks are not versioned; re-install after a fresh clone.
set -euo pipefail

MEMBERS="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
WATCH='^(ops/scripts/.*\.sql|ops/sql/.*\.sql|ops/scripts/pglite-schema\.mjs|ops/scripts/verify-(credit|private-topups)-sql\.mjs|src/lib/credits\.ts|supabase/migrations/.*\.sql)$'
ZERO=0000000000000000000000000000000000000000

touched=0
while read -r _lref lsha _rref rsha; do
  [ "$lsha" = "$ZERO" ] && continue   # deleting a branch
  if [ "$rsha" = "$ZERO" ]; then
    base=$(git merge-base "$lsha" origin/main 2>/dev/null || git rev-list --max-parents=0 "$lsha" | tail -1)
  else
    base=$rsha
  fi
  if git diff --name-only "$base" "$lsha" | grep -qE "$WATCH"; then touched=1; fi
done

[ "$touched" = 0 ] && exit 0

# Every PGlite suite: they replay the same private ledger, so they share this gate.
for suite in verify:credit-sql verify:private-topups-sql; do
  echo "pre-push: SQL or schema ledger changed — running $suite" >&2
  if ! (cd "$MEMBERS/src" && npm run -s "$suite" >/tmp/pre-push-credit-sql.log 2>&1); then
    grep -E "^✖|ℹ (pass|fail)|Error" /tmp/pre-push-credit-sql.log >&2 || true
    echo "pre-push: REFUSED — $suite failed (full log /tmp/pre-push-credit-sql.log)" >&2
    exit 1
  fi
  echo "pre-push: $suite passed" >&2
done
