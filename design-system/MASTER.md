# Design System — Empowr Members (members.empowrcic.org)

> What **this project** decided. Read before building or changing any page.
> Layers, read bottom-up; each may be stricter than the one above, never looser:
> 1. Web Build Framework (`core/` + the matching `types/` overlay): rules for any build.
> 2. Brand kit: the Empowr brand kit, `company/identity/brand-guide.md` in the Empowr CNS (private hub): colours, logo, Nunito, voice and the UI house style, including its **contrast table**. **Not restated here.**
> 3. This file: only what is specific to this project.

| | |
|---|---|
| **Build type** | web-app (public booking and membership, families) |
| **Framework** | Next.js 15 + Tailwind v4 |
| **Created** | 2026-11-14 (recorded from the code as it stands) |
| **Last decision** | 2026-11-14 |

---

## Layout

Public booking pages and account area; staff areas. The reference for the brand kit's standard form field.

## Current state vs the brand kit

- Empowr blue and Nunito ✅.
- Two field styles in use (7 of 14 inline fields use the faint `border-line` with no focus ring).
- Red text used 93 times (`text-red` 4, `text-red-dark` 89).

---

## Decision log

### 2026-11-14 — Recorded
- First design record, from the group-wide design records pass. No code changed; gaps below
  are fixed per project, with screenshots before anything goes live.

## Open questions

- [ ] Red text fails contrast (`--red` 2.94:1, `--red-dark` 4.13:1). Per the brand kit, error and warning text becomes `--black` in a `--red-soft` box with a red icon.
- [ ] Move every field to the standard field (brand kit), retiring the plain variant.
- [ ] Check form field borders: the brand kit requires a 3:1 edge (`--muted`), and `--border` #e5e1db (1.3:1) fails. Fields also need the focus ring.
