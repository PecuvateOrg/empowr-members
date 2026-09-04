# Agent Instructions

Read `CLAUDE.md` first. It is the canonical MWP Layer 0 file for this project and contains the routing table, project-wide rules, deployment metadata, and token-management instructions.

Then read these files when present and relevant:

1. `CONTEXT.md` for project orientation
2. `memory.md` for current state
3. `DEVLOG.md` for recent session history

These instructions are agent-generic unless a section is explicitly marked Claude-only.

## Repository Workflow

- Work from a contributor-owned fork rather than committing feature branches directly to the upstream repository.
- For Empowr CIC work, set `origin` to `EmpowrCIC/empowr-members` and `upstream` to `PecuvateOrg/empowr-members`.
- Create feature branches on `origin` and open pull requests from the fork into `upstream`.
- All agents and delegated agents must follow this remote layout.
