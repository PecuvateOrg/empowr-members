# Agent Instructions

Read `CLAUDE.md` first. It is the canonical MWP Layer 0 file for this project and contains the routing table, project-wide rules, deployment metadata, and token-management instructions.

Then read these files when present and relevant:

1. `CONTEXT.md` for project orientation

This repo is **public**. Its `memory.md` and `DEVLOG.md` are not kept here — they live in
the private Empowr CIC hub at `../workspace-docs/empowr-members/`. Read and write them
there. Never recreate either file in this repo; both are gitignored and would be
silently lost.

These instructions are agent-generic unless a section is explicitly marked Claude-only.

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
