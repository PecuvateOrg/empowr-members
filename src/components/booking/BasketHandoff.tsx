"use client";

// What a member sees the moment a booking lands in their basket.
//
// THIS REPLACED A SENTENCE WITH A LINK IN IT. The old confirmation was a
// success notice reading "Added to your basket" with "View basket" underlined
// inside the prose — and the owner, testing the flow, did not see it
// (2026-09-16). That was survivable while "Book and pay now" sat directly
// below as an obvious way to finish. With that button gone the basket is the
// only route to payment, so the way through cannot be a link inside a
// sentence: it has to be the biggest thing on the screen at that moment.
//
// It is a separate component rather than more JSX inside BookingForm because
// it is the whole of the hand-off between two flows — choosing people, and
// paying — and because swapping it out is then deleting one tag.
//
// THE COUNTS ARE READ LIVE, NOT PASSED IN. The first version took them as
// props, computed once from what upsertBasketItem() returned. That froze
// them: remove a card in a second tab, or on the basket page behind this
// one, and this block would still be claiming two bookings while the nav
// badge beside it said one. Both numbers describe the same basket, and two
// numbers disagreeing on one screen at a checkout is the exact class of bug
// this whole change exists to remove. So it subscribes to the same pair of
// events useBasketCount() does — the CustomEvent for this window, `storage`
// for the others, which does not fire in the tab that wrote.
//
// It shows the basket's WHOLE contents, not just this booking. A member who
// has added three sessions needs to see three; showing only what they just
// did is how the other two stay forgotten, which is the failure the pay-now
// button used to cause.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import {
  BOOKING_BASKET_EVENT,
  basketPlaces,
  readBasket,
} from "@/lib/booking-basket";

type Summary = { bookings: number; places: number };

function useLiveBasketSummary(accountId: string): Summary | null {
  // Null until the first read: localStorage is not available during the
  // server render, and rendering a confident "0 bookings" for a frame is
  // worse than rendering nothing.
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const sync = () => {
      const items = readBasket(accountId);
      setSummary({ bookings: items.length, places: basketPlaces(items) });
    };
    sync();
    window.addEventListener(BOOKING_BASKET_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BOOKING_BASKET_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [accountId]);

  return summary;
}

export function BasketHandoff({ accountId }: { accountId: string }) {
  const summary = useLiveBasketSummary(accountId);

  // Nothing to hand off to. Reachable for real: empty the basket in another
  // tab while this is on screen, and "Added to your basket · 0 bookings" is
  // what the frozen version would have said.
  if (!summary || summary.bookings === 0) return null;

  const { bookings, places } = summary;

  return (
    // role="status" so a screen reader announces this when it appears — it is
    // the entire feedback for pressing the button, and a silent change to the
    // page below the fold is no feedback at all.
    <div
      role="status"
      className="rounded-2xl border border-blue/20 bg-blue-pale p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <ShoppingBasket className="mt-0.5 h-5 w-5 shrink-0 text-blue" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-black">Added to your basket</p>
          {/* "bookings" leads, matching the nav badge's own wording and the
              basket page's summary line. Three surfaces, one phrasing. */}
          <p className="mt-1 text-sm font-semibold text-blue-dark">
            Your basket holds {bookings}{" "}
            {bookings === 1 ? "booking" : "bookings"} · {places}{" "}
            {places === 1 ? "place" : "places"}. No space is held until you
            pay.
          </p>
        </div>
      </div>

      {/* The basket is the ONLY way to pay, so it is the primary action and
          it is a button, not a link in a sentence. "Add another booking"
          stays secondary: most members are buying one thing. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/basket"
          className="inline-flex min-h-11 items-center rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors duration-200 hover:bg-blue-dark"
        >
          Go to basket and pay
        </Link>
        {/* Internal, not EELA: a member mid-checkout is transacting, not
            browsing, and should not be sent to another site to add one more
            booking. Same reasoning as the basket page's own link. */}
        <Link
          href="/sessions"
          className="inline-flex min-h-11 items-center font-extrabold text-blue underline underline-offset-2 hover:text-blue-dark"
        >
          Add another booking
        </Link>
      </div>
    </div>
  );
}
