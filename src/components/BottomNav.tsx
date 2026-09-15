"use client";

// The mobile navigation: a fixed bar of icon tabs at the bottom of the
// screen, below 640px only. Above that the header's inline row takes over
// and this does not render at all.
//
// WHY IT EXISTS. The header nav is `hidden sm:flex`, so on a phone every
// destination sat behind a hamburger — including the basket, which is a
// transaction in progress and needs to be visible and one tap away. Chosen
// against the Amazon mobile pattern (owner's reference, 2026-09-15), which
// is also why the fifth slot is MENU rather than a fifth destination: the
// bar surfaces the four things people reach for and everything else stays
// reachable, so nothing is orphaned by giving it only four slots.
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
import { CalendarCheck, Home, Menu, Ticket, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { AuthNavAction } from "@/components/AuthNavAction";
import { BasketTabIcon } from "@/components/booking/BasketNavLink";
import { useMenuDisclosure } from "@/components/useMenuDisclosure";
import { links as external } from "@/lib/links";

/** Height of the bar. Exported so the spacer and the cookie banner offset
 *  read the SAME number — three hardcoded copies is how one of them drifts
 *  and something ends up unreachable at the bottom of a phone screen. */
export const BOTTOM_NAV_HEIGHT_PX = 60;

// The two surfaces that bring their own header and must NOT get the member
// bottom bar: /admin (AdminHeader, six links, collapses at lg for the door
// tablet) and /checkin (its own minimal header). Everything else under the
// root layout is member-facing.
//
// WHY A PREFIX LIST RATHER THAN RENDERING THIS FROM THE MEMBER LAYOUTS: the
// spacer has to be the LAST thing in the body, and <Footer /> is rendered by
// the ROOT layout after {children} — so a spacer inside (member)/layout.tsx
// sits above the footer and leaves the real bottom of the page uncleared.
// That was caught in a browser, not reasoned about: the footer stayed under
// the bar once the cookie banner was accepted and stopped contributing its
// own spacer. `verify-nav-layout.ts` pins this list against the layouts that
// actually render their own header.
const NON_MEMBER_PREFIXES = ["/admin", "/checkin"];

function useOnMemberSurface(): boolean {
  const pathname = usePathname();
  return !NON_MEMBER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: external.eela, label: "Sessions", Icon: Ticket },
  { href: "/bookings", label: "Bookings", Icon: CalendarCheck },
] as const;

function tabClasses(active: boolean): string {
  return `flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-bold ${
    active ? "text-blue" : "text-mid"
  }`;
}

export function BottomNav() {
  const pathname = usePathname();
  const onMemberSurface = useOnMemberSurface();
  const { open, toggle, setOpen, panelRef, buttonRef } = useMenuDisclosure({
    closeAbove: "(min-width: 40rem)",
  });

  if (!onMemberSurface) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden">
      {open && (
        <div
          ref={panelRef}
          id="bottom-menu"
          // `bottom-full` — this panel rises OUT of the bar rather than
          // dropping from the header. Everything else about it matches the
          // header's stacked panel.
          className="absolute bottom-full inset-x-0 border-t border-line bg-warm-white shadow-md"
        >
          <nav className="flex flex-col px-4 py-2 text-sm font-bold text-mid">
            <NavLink
              href="/account"
              className="border-b border-line/60"
              onNavigate={() => setOpen(false)}
              indicator="none"
            >
              Account
            </NavLink>
            <div className="py-1">
              <AuthNavAction expanded />
            </div>
          </nav>
        </div>
      )}

      <nav
        aria-label="Main"
        className="flex items-stretch border-t border-line bg-warm-white"
        style={{ minHeight: BOTTOM_NAV_HEIGHT_PX }}
      >
        {TABS.map(({ href, label, Icon }) => {
          const active =
            href.startsWith("/") &&
            (pathname === href ||
              (href !== "/" && pathname.startsWith(`${href}/`)));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={tabClasses(active)}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {label}
            </Link>
          );
        })}

        <BasketTabIcon className={tabClasses(pathname === "/basket")} />

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
      className="sm:hidden"
      style={{ height: BOTTOM_NAV_HEIGHT_PX }}
    />
  );
}
