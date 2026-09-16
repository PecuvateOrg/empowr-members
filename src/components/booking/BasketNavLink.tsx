"use client";

// The basket, in two shapes: a bare icon at the far right of the desktop
// header (`BasketNavLink`), and an icon-over-label tab in the touch bottom
// bar (`BasketTabIcon`). They share `useBasketCount`, so the two can never
// disagree about what is in the basket.
//
// WHY IT SITS OUTSIDE `CollapsibleNav`. The header nav row is `hidden
// lg:flex`, so below 1024px nothing in `LINKS` renders at all. A basket the
// member cannot see is the opposite of the point, and a basket is a
// transaction in progress, not a section of the site — so "Basket" was
// removed from `LINKS` rather than duplicated into it, and below the
// breakpoint BottomNav carries it as one of three tabs.
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

/** The count, kept live. Shared by the header icon and the mobile bottom
 *  tab so the two can never disagree about what is in the basket. */
export function useBasketCount(): number | null {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

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

  return count;
}

/** The icon needs its own accessible name — it carries no text, and the
 *  active-section underline `NavLink` used to provide went with the label. */
export function basketLabel(count: number | null): string {
  return count === null
    ? "Basket"
    : `Basket, ${count} ${count === 1 ? "booking" : "bookings"}`;
}

/** The bottom bar's basket tab: same count, laid out as an icon-over-label
 *  tab rather than a bare icon, so it matches Menu and Account beside it. */
export function BasketTabIcon({ className }: { className: string }) {
  const count = useBasketCount();
  const pathname = usePathname();

  return (
    <Link
      href="/basket"
      aria-current={pathname === "/basket" ? "page" : undefined}
      aria-label={basketLabel(count)}
      className={className}
    >
      <span className="relative">
        <ShoppingBasket className="h-6 w-6" aria-hidden />
        {count !== null && count > 0 && (
          <span
            aria-hidden
            className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue px-1 text-[11px] font-black leading-none text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      Basket
    </Link>
  );
}

export function BasketNavLink() {
  const pathname = usePathname();
  const count = useBasketCount();
  const active = pathname === "/basket";

  return (
    <Link
      href="/basket"
      aria-current={active ? "page" : undefined}
      aria-label={basketLabel(count)}
      className={`relative -mr-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors lg:flex ${
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
