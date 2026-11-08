#!/usr/bin/env bash
# Fails if any tracked file contains an email address outside the allowed domains.
# Why: this repo is PUBLIC. On 2026-09-14 an incident note with four customer
# emails was committed here and stayed public for eight weeks. Customer data
# belongs in the private hub (workspace-docs/empowr-members/), never here.
# To allow a new non-personal domain, add it to ALLOWED below.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
ALLOWED='@(empowrcic\.org|pecuvate\.com|example\.(com|org|net|test)|[A-Za-z0-9.-]+\.(test|invalid|example)|users\.noreply\.github\.com)$'
hits=$(git grep -IhoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' \
  -- . ':!*package-lock.json' ':!*.lock' | grep -viE "$ALLOWED" | sort -u || true)
if [ -n "$hits" ]; then
  echo "Personal-looking email addresses found in a PUBLIC repo:" >&2
  git grep -nIE -F -f <(printf '%s\n' "$hits") -- . ':!*package-lock.json' ':!*.lock' >&2 || true
  echo "Move customer data to workspace-docs/empowr-members/ (private hub)." >&2
  exit 1
fi
echo "No personal email addresses found."
