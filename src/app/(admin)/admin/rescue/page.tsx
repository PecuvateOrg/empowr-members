// Admin → Restore a lost booking.
//
// Reachable by the whole door team (the (admin) layout gates on the check-in
// allowlist upstream), because whoever is standing in front of the member is
// who needs to fix it. Putting a session OVER capacity stays an administrator's
// decision and is enforced server-side, not by hiding the button.
import type { Metadata } from "next";
import { RescueForm } from "@/components/admin/RescueForm";

export const metadata: Metadata = {
  title: "Restore a lost booking — Members Admin",
};
export const dynamic = "force-dynamic";

export default function RescuePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Restore a lost booking
        </h1>
        <p className="mt-1 text-mid">
          For a member who paid but has no booking and is on no register.
        </p>
      </div>

      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <RescueForm />
      </div>

      <div className="space-y-3 text-sm text-mid">
        <h2 className="font-extrabold text-black">What this does</h2>
        <p>
          It checks with Stripe that the payment really exists, then gives the
          member back the place they paid for and emails them their ticket. It
          never takes or refunds money.
        </p>
        <p>
          If Stripe says the checkout was not paid, nothing happens — that is
          not a booking we lost. Use this only when a payment is genuinely
          showing in Stripe.
        </p>
        <p>
          If the member has already booked again themselves, you will be told
          so. Refund the duplicate payment rather than restoring this one, or
          they end up holding two places.
        </p>
      </div>
    </main>
  );
}
