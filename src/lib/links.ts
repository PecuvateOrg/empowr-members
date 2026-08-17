// Centralised external URLs — never hardcode URLs in components.
export const links = {
  eela: "https://eela.empowrcic.org",
  mainSite: "https://empowrcic.org",
  waivers: "https://waiver.empowrcic.org",
  quiz: "https://start.empowrcic.org/quiz",
  hafBookings: "https://app.holidayactivities.com/parent/providers/empowr-cic",
  contactEmail: "general@empowrcic.org",
  privacyPolicy: "/legal/privacy-policy",
  termsAndConditions: "/legal/terms-and-conditions",
  riskWaiver: "/legal/risk-waiver",
  // The waiver's third consent document. Same three the standalone waiver
  // app links (Empowr-Waivers src/lib/links.ts) — served here through the
  // existing /legal/:slug LegalHub proxy rather than absolute empowrcic.org
  // URLs, per the links guide.
  photographyConsent: "/legal/photography-consent",
} as const;

// This app's own public base. Emails and other absolute-URL contexts use
// it; prefer NEXT_PUBLIC_SITE_URL when set (e.g. deploy previews) and fall
// back to production.
export const MEMBERS_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://members.empowrcic.org";

/** Absolute URL for a path on this site, for use in emails. */
export function membersUrl(path = ""): string {
  return `${MEMBERS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
