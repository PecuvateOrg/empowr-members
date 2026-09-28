# Planning — Workspace Index

Planning workspace for Empowr Members. Each concern lives in its own subdirectory.

| Subdirectory | Contains |
|---|---|
| `spec/` | Product spec — what we're building: scope, offering types, business rules, membership model, build phases, open questions |
| `architecture/` | System design — stack, data model, Supabase access patterns, Stripe payment flows, waiver-gate mechanism |
| `decisions/` | ADR log — dated decision records with rationale |
| `phases/` | Execution plans for all build phases (0–4) — index + one subdirectory per phase, each with done-when criteria; includes the coverage review mapping phases to the project aim |
| `guide-book/` | **Guide Book**: the staff runbook. How the platform works, customer journeys, per-session policies, the admin area, troubleshooting. Source draft for the in-app guide pages |
| `passkit/` | PassKit wallet-pass integration — two-track build plan (Track A: per-booking session pass, greenlit; Track B: membership pass, blocked on Phase 2) |

Read `spec/CONTEXT.md` before designing; read `architecture/CONTEXT.md` before writing any schema or integration code.
