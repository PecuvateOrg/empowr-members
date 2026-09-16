"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, MapPin, ShieldCheck, ShoppingBasket, Trash2 } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import {
  basketPlaces,
  basketTotal,
  readBasket,
  rememberBasketCheckout,
  toCheckoutItem,
  writeBasket,
  type BookingBasketItem,
} from "@/lib/booking-basket";
import {
  describeBasketFailure,
  GENERIC_BASKET_FAILURE,
  type BasketFailure,
} from "@/lib/basket-failure";
import { formatPrice } from "@/lib/format";
import { links } from "@/lib/links";

export function BasketClient({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<BookingBasketItem[] | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  // A structured failure, not a string. This is the only checkout a member
  // has since the booking form's "pay now" button went, so a refusal here
  // has to name who is blocking it, point at the fix, and say which card —
  // see basket-failure.ts.
  const [failure, setFailure] = useState<BasketFailure | null>(null);

  useEffect(() => setItems(readBasket(accountId)), [accountId]);

  function remove(key: string) {
    if (!items) return;
    const next = items.filter((item) => item.key !== key);
    writeBasket(accountId, next);
    setItems(next);
    // Removing a card can be the fix for the failure on screen, and a stale
    // outline would then point at a booking that is no longer there.
    setFailure(null);
  }

  async function checkout() {
    if (!items?.length) return;
    setCheckingOut(true);
    setFailure(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(toCheckoutItem) }),
      });
      const body = await response.json().catch(() => ({}));
      if (
        response.status === 201 &&
        typeof body.checkout_url === "string" &&
        typeof body.checkout_session_id === "string"
      ) {
        rememberBasketCheckout(
          accountId,
          body.checkout_session_id,
          items.map((item) => item.key)
        );
        window.location.assign(body.checkout_url);
        return;
      }

      setFailure(describeBasketFailure(body, items));
    } catch {
      setFailure({
        message: GENERIC_BASKET_FAILURE,
        fix: null,
        bookingKey: null,
      });
    } finally {
      setCheckingOut(false);
    }
  }

  if (items === null) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center shadow-sm" role="status">
        <p className="font-bold text-mid">Loading your basket…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
        <ShoppingBasket className="mx-auto h-10 w-10 text-blue" aria-hidden />
        <h2 className="mt-3 text-xl font-extrabold text-black">Your basket is empty</h2>
        <p className="mx-auto mt-2 max-w-md font-semibold text-mid">
          Choose a session and select who is coming. You can add several bookings before paying once.
        </p>
        <Link
          href={links.eela}
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
        >
          Browse sessions
        </Link>
      </div>
    );
  }

  const places = basketPlaces(items);
  const total = basketTotal(items);

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {items.map((item) => (
          <article
            key={item.key}
            // Outlined when the server could say THIS card is the problem.
            // "Edit that booking" is meaningless in a basket of ten without
            // it, which is half of why the old messages were a dead end.
            className={`rounded-2xl bg-card p-5 shadow-sm sm:p-6 ${
              failure?.bookingKey === item.key
                ? "ring-2 ring-red-dark"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-black">{item.offeringTitle}</h2>
                <p className="mt-2 flex items-start gap-2 text-sm font-bold text-mid">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden />
                  {item.when}
                </p>
                {item.venue && (
                  <p className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-mid">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden />
                    {item.venue}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(item.key)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-soft hover:text-red-dark"
                aria-label={`Remove ${item.offeringTitle} from basket`}
              >
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-4 border-t border-line pt-4 sm:flex sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Who is coming</p>
                <p className="mt-1 font-bold text-black">{item.participantNames.join(", ")}</p>
                {item.early_bird && (
                  <p className="mt-1 text-sm font-bold text-blue-dark">Early bird ticket</p>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 sm:mt-0 sm:block sm:text-right">
                <Link href={item.bookingPath} className="text-sm font-extrabold text-blue underline">
                  Edit
                </Link>
                <p className="font-black text-black sm:mt-1">
                  {formatPrice(item.unitPricePence * item.participant_ids.length)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {failure && (
        <FormNotice tone="error">
          <span className="block">{failure.message}</span>
          {failure.fix && (
            <Link
              href={failure.fix.href}
              className="mt-1 inline-flex min-h-11 items-center font-extrabold underline underline-offset-2"
            >
              {failure.fix.label}
            </Link>
          )}
        </FormNotice>
      )}

      <aside className="rounded-2xl bg-blue-pale p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue" aria-hidden />
          <p className="text-sm font-semibold text-blue-dark">
            Spaces are checked and held together when you continue. If any booking is unavailable, none are held and you are not charged.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-blue/15 pt-5">
          <div>
            <p className="text-sm font-bold text-mid">
              {items.length} {items.length === 1 ? "booking" : "bookings"} · {places} {places === 1 ? "place" : "places"}
            </p>
            <p className="text-2xl font-black text-black">{formatPrice(total)}</p>
          </div>
          <Button onClick={checkout} disabled={checkingOut}>
            {checkingOut ? "Checking spaces…" : "Continue to payment"}
          </Button>
        </div>
      </aside>

      {/* Internal, not EELA: once there's something in the basket the member
       *  is mid-checkout, not browsing — keep them in the app they're
       *  already transacting in rather than bouncing them to another site. */}
      <Link href="/sessions" className="inline-flex min-h-11 items-center font-extrabold text-blue underline">
        Add another booking
      </Link>
    </div>
  );
}
