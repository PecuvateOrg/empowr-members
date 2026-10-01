import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { KIND_LABELS, formatPrivateSlot, type PrivateKind } from "@/lib/private-bookings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Private booking — Empowr Members" };

// Stripe returns here as soon as the card clears, which can be moments before
// the webhook confirms the booking. "Pending" is therefore an expected state,
// shown as such rather than as a failure.
export default async function PrivateConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login?next=/bookings");

  const { data: booking, error } = sessionId
    ? await createServiceClient()
        .from("mem_private_bookings")
        .select("id, kind, status, starts_at, ends_at")
        .eq("stripe_checkout_session_id", sessionId)
        .eq("host_account_id", authed.account.id)
        .maybeSingle()
    : { data: null, error: null };
  if (error) console.error("private confirmation page read failed", sessionId, error);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        {!booking ? (
          <>
            <h1 className="text-2xl font-black text-black">We couldn’t find that booking</h1>
            <p className="mt-2 text-mid">
              If you’ve just paid, your confirmation email will arrive shortly.
            </p>
          </>
        ) : booking.status === "confirmed" ? (
          <>
            <h1 className="text-2xl font-black text-black">You’re booked</h1>
            <p className="mt-2 text-mid">
              {KIND_LABELS[booking.kind as PrivateKind]}, {formatPrivateSlot(booking.starts_at, booking.ends_at)}.
              A confirmation email is on its way.
            </p>
            <Link
              href={`/private-bookings/${booking.id}`}
              className="mt-5 inline-flex rounded-full bg-blue px-6 py-3 font-extrabold text-white"
            >
              View your booking
            </Link>
          </>
        ) : booking.status === "pending_payment" ? (
          <>
            <h1 className="text-2xl font-black text-black">Confirming your payment…</h1>
            <p className="mt-2 text-mid">
              This usually takes a few seconds. Refresh this page, or wait for your confirmation email.
            </p>
            <Link
              href={`/private-bookings/confirmation?session_id=${encodeURIComponent(sessionId ?? "")}`}
              className="mt-5 inline-flex rounded-full border border-line px-6 py-3 font-extrabold text-black"
            >
              Refresh
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-black">This booking didn’t go through</h1>
            <p className="mt-2 text-mid">
              The time was released before payment completed. If you were charged, contact us and
              we’ll sort it out straight away.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
