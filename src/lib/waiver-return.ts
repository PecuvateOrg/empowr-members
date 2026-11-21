import { safeAppPath } from "@/lib/safe-path";

// Where to send someone after signing the waiver. Every waiver link carries
// the page it came from, so a member who was mid-booking lands back on that
// session rather than having to find it again (reported 2026-10-04).
//
// Only same-app paths are accepted: "//host" and "/\host" are both read as
// protocol-relative by browsers, so either would make /waiver an open
// redirect. Pointing back at /waiver itself would just loop.
export function safeWaiverReturn(value: string | null | undefined): string | null {
  const path = safeAppPath(value);
  if (!path) return null;
  if (path === "/waiver" || path.startsWith("/waiver?") || path.startsWith("/waiver/")) {
    return null;
  }
  return path;
}

export function waiverHref(returnTo: string | null | undefined): string {
  const safe = safeWaiverReturn(returnTo);
  return safe ? `/waiver?returnTo=${encodeURIComponent(safe)}` : "/waiver";
}
