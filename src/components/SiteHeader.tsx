import Image from "next/image";
import Link from "next/link";
import { CollapsibleNav } from "@/components/CollapsibleNav";
import { BasketAnnouncement } from "@/components/BasketAnnouncement";
import { BasketNavLink } from "@/components/booking/BasketNavLink";

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
// collapsing nav, because this row does not render at all under 640px.
const LINKS = [
  { href: "https://eela.empowrcic.org", label: "Sessions" },
  { href: "/bookings", label: "Bookings" },
  { href: "/account", label: "Account" },
];

export function SiteHeader() {
  return (
    // `relative` anchors the collapsed menu panel.
    <header className="relative border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px] shrink-0"
          />
          <span className="truncate text-lg font-black tracking-tight text-black">
            Empowr Members
          </span>
        </Link>
        {/* The basket sits LAST — far right of the bar, after the links and
            the auth action, which is where a basket is looked for.
            `sm:gap-5` matches the nav row's own gap so it reads as the final
            item of an evenly spaced row rather than crammed against "Sign
            in".

            Below 640px this whole group is empty: `showTrigger={false}`
            drops the hamburger because BottomNav owns the mobile menu, and
            BasketNavLink is itself `hidden sm:flex` because the bar has a
            basket tab. The header on a phone is the wordmark alone. */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-5">
          <CollapsibleNav links={LINKS} menuId="site-menu" showTrigger={false} />
          <BasketNavLink />
        </div>
      </div>
      <BasketAnnouncement />
    </header>
  );
}
