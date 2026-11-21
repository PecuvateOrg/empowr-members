// The one check for "is this a path inside this app?", used by every redirect
// that takes a destination from the URL (?next=, ?returnTo=). "//host" and
// "/\host" are both read by browsers as protocol-relative, so either would turn
// the redirect into an open redirect.
export function safeAppPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
