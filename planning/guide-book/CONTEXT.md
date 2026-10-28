# Guide Book — moved into the app

The staff guide book now lives in the admin, at `/admin/guides`, as pages in
`src/app/(admin)/admin/guides/` built from `src/components/guides/`. The door
guide (`CheckInGuide.tsx`) is shared by `/admin/guides/check-in` and
`/checkin/guide`, so door-only staff see the same text.

**Change a screen, change its guide in the same PR.** The markdown draft that
lived here (2026-09-28) was retired on 2026-10-28 so there is one copy only;
it is in git history.

The per-session policy table (`guides/policies`) is read from live
`mem_offerings` settings, which staff can change without any code change.
Re-read them whenever that page is edited.

This repository is public: guides describe how things work, never customer or
staff details or open security problems.
