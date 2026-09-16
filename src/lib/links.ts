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
  cookiePolicy: "/legal/cookie-policy",
  programmePolicies: "/legal/programme-policies",
  // The waiver's third consent document. Same three the standalone waiver
  // app links (Empowr-Waivers src/lib/links.ts) — served here through the
  // existing /legal/:slug LegalHub proxy rather than absolute empowrcic.org
  // URLs, per the links guide.
  photographyConsent: "/legal/photography-consent",
} as const;

// ---------------------------------------------------------------------------
// The footer's outbound links, added 2026-09-16 when this app's footer took on
// the main site's layout so the two read as one organisation.
//
// EVERY SECTION LINK IS ABSOLUTE AND OFF `links.mainSite`. The main site's own
// footer reaches these with next/link (`/about`, `/news`, ...) because they
// are its own routes. **None of those routes exist here**, so copying that
// footer verbatim would have produced a row of 404s. Composing them off one
// constant also means a domain change is one edit, not fourteen — the trap in
// [[feedback_shared_destination_hardcoded_parent]].
//
// `/legal/*` above is the deliberate exception: it stays RELATIVE because
// netlify.toml proxies `/legal/:slug` to LegalHub, so those already resolve on
// this domain and must keep doing so.
// ---------------------------------------------------------------------------
const MAIN = links.mainSite;

export const footerLinks = {
  about: `${MAIN}/about`,
  philosophy: `${MAIN}/experiential-learning`,
  impact: `${MAIN}/impact`,
  history: `${MAIN}/history`,
  news: `${MAIN}/news`,
  faqs: `${MAIN}/faqs`,
  contact: `${MAIN}/contact`,
  partnerWithUs: `${MAIN}/partner-with-us`,
  workWithUs: `${MAIN}/work-with-us`,
  eccp: `${MAIN}/eccp`,
  allPolicies: `${MAIN}/legal`,
  heroes: "https://hero.empowrcic.org",
  shop: "https://empowrcic.wixsite.com/empowrcic/shop",
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
