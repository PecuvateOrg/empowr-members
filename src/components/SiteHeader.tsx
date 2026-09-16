import Image from "next/image";
import Link from "next/link";
import { CollapsibleNav } from "@/components/CollapsibleNav";
import { BasketAnnouncement } from "@/components/BasketAnnouncement";
import { BasketNavLink } from "@/components/booking/BasketNavLink";
import { links } from "@/lib/links";

// One header for the member-facing app, public catalogue included.
//
// /sessions previously rendered its own PublicHeader with a different set
// of links, so a signed-in member tapping "Sessions" landed on what felt
// like a different site: no Bookings link, no menu button, no wordmark.
// The links are identical everywhere now; only the auth action differs,
// and that resolves client-side so this stays statically rendered.
//
// "Sessions" points off-site to EELA (2026-09-08): EELA is the discovery
// home for all sessions/programme content, Members exists to manage
// bookings you've already made. The /sessions catalogue route stays out of
// this nav — old links and bookmarks into it still resolve. It is no longer
// true that *nothing* in the app points there: from 2026-09-15 the basket's
// "Add another booking" links do, on purpose. A member mid-checkout is
// transacting, not browsing, and should not be sent to another site to add
// one more booking (see BasketClient).
//
// "Basket" is NOT in this list. It is an icon in the bar below, outside the
// collapsing nav, because this row does not render at all under 1024px.
const LINKS = [
  { href: links.eela, label: "Sessions" },
  { href: "/bookings", label: "Bookings" },
  { href: "/account", label: "Account" },
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
    // showTrigger={false} so it renders no panel of its own, but AdminHeader
    // shares CollapsibleNav and does.)
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
          {/* The basket sits LAST — far right of the bar, after the links and
            the auth action, which is where a basket is looked for. The gap
            matches the nav row's own so it reads as the final item of an
            evenly spaced row rather than crammed against "Sign in".

            Below 1024px this whole group is EMPTY. `showTrigger={false}`
            drops the hamburger because BottomNav owns the touch menu, and
            BasketNavLink only appears at the same breakpoint because the bar
            carries a basket tab below it. The header on a phone or a tablet
            in portrait is the wordmark alone. */}
          <div className="flex shrink-0 items-center gap-1 lg:gap-5">
            <CollapsibleNav
              links={LINKS}
              menuId="site-menu"
              breakpoint="lg"
              showTrigger={false}
            />
            <BasketNavLink />
          </div>
        </div>
      </header>
      <BasketAnnouncement />
    </>
  );
}
