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
import { formatPrice } from "@/lib/format";

export function BasketClient({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<BookingBasketItem[] | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(readBasket(accountId)), [accountId]);

  function remove(key: string) {
    if (!items) return;
    const next = items.filter((item) => item.key !== key);
    writeBasket(accountId, next);
    setItems(next);
    setError(null);
  }

  async function checkout() {
    if (!items?.length) return;
    setCheckingOut(true);
    setError(null);
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

      const messages: Record<string, string> = {
        capacity: "One of these bookings no longer has enough spaces. Nothing has been charged or reserved.",
        duplicate: "Someone in your basket is already booked on one of these sessions.",
        age_ineligible: "A participant is no longer eligible for one of these sessions. Edit that booking before continuing.",
        waiver_required: "A participant needs a signed waiver before this basket can be booked.",
        already_covered: "A participant is already covered by a subscription for one of these sessions, so we will not charge them twice.",
        early_bird_gone: "An early bird ticket in your basket has sold out. Edit that booking and choose the standard ticket.",
        basket_changed: "Your basket changed since this page loaded — check it in another tab or window, then try again.",
      };
      setError(
        messages[body.error] ??
          (typeof body.error === "string" && body.error
            ? body.error
            : "We couldn't start payment. Your basket is still here — please try again.")
      );
    } catch {
      setError("We couldn't start payment. Your basket is still here — please try again.");
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
          href="/sessions"
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
          <article key={item.key} className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
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

      {error && <FormNotice tone="error">{error}</FormNotice>}

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

      <Link href="/sessions" className="inline-flex min-h-11 items-center font-extrabold text-blue underline">
        Add another booking
      </Link>
    </div>
  );
}
