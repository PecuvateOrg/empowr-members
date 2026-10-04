// Where to send someone after signing the waiver. Every waiver link carries
// the page it came from, so a member who was mid-booking lands back on that
// session rather than having to find it again (reported 2026-10-04).
//
// Only same-app paths are accepted: "//host" and "/\host" are both read as
// protocol-relative by browsers, so either would make /waiver an open
// redirect. Pointing back at /waiver itself would just loop.
export function safeWaiverReturn(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value === "/waiver" || value.startsWith("/waiver?") || value.startsWith("/waiver/")) {
    return null;
  }
  return value;
}

export function waiverHref(returnTo: string | null | undefined): string {
  const safe = safeWaiverReturn(returnTo);
  return safe ? `/waiver?returnTo=${encodeURIComponent(safe)}` : "/waiver";
}
