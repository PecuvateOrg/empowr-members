#!/usr/bin/env bash
# Netlify `ignore` command: exit 0 = SKIP this build, exit 1 = BUILD.
#
# The account is on Netlify Free (300 build minutes a month, shared by every
# site) and ran out on 2026-09-29, with Members using about half: 59 of its
# 100+ September builds were PR previews rebuilt on every push. Owner
# decision 2026-09-29: checks run locally, previews are built ON REQUEST
# only, and production skips pushes that cannot change the site.
#
#   Deploy previews: build only when the head commit message contains
#                    [preview]  (e.g. `git commit --allow-empty -m "[preview]"`).
#   Production:      build only when src/ or netlify.toml changed since the
#                    last deploy (docs, planning, ops-only pushes are skipped).
#
# Anything this script cannot determine falls through to BUILD: a wasted
# minute is cheaper than a fix that silently never ships.

set -u

if [ "${CONTEXT:-}" = "deploy-preview" ]; then
  if git log -1 --pretty=%B "${COMMIT_REF:-HEAD}" 2>/dev/null | grep -qF "[preview]"; then
    echo "netlify-ignore: [preview] requested - building."
    exit 1
  fi
  echo "netlify-ignore: preview not requested (add [preview] to the commit message) - skipping."
  exit 0
fi

if [ -z "${CACHED_COMMIT_REF:-}" ] || [ "${CACHED_COMMIT_REF}" = "${COMMIT_REF:-}" ]; then
  echo "netlify-ignore: no previous deploy to compare with - building."
  exit 1
fi

# Paths are relative to the repo root; Netlify runs this from base="src".
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ..)" || exit 1
git diff --quiet "$CACHED_COMMIT_REF" "${COMMIT_REF:-HEAD}" -- src netlify.toml
case $? in
  0) echo "netlify-ignore: nothing under src/ or netlify.toml changed - skipping."; exit 0 ;;
  1) echo "netlify-ignore: site files changed - building."; exit 1 ;;
  *) echo "netlify-ignore: could not compare commits - building."; exit 1 ;;
esac
