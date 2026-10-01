// Private bookings in the next week, for the door's landing page. Door staff
// cannot open /admin, so this is their way into a party's check-in.
//
// A failed read renders a visible error rather than an empty list: "no
// parties" when there is one would send staff to the door without a register.
// PGRST205 means the private-bookings schema is not applied yet, i.e. there
// genuinely are none.
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { KIND_LABELS, formatPrivateSlot, type PrivateKind } from "@/lib/private-bookings";

export async function PrivateBookingsUpcoming() {
  const { data, error } = await createServiceClient()
    .from("mem_private_bookings")
    .select("id, kind, starts_at, ends_at, total_places, host:mem_accounts(name), places:mem_private_booking_places(count)")
    .eq("status", "confirmed")
    .neq("kind", "block")
    .gte("ends_at", new Date().toISOString())
    .lte("starts_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("starts_at");

  if (error && error.code === "PGRST205") return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <PartyPopper className="h-5 w-5 text-blue" aria-hidden /> Private bookings this week
      </h2>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-soft px-4 py-3 text-sm font-bold text-red-dark">
          Private bookings could not be loaded. Refresh before relying on this list.
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="mt-3 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No private bookings in the next seven days.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {(data ?? []).map((b) => {
            const host = b.host as unknown as { name: string } | null;
            const places = b.places as unknown as { count: number }[];
            return (
              <li key={b.id}>
                <Link
                  href={`/checkin/private/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
                >
                  <div>
                    <p className="font-extrabold text-black">
                      {KIND_LABELS[b.kind as PrivateKind]} — {host?.name || "(no name)"}
                    </p>
                    <p className="text-sm font-semibold text-mid">{formatPrivateSlot(b.starts_at, b.ends_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-mid">
                    {places[0]?.count ?? 0} / {b.total_places}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
