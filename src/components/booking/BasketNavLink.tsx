"use client";

// The basket in the header bar — an icon, always visible.
//
// WHY IT SITS OUTSIDE `CollapsibleNav`. The nav row is `hidden sm:flex`, so
// below 640px nothing in `LINKS` renders at all — it is behind the hamburger.
// A basket the member cannot see is the opposite of the point, and a basket
// is a transaction in progress, not a section of the site. So it lives in the
// bar itself, at every width, and "Basket" was removed from `LINKS` rather
// than duplicated into it.
//
// The count is the number of BOOKINGS, matching the leading figure on the
// basket page's own summary ("2 bookings · 3 places"). A badge saying 2 next
// to a page saying 3 in the same flow is a bug report waiting to happen.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import {
  BOOKING_BASKET_EVENT,
  readLocalBasketCount,
} from "@/lib/booking-basket";

export function BasketNavLink() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const active = pathname === "/basket";

  useEffect(() => {
    const sync = () => setCount(readLocalBasketCount());
    sync();

    // Both events, deliberately. `writeBasket` dispatches the CustomEvent for
    // this window; the `storage` event covers the OTHER tabs and does not
    // fire in the tab that wrote. Two tabs is a real pattern here — the
    // basket checkout has a `basket_changed` 409 for exactly that race — so
    // one subscription would leave a stale number on the tab not in focus.
    window.addEventListener(BOOKING_BASKET_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BOOKING_BASKET_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [pathname]);

  return (
    <Link
      href="/basket"
      aria-current={active ? "page" : undefined}
      // The icon carries no text, so the link needs its own name — the
      // active-section underline `NavLink` used to provide is gone with it.
      aria-label={
        count === null
          ? "Basket"
          : `Basket, ${count} ${count === 1 ? "booking" : "bookings"}`
      }
      className={`relative -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active ? "text-blue" : "text-mid hover:text-blue"
      }`}
    >
      <ShoppingBasket className="h-6 w-6" aria-hidden />
      {count !== null && count > 0 && (
        <span
          aria-hidden
          className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue px-1 text-[11px] font-black leading-none text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
