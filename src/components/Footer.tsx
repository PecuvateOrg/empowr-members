"use client";

// THE FOOTER HANDS ITS CONTENT OVER, IT DOES NOT JUST HIDE IT.
//
// Below 1024px on a route that has the bottom bar, these links sat directly
// above that fixed bar and made the end of every page a stack of pale
// chrome — so the bar's Menu panel carries them there instead, and the whole
// footer steps aside.
//
// But the bar only renders on member-facing routes. On /login, /signup,
// /ticket/[id] and the home page there is no bar and no Menu panel, and
// hiding this content there would strip the legal material off those pages
// entirely on a phone. So the decision is `useBottomBarPresent()`, not a
// bare `lg:` class: step aside only where something else is showing it.
//
// IT WEARS THE MAIN SITE'S FOOTER LAYOUT — AND ONLY THE LAYOUT (owner,
// 2026-09-16, correcting a first attempt that went too far). Same dark
// ground, same brand block sitting over a rule, same bottom strip with the
// links at one end and the social row at the other, same `max-w-7xl px-6`
// measure. What it does NOT take is the main site's CONTENTS: no About Us,
// Programmes or Get In Touch columns, no shop. Everything in those columns is
// already reachable from the main site and EELA, and a member half way
// through a booking has no use for a second copy of the marketing nav.
//
// THIS FOOTER IS WIDER THAN THE APP ABOVE IT, ON PURPOSE. SiteHeader,
// BottomNav and the page containers are all `max-w-4xl` (896px); this is
// 7xl (1280px). Matching the main site was the instruction and the point —
// the footer is the seam between the two sites, so it reads as continuous
// with empowrcic.org rather than with this app's narrower reading column.
// Do not "fix" the mismatch by pulling this back to 4xl.
//
// The © notice is gone (owner, 2026-09-15) and was never doing any work —
// copyright subsists automatically on creation under the Berne Convention
// and a notice has not been a condition of protection in the UK since 1957.
// Note that the main site's own footer still carries "© ... All rights
// reserved" in this strip; it is deliberately NOT copied across, for the same
// reason the notice was removed in the first place.
//
// What is left in its place is NOT decorative: a UK company must disclose
// its registered name, registered number and place of registration on its
// website (Companies Act 2006 s.82; Companies (Trading Disclosures)
// Regulations 2015, reg. 25). A CIC is a company, so this applies. Do not
// delete that block to tidy the footer. The registered office came across
// with the main site's brand block and strengthens it, which is why
// BottomNav's Menu panel — which shows this same disclosure below the
// breakpoint — reads the same two constants. Those must not drift.

import {
  links,
  footerLinks,
  REGISTERED_OFFICE,
  COMPANY_NUMBER,
} from "@/lib/links";
import { useBottomBarPresent } from "@/components/BottomNav";

/** The footer's own links, unchanged from before the main site's layout was
 *  adopted. Relative on purpose: netlify.toml proxies /legal/:slug to
 *  LegalHub, so these resolve on this domain. */
const LEGAL_LINKS = [
  { href: links.privacyPolicy, label: "Privacy Policy" },
  { href: links.termsAndConditions, label: "Terms & Conditions" },
  { href: links.riskWaiver, label: "Risk Waiver" },
] as const;

const SOCIALS: { href: string; label: string; path: string }[] = [
  {
    href: footerLinks.socialInstagram,
    label: "Instagram",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
  },
  {
    href: footerLinks.socialFacebook,
    label: "Facebook",
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
  {
    href: footerLinks.socialYoutube,
    label: "YouTube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    href: footerLinks.socialLinkedIn,
    label: "LinkedIn",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    href: footerLinks.socialWhatsApp,
    label: "WhatsApp",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z",
  },
];

// Written out in full, never interpolated. Tailwind resolves classes by
// scanning source text for literals, so a composed `${prefix}block` would
// type-check, build, ship and emit NO CSS — the same trap CollapsibleNav's
// BREAKPOINTS map documents, and the one verify-nav-layout.ts tests for.
const BASE = "bg-black text-warm-white";
const STEPS_ASIDE = "hidden bg-black text-warm-white lg:block";

export function Footer() {
  const handedToBottomBar = useBottomBarPresent();

  return (
    <footer className={handedToBottomBar ? STEPS_ASIDE : BASE}>
      {/* PADDING IS SCALED TO WHAT IS ACTUALLY IN HERE. The main site uses
          py-16 with a 12/8 gap above its strip, which is right for a footer
          carrying seven columns; copied onto this one it made 186px of the
          footer's 421px empty space and put it at 58% of a 1280x720 laptop
          screen. Measured, then cut. If content is ever added back, revisit
          these rather than assuming they are the main site's numbers. */}
      <div className="mx-auto max-w-7xl px-6 py-8 sm:py-10">
        {/* Two columns, because at max-w-7xl a single left-hand block left
            ~800px of empty ground beside it — the footer read as wide AND
            tall at the same time. The main site fills that width with its
            column set; this fills it by standing the company details beside
            the brand instead of under it, which also takes ~80px off the
            height. */}
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <div className="max-w-md">
            <p className="mb-2 text-lg font-extrabold tracking-tight text-white">
              Empowr CIC
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Promoting lifelong wellbeing through the transformative power of
              experiential learning.
            </p>
          </div>

          {/* THE STATUTORY TRADING DISCLOSURE — see the note at the top of
              this file. Registered name, place of registration, number and
              registered office. Not decorative, not removable. */}
          <div className="space-y-1 text-xs leading-relaxed text-muted sm:pt-1">
            <p>Registered in England and Wales.</p>
            <p>
              Company no.{" "}
              <a
                href={footerLinks.companiesHouse}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                {COMPANY_NUMBER}
              </a>
              .
            </p>
            <p>{REGISTERED_OFFICE}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {LEGAL_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center transition-colors hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {SOCIALS.map(({ href, label, path }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-11 w-11 items-center justify-center transition-colors hover:text-white"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
