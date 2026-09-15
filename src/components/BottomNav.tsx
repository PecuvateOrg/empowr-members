"use client";

// The touch navigation: a fixed bar of three icon tabs at the bottom of the
// screen, below 1024px. Above that the header's inline row takes over and
// this does not render at all.
//
// WHY 1024px AND NOT 640px. The bar has to cover tablets, not just phones
// (owner, 2026-09-15). `lg` is already this codebase's tablet boundary —
// AdminHeader collapses there because a door tablet is a 768px iPad in
// portrait — so the two nav-carrying surfaces now agree rather than each
// having its own idea of where touch ends. Every tablet in portrait up to
// 11" is below 1024px and gets the bar; at 1024px and wider there is room
// for the full row, which was measured comfortable at 640px.
//
// WHY THREE TABS. Menu, Account, Basket (owner's call, revising the earlier
// five). Home, Sessions and Bookings moved into the Menu panel: they are
// destinations you choose, whereas the basket is a transaction in progress
// and the account is the one place a member returns to. Three tabs also
// means three wide targets rather than five narrow ones on a 320px screen.
//
// THE MENU PANEL OPENS UPWARD out of the bar. It reuses `useMenuDisclosure`,
// the same Escape / outside-click / close-on-navigate / close-above-the-
// breakpoint behaviour the header menu uses — the behaviour is shared, only
// the direction and the styling differ.
//
// SPACING, NOT OVERLAP. The bar is `fixed`, so it covers whatever is at the
// bottom of the page. `BottomNavSpacer` below is rendered in normal flow by
// the root layout to give the page an equal amount of clearance. The cookie
// banner is handled separately — it sits directly ON TOP of this bar rather
// than over it (see CookieConsentBanner), because a first-time visitor who
// cannot reach the nav until they answer a cookie prompt is the same bug
// that banner's own comment already records once.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { AuthNavAction } from "@/components/AuthNavAction";
import { BasketTabIcon } from "@/components/booking/BasketNavLink";
import { useMenuDisclosure } from "@/components/useMenuDisclosure";
import { links as external } from "@/lib/links";

/** Height of the bar. Exported so the spacer reads the SAME number —
 *  hardcoded copies are how one of them drifts and something ends up
 *  unreachable at the bottom of the screen. The cookie banner's offset is a
 *  Tailwind class and cannot import this, so `verify-nav-layout.ts` pins it
 *  against this constant instead. */
export const BOTTOM_NAV_HEIGHT_PX = 60;

/** The one width where touch nav becomes desktop nav. Every place that has
 *  to agree with it is listed in `verify-nav-layout.ts`, which fails if any
 *  one of them drifts: the bar, the spacer, the header's inline row, the
 *  header basket icon, the cookie banner offset, and this media query. */
export const BOTTOM_NAV_MEDIA_ABOVE = "(min-width: 64rem)";

// EXACTLY the routes that render SiteHeader — the (member) group plus the
// public catalogue. Nothing else gets the bar.
//
// A POSITIVE LIST, NOT AN EXCLUSION LIST, and the difference was a real bug.
// The first version excluded /admin and /checkin and let everything else
// through, which quietly put a nav bar on /login, /signup, /auth/confirm,
// the home page and — worst — /ticket/[bookingId], the QR code a member
// holds up at the door. Those routes have no header by design. An exclusion
// list also means every future route opts IN by default, silently.
//
// WHY A PREFIX LIST RATHER THAN RENDERING THIS FROM THE MEMBER LAYOUTS: the
// spacer has to be the LAST thing in the body, and <Footer /> is rendered by
// the ROOT layout after {children} — so a spacer inside (member)/layout.tsx
// sits above the footer and leaves the real bottom of the page uncleared.
// Caught in a browser, not reasoned about: the footer stayed under the bar
// once the cookie banner was accepted and stopped contributing its own
// spacer. `verify-nav-layout.ts` pins this list against the route folders
// that actually exist, so a new (member) route cannot be added without it.
const BAR_PREFIXES = [
  "/account",
  "/basket",
  "/book",
  "/bookings",
  "/membership",
  "/sessions",
  "/waiver",
];

/** Is the bottom bar rendered on this route? Exported because the Footer
 *  has to know: below the breakpoint it hands its legal links and the
 *  statutory disclosure over to the bar's Menu panel, but on a route with no
 *  bar — /login, /signup, /ticket/[id], the home page — there is nothing to
 *  hand them to, and hiding them there would strip the legal material off
 *  those pages entirely on a phone. One rule, one place, both callers. */
