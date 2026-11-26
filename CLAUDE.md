<!-- Generated from AGENTS.md by _config/scripts/sync-claude-md.py. Edit AGENTS.md, not this file. -->
# Empowr Members

> **This repository is PUBLIC** (`PecuvateOrg/empowr-members`).
>
> **Devlog and memory location:** `../workspace-docs/empowr-members/`
>
> `DEVLOG.md` and `memory.md` are not kept in this repo — write session entries to the path
> above instead. See `NON-NEGOTIABLES.md` for what must never be committed here.

<!-- NON-NEGOTIABLES.md, inlined -->
# Empowr Members — Non-Negotiables

Opened from `CLAUDE.md` ("Read `NON-NEGOTIABLES.md` before doing anything") — read before doing anything else in this
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
<!-- end NON-NEGOTIABLES.md -->

Other tools: read `NON-NEGOTIABLES.md` first, then `~/projects/NON-NEGOTIABLES.md`.

## Routing

| Task | Go to | Read | Skills |
|---|---|---|---|
| **Design: look, colours, components** | `design-system/` | `design-system/MASTER.md` (then the Empowr brand kit it names) | — |
| Feature spec / scope / phases | planning/spec/ | CONTEXT.md | — |
| Architecture / data model / integrations | planning/architecture/ | CONTEXT.md | — |
| Decision records (ADRs) | planning/decisions/ | CONTEXT.md | — |
| Phase execution (build steps for current phase) | planning/phases/ | CONTEXT.md → phase-N/ | — |
| UI / components / app code | src/ | CONTEXT.md | /webapp-testing |
| Deployment / going live | ops/ | CONTEXT.md | /netlify-deploy, /netlify-supabase-check |
| Brand / favicon setup | ops/ | CONTEXT.md | /init-brand |

## Cross-Workspace Flows

- New feature: planning/spec/ → planning/architecture/ (if schema changes) → src/ → ops/ (if env vars or build config change)
- Schema change (outside contributors): new `ops/sql/*.sql` file in the PR — see `AGENTS.md` "Proposing changes"; maintainers apply it
- Schema change (maintainers): apply via the Management API (see `_config/registry/supabase.md` reference), then regenerate `Empowr CIC/projects/supabase/migrations/` with `dump-ledger.mjs` — **not** `src/supabase/migrations/`, which stopped existing here 2026-08-06 (this DB is shared with Waivers and the EFN dashboard; see registry) → update `_config/registry/supabase.md`
- Go-live: src/ → /pre-deploy-security → /netlify-supabase-check → ops/

## File Placement

- Application code, config, migrations → src/
- Specs and scope docs → planning/spec/
- Design and data-model docs → planning/architecture/
- ADRs → planning/decisions/
- Deployment and env documentation → ops/

## Deployment

- Platform: AWS Amplify, London (eu-west-2), since 2026-10-30. The old Netlify site is deleted
- Nightly jobs: AWS Lambda via EventBridge Scheduler (`src/jobs/`, entry `lambda.ts`), redeployed on merge by `.github/workflows/deploy-jobs.yml`
- Domain: members.empowrcic.org
- Branch: main
- Base directory: src/

## Proposing changes (all contributors, including partner agents)

- Branch from `main` in this repo and open a PR into `main`. One topic per PR.
- The `verify` GitHub check must pass on your latest commit before anything is reviewed.
- **Database changes:** you do not have, and do not need, database access. Put the change in a
  **new** file `ops/sql/<short-topic>.sql`. Never edit a SQL file that is already on `main`:
  applied SQL is never re-run, so a change needs a new file.
  - Plain SQL only. No transaction control inside the file (one leading `begin;` and one
    trailing `commit;` are allowed), and no `dblink`, `COPY ... PROGRAM`, role, extension or
    file-access statements. These block the PR.
  - New objects use the `mem_` prefix. Changing existing data or objects without it is allowed
    but flagged for extra review.
  - The maintainers dry-run the file, then apply it and merge the PR. Do not ask for credentials.
- **Feedback comes on the PR.** If an automated comment lists reasons the PR is blocked, fix them
  and push again. Each push is checked afresh.
- In the PR description, say *why* the change is needed and what you tested, not only what changed.

## Facts

- Do not embed Empowr CIC identity here — route to the Empowr CIC KB (see CONTEXT.md)
