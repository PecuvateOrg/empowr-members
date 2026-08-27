import type { MetadataRoute } from "next";

// The site had no robots.txt at all until public launch (2026-08-27) —
// /robots.txt served the app's own 404 HTML, which crawlers treat as
// "no rules" rather than as an error.
//
// The public catalogue is deliberately crawlable. The disallowed paths are
// excluded because a crawler cannot usefully render them — every one of them
// either 307s to /login or is reachable only from an emailed link — NOT
// because they are secret. The real gates are the middleware session guard
// and the ADMIN_EMAILS allowlist; robots.txt is advisory and enforces nothing.
//
// Note /ticket/: those pages are intentionally unauthenticated so a parent can
// show a ticket on someone else's phone. They are per-booking UUIDs reachable
// only from a confirmation email, so nothing links them for a crawler to
// follow. Disallow here is belt-and-braces — if they ever become linked from a
// public page, add `robots: { index: false }` to that route's metadata, since
// Disallow alone would stop a crawler ever reading such a tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/account",
        "/bookings",
        "/book",
        "/membership",
        "/admin",
        "/ticket/",
      ],
    },
  };
}
