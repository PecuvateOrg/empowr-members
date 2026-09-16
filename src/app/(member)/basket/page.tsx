import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthedAccount } from "@/lib/auth";
import { BasketClient } from "@/components/booking/BasketClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your basket — Empowr Members" };

export default async function BasketPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login?next=/basket");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">Your basket</h1>
      <p className="mt-2 max-w-2xl font-semibold text-mid">
        Review your bookings, then pay for them together in one secure checkout.
      </p>
      <div className="mt-6">
        <BasketClient accountId={authed.account.id} />
      </div>
    </main>
  );
}
