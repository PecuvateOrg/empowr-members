// Where a door payment for extra skaters lands. The payer may have no
// account and is standing at the door, so this only says what happens next.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment — Empowr Members" };

export default async function PrivateAddedPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { cancelled } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">
        {cancelled ? "Payment not taken" : "Thank you — payment received"}
      </h1>
      <p className="mt-4 text-mid">
        {cancelled
          ? "Nothing was charged. Let the team know if you'd still like to add skaters."
          : "Show this screen to the team. The extra places are added to the booking within a minute."}
      </p>
    </main>
  );
}