export function useBottomBarPresent(): boolean {
  const pathname = usePathname();
  return BAR_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

const useOnMemberSurface = useBottomBarPresent;

/** Destinations, in the Menu panel rather than the bar. Sessions points
 *  off-site to EELA, which is the only place that promotes browsing
 *  sessions (2026-09-08) — the same target the desktop header uses. */
const MENU_LINKS = [
  { href: "/", label: "Home" },
  { href: external.eela, label: "Sessions" },
  { href: "/bookings", label: "Bookings" },
] as const;

/** The touch home of the three legal links. They are `hidden lg:flex` in the
 *  Footer, because below the breakpoint they landed directly above this bar
 *  and turned the end of every page into stacked chrome. Same three, same
 *  order — keep them in step with Footer.tsx.
 *
 *  These are the LegalHub proxy routes (/legal/:slug), not pages this app
 *  owns, and they open in a new tab exactly as the footer's do: a member
 *  part-way through a booking should not lose the flow to read a policy. */
const LEGAL_LINKS = [
  { href: external.privacyPolicy, label: "Privacy Policy" },
  { href: external.termsAndConditions, label: "Terms & Conditions" },
  { href: external.riskWaiver, label: "Risk Waiver" },
] as const;

function tabClasses(active: boolean): string {
  return `flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-bold ${
    active ? "text-blue" : "text-mid"
  }`;
}

export function BottomNav() {
  const pathname = usePathname();
  const onMemberSurface = useOnMemberSurface();
  const { open, toggle, setOpen, panelRef, buttonRef } = useMenuDisclosure({
    closeAbove: BOTTOM_NAV_MEDIA_ABOVE,
  });

  if (!onMemberSurface) return null;

  const accountActive = pathname === "/account" || pathname.startsWith("/account/");

  return (
    // `z-[60]` puts this ABOVE CookieConsentBanner's z-50. The bar and the
    // banner never physically overlap — the banner is lifted clear of it —
    // but the MENU PANEL does: at z-40 the banner covered the bottom of an
    // open menu, so "Risk Waiver" and Sign in/out were unreachable while a
    // cookie prompt was showing. Seen in a screenshot, not predicted.
    <div className="fixed inset-x-0 bottom-0 z-[60] lg:hidden">
      {open && (
        <div
          ref={panelRef}
          id="bottom-menu"
          // `bottom-full` — this panel rises OUT of the bar rather than
          // dropping from the header. Capped and scrollable because it now
          // carries the destinations as well as the legal links, and on a
          // 568px phone a taller one would run off the top of the screen
          // with no way to reach it.
          className="absolute bottom-full inset-x-0 max-h-[70vh] overflow-y-auto border-t border-line bg-warm-white shadow-md"
        >
          <nav className="mx-auto flex max-w-4xl flex-col px-4 py-2 text-sm font-bold text-mid sm:px-6">
            {MENU_LINKS.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                className="border-b border-line/60"
                onNavigate={() => setOpen(false)}
                // Full-width rows: an underline here reads as another
                // divider, so colour alone marks the current section.
                indicator="none"
              >
                {label}
              </NavLink>
            ))}

            <p className="pb-1 pt-3 text-xs font-black uppercase tracking-wide text-mid/70">
              Legal
            </p>
            {LEGAL_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="border-b border-line/60 py-3 font-semibold transition-colors hover:text-blue"
              >
                {label}
              </a>
            ))}

            <div className="py-1">
              <AuthNavAction expanded />
            </div>

            {/* The statutory trading disclosure, which the footer carries at
                1024px and up. A UK company must disclose its registered
                name, number, place of registration and registered office on
                its website (Companies Act 2006 s.82; Companies (Trading
                Disclosures) Regulations 2015), and a CIC is a company — so
                when the footer line is hidden below the breakpoint it has to
                appear somewhere, and this panel is where the rest of the
                legal material now lives. Keep it in step with Footer.tsx. */}
            <p className="border-t border-line/60 pt-3 pb-1 text-xs font-semibold leading-relaxed text-mid/70">
              Empowr CIC. A community interest company registered in England
              and Wales, no. 13660924.
            </p>
          </nav>
        </div>
      )}

      <nav
        aria-label="Main"
        className="mx-auto flex max-w-4xl items-stretch border-t border-line bg-warm-white"
        style={{ minHeight: BOTTOM_NAV_HEIGHT_PX }}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="bottom-menu"
          className={tabClasses(false)}
        >
          {open ? (
            <X className="h-6 w-6" aria-hidden />
          ) : (
            <Menu className="h-6 w-6" aria-hidden />
          )}
          {open ? "Close" : "Menu"}
        </button>

        <Link
          href="/account"
          aria-current={accountActive ? "page" : undefined}
          className={tabClasses(accountActive)}
        >
          <CircleUser className="h-6 w-6" aria-hidden />
          Account
        </Link>

        <BasketTabIcon className={tabClasses(pathname === "/basket")} />
      </nav>
    </div>
  );
}

/** Rendered in normal flow, LAST in the body (after <Footer />), so the end
 *  of the page can be scrolled clear of the fixed bar. Same width rule and
 *  same surface rule as the bar itself — if one renders, so does the other,
 *  or the footer ends up underneath it. */
export function BottomNavSpacer() {
  const onMemberSurface = useOnMemberSurface();
  if (!onMemberSurface) return null;
  return (
    <div
      aria-hidden
      className="lg:hidden"
      style={{ height: BOTTOM_NAV_HEIGHT_PX }}
    />
  );
}
