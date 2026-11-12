import Image from "next/image";
import { shopOrdersEnabled } from "@/lib/shop-orders-server";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { AccountMenu } from "@/components/AccountMenu";
import { BasketAnnouncement } from "@/components/BasketAnnouncement";
import { BasketNavLink } from "@/components/booking/BasketNavLink";
import { MessagesNavLink } from "@/components/messaging/MessagesNavLink";

// One header for the member-facing app, public catalogue included.
//
// /sessions previously rendered its own PublicHeader with a different set
// of links, so a signed-in member tapping "Sessions" landed on what felt
// like a different site: no Bookings link, no menu button, no wordmark.
// The links are identical everywhere now; only the auth action differs,
// and that resolves client-side so this stays statically rendered.
//
// "Sessions" is not in the nav (2026-11-02). From 2026-09-08 it pointed
// off-site to EELA, which confused signed-in members trying to book: they
// landed on another site with no sign of their bookings. Booking now starts
// from the "Book a session" button and "Book again" list on /bookings, both
// into the in-app /sessions catalogue (as the basket's "Add another
// booking" links already did). EELA stays the public front door.
//
// "Basket" is NOT in this list. It is an icon in the bar below, outside the
// collapsing nav, because this row does not render at all under 1024px.
//
// Desktop layout since 2026-11-02: the row carries only what members reach
// for (Book a session, Bookings, Notifications, Basket); account details,
// subscription, Help and sign out live in the "My account" dropdown.
const LINKS = [
  { href: "/sessions", label: "Book a session" },
  { href: "/bookings", label: "Bookings" },
];

export function SiteHeader() {
  return (
    // A FRAGMENT, and the announcement is the header's SIBLING rather than
    // its child. That is what makes the sticky below work at all: a sticky
    // element can only travel within its PARENT's box, so the first attempt
    // — `lg:sticky` on a div inside <header> — could only move within the
    // header's own height, which is to say not at all. It measured exactly
    // as unsticky as before. The header's parent is now the layout's flex
    // column, which spans the page.
    //
    // Keeping the announcement outside is ALSO what lets it stick on its
    // own terms. It is sticky too now (owner, 2026-09-16 — it must stay
    // visible until dismissed), but at a different offset per breakpoint:
    // 0 below lg where this header does not stick, and the header's measured
    // height above lg so it pins directly beneath rather than behind it.
    // Wrapping the two in one sticky div would break that — a sticky element
    // can only travel within its parent's box, which is the same trap
    // recorded just above — and would pin the wordmark bar on phones as well.
    //
    // BasketAnnouncement MEASURES this header via previousElementSibling, so
    // it must remain the immediately following sibling. Anything inserted
    // between the two silently changes what gets measured.
    //
    // `relative` anchors the collapsed menu panel. (SiteHeader passes
    // showTrigger={false} so it renders no panel of its own; the admin console
    // has its own drawer in AdminShell since 2026-09-28.)
    <>
      {/* STICKY AT lg AND UP, and only there — measured, not assumed. At
          1366px the header scrolled away at 858px and took EVERY nav link
          with it, the basket badge included: a desktop member had no
          navigation at all past the first screen, while a touch member kept
          the fixed bottom bar. Sticking it restores the symmetry.

          Below lg it deliberately does NOT stick. The header there is the
          wordmark alone — BottomNav carries the nav — so pinning it would
          spend ~76px of a phone screen on a logo, on top of the 60px bar
          already pinned at the other end. */}
      <header className="relative border-b border-line bg-warm-white lg:sticky lg:top-0 lg:z-40">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          {/* "Members", not "Empowr Members". logo.png is the full Empowr
            lockup — the eye mark with the word "Empowr®" set beneath it — so
            the old wordmark read "Empowr Empowr Members".

            `items-end` with the small nudge below sets this text on the same
            line as the logo's OWN "Empowr", rather than centring it against
            the whole square and leaving it floating above that word. The
            offset is tuned to this artwork: the wordmark sits in the lower
            third of a 1080px-square image, so it does not follow from any
            rule and a new logo file means re-tuning it. */}
          <Link href="/" className="flex min-w-0 items-end gap-2">
            <Image
              src="/logo.png"
              alt="Empowr CIC"
              width={140}
              height={140}
              className="h-auto w-[44px] shrink-0"
            />
            <span className="truncate translate-y-[-5px] text-lg font-black tracking-tight text-black">
              Members
            </span>
          </Link>
          {/* Below 1024px this whole group is EMPTY: BottomNav owns the
            touch nav, and the bell, basket and account menu each render only
            at lg. The header on a phone or a portrait tablet is the wordmark
            alone. "My account" sits last, at the far right, where an account
            menu is looked for. */}
          <div className="hidden shrink-0 items-center gap-5 text-sm font-bold whitespace-nowrap text-mid lg:flex">
            <nav aria-label="Main" className="flex items-center gap-5">
              {LINKS.map((link) => (
                <NavLink key={link.href} href={link.href}>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <MessagesNavLink />
            <BasketNavLink />
            <AccountMenu shopOrders={shopOrdersEnabled()} />
          </div>
        </div>
      </header>
      <BasketAnnouncement />
    </>
  );
}
