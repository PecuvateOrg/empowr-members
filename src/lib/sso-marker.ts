// The 12-hour end of a session opened by "Sign in with Empowr Dashboard".
// Edge-safe (no Node imports): the middleware reads it. Why a marker exists at
// all is explained in lib/sso.ts.

export const SSO_SESSION_HOURS = 12;
export const SSO_MARKER_COOKIE = "members_sso";
// The marker must outlive the Supabase session it describes, or an expired
// marker would vanish and leave the session looking like an ordinary one.
export const SSO_MARKER_MAX_AGE = 400 * 24 * 60 * 60;

/** `<session id>.<end in ms>` for the session the callback just opened. */
export function ssoMarker(sessionId: string, now = Date.now()): string {
  return `${sessionId}.${now + SSO_SESSION_HOURS * 3_600_000}`;
}

/** True only when the marker belongs to this session and its end has passed. */
export function ssoSessionExpired(
  marker: string | undefined,
  sessionId: string | undefined,
  now = Date.now(),
): boolean {
  if (!marker || !sessionId) return false;
  const dot = marker.lastIndexOf(".");
  if (dot <= 0) return false;
  const end = Number(marker.slice(dot + 1));
  return marker.slice(0, dot) === sessionId && Number.isFinite(end) && now >= end;
}
