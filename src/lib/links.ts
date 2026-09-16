// Centralised external URLs — never hardcode URLs in components.
export const links = {
  eela: "https://eela.empowrcic.org",
  mainSite: "https://empowrcic.org",
  waivers: "https://waiver.empowrcic.org",
  quiz: "https://start.empowrcic.org/quiz",
  hafBookings: "https://app.holidayactivities.com/parent/providers/empowr-cic",
  contactEmail: "general@empowrcic.org",
  // Internal staff inbox for new-booking alerts (lib/notifications.ts) —
  // an existing, monitored mailbox confirmed by Empowr 2026-09-02, not one
  // this app creates. Never shown in member-facing UI or emails.
  staffBookingAlerts: "bookings@empowrcic.org",
  // Brevo-hosted signup form. A LINK, not an input of ours: the form,
  // the storage and the double opt-in all live at Brevo, so nothing here
  // can accept an address and drop it. Offers three opt-ins - Adult
  // Roller Skating 15+, Kids Roller Skating 5+ (parent/guardian), and
  // General Empowr Updates - so it suits adult and child pages alike.
  mailingList:
    "https://0de76a6f.sibforms.com/serve/MUIFAMNUF49MtRhzTB1OWm-uTSvAr4nZjUDa3PZ8N8xO7Xa-ya15AwwUfNTXhJ3cbHbMeGJTBBjICl59i6R2QVDzwBdJxf0ZmyEyAIxUyDx6f_nQO3g9MyxUvzgA3VygujkCpfjqnCBugrhe2nmMkhAWkWBu8jnW651rugUOe04ha8DRY7m2B1qT-NKtBTTDIVf4Q7NqKmEvSOsOQQ==",
  privacyPolicy: "/legal/privacy-policy",
  termsAndConditions: "/legal/terms-and-conditions",
  riskWaiver: "/legal/risk-waiver",
  // The waiver's third consent document. Same three the standalone waiver
  // app links (Empowr-Waivers src/lib/links.ts) — served here through the
  // existing /legal/:slug LegalHub proxy rather than absolute empowrcic.org
  // URLs, per the links guide.
  photographyConsent: "/legal/photography-consent",
} as const;

// ---------------------------------------------------------------------------
// The footer's outbound links, added 2026-09-16 when this app's footer took on
// the main site's LAYOUT — the dark ground, the brand block over a rule, the
// social row — while keeping its own contents.
//
// DELIBERATELY SHORT. A first pass also imported the main site's About Us,
// Programmes, Get In Touch and shop columns; the owner pulled that back the
// same day. Everything in those columns is already reachable from the main
// site and EELA, and a member half way through a booking has no use for a
// second copy of the marketing nav. If you find yourself adding section links
// here, that decision is being reversed — check first.
//
// The legal links stay in `links` above and stay RELATIVE, because
// netlify.toml proxies `/legal/:slug` to LegalHub so they resolve on this
// domain. Everything below is genuinely off-site.
// ---------------------------------------------------------------------------
export const footerLinks = {
  companiesHouse:
    "https://find-and-update.company-information.service.gov.uk/company/13660924",
  socialInstagram: "https://www.instagram.com/empowr.cic",
  socialFacebook: "https://www.facebook.com/empowr.cic",
  socialYoutube: "https://www.youtube.com/@empowr.cic",
  socialLinkedIn: "https://www.linkedin.com/company/empowr-cic",
  socialWhatsApp: "https://chat.whatsapp.com/BuKlBkfDxHs2jdPyRzXwza",
} as const;

/** Registered office, as filed. Part of the statutory disclosure — see the
 *  comment in components/Footer.tsx before changing or removing it. */
export const REGISTERED_OFFICE =
  "Crown House, 27 Old Gloucester Street, London, WC1N 3AX.";

/** Registered company number, shown with the place of registration. */
export const COMPANY_NUMBER = "13660924";

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
