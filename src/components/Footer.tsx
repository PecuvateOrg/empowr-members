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
// The © notice is gone (owner, 2026-09-15) and was never doing any work —
// copyright subsists automatically on creation under the Berne Convention
// and a notice has not been a condition of protection in the UK since 1957.
// What is left in its place is NOT decorative: a UK company must disclose
// its registered name, registered number and place of registration on its
// website (Companies Act 2006 s.82; Companies (Trading Disclosures)
// Regulations 2015, reg. 25). A CIC is a company, so this applies. Do not
// delete that line to tidy the footer.

import { links } from "@/lib/links";
import { useBottomBarPresent } from "@/components/BottomNav";

const LEGAL_LINKS = [
  { href: links.privacyPolicy, label: "Privacy Policy" },
  { href: links.termsAndConditions, label: "Terms & Conditions" },
  { href: links.riskWaiver, label: "Risk Waiver" },
] as const;

// Written out in full, never interpolated. Tailwind resolves classes by
// scanning source text for literals, so a composed `${prefix}block` would
// type-check, build, ship and emit NO CSS — the same trap CollapsibleNav's
// BREAKPOINTS map documents, and the one verify-nav-layout.ts tests for.
const BASE = "border-t border-line bg-warm-white";
const STEPS_ASIDE = "hidden border-t border-line bg-warm-white lg:block";

export function Footer() {
  const handedToBottomBar = useBottomBarPresent();

  return (
    <footer className={handedToBottomBar ? STEPS_ASIDE : BASE}>
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-8 text-sm text-mid sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <p>
          Empowr CIC. A community interest company registered in England and
          Wales, no. 13660924.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {LEGAL_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-blue"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
