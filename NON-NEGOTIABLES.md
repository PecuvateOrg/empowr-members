# Empowr Members — Non-Negotiables

Forced open by `CLAUDE.md`'s Self-Reference line — read before doing anything else in this
project.

## Rules

- **This repository is PUBLIC** (`PecuvateOrg/empowr-members`). Never create `DEVLOG.md` or
  `memory.md` in this repo — both filenames are gitignored here, so a copy created in this
  directory is silently never committed. Write session entries to
  `../workspace-docs/empowr-members/` in the private Empowr CIC hub instead.
- Never put live identifiers, unremediated security findings, or commercial state in any file
  tracked here. See `../CONTEXT.md` and `_config/guides/public-repo-collaboration.md`.

## Naming Conventions

- Components: PascalCase (`BookingCard.tsx`)
- Database tables: `mem_` prefix (shared Supabase project)
- Migrations: `YYYYMMDDHHMMSS_name.sql`, generated into `Empowr CIC/supabase/migrations/` (schema-of-record repo) — never hand-authored, never under `src/`
- Decision records: `YYYY-MM-DD-decision-title.md`
- Env vars: `NEXT_PUBLIC_` prefix only for browser-safe values
