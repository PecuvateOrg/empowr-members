import Link from "next/link";
import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { createServiceClient } from "@/lib/supabase/service";
import { TIMEZONE } from "@/lib/business-rules";
import { formatPrice } from "@/lib/format";
import {
  KIND_LABELS,
  PAYMENT_HANDLING_LABELS,
  formatPrivateSlot,
  type PaymentHandling,
  type PrivateKind,
} from "@/lib/private-bookings";
import { listPrivateTypes } from "@/lib/private-bookings-server";
import { PrivateManualBookingForm } from "@/components/admin/PrivateManualBookingForm";
import { PrivateBlockForm, UnblockButton } from "@/components/admin/PrivateBlockForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Private bookings — Empowr Admin" };

const FILTER_KINDS: PrivateKind[] = ["birthday", "coaching_one", "coaching_group", "custom", "block"];

type Row = {
  id: string;
  kind: PrivateKind;
  status: string;
  source: "online" | "manual";
  starts_at: string;
  ends_at: string;
  total_places: number;
  price_pence: number;
  payment_handling: PaymentHandling | null;
  note: string | null;
  host: { name: string } | null;
  places: { count: number }[];
};

export default async function AdminPrivateBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : "";
  const kind = FILTER_KINDS.includes(params.kind as PrivateKind) ? (params.kind as PrivateKind) : null;

  let query = createServiceClient()
    .from("mem_private_bookings")
    .select(
      "id, kind, status, source, starts_at, ends_at, total_places, price_pence, payment_handling, note, host:mem_accounts(name), places:mem_private_booking_places(count)"
    )
    .in("status", ["pending_payment", "confirmed"])
    .gte("starts_at", `${from}T00:00:00Z`)
    .order("starts_at")
    .limit(200);
  if (to) query = query.lte("starts_at", `${to}T23:59:59Z`);
  if (kind) query = query.eq("kind", kind);

  const [bookings, types] = await Promise.all([query, listPrivateTypes()]);

  // PGRST205 on either read means the private-bookings tables are not in the
  // database. Before the owner applies
  // planning/architecture/private-bookings-schema.sql that is the expected
  // state; afterwards it means a dropped table or a stale PostgREST schema
  // cache. Both reads are checked, because they hit two different tables.
  //
  // 🔑 It is SHOWN, never rendered as an empty range. The two forms below post
  // to those same absent tables, so offering them would take a booking Empowr
  // had already agreed with a customer and fail it on a generic "try again" —
  // and an empty list would read as "no parties booked", which is a statement
  // this page cannot make when it cannot see the table.
  const schemaMissing = types === null || bookings.error?.code === "PGRST205";
  if (bookings.error && bookings.error.code !== "PGRST205") {
    console.error("admin private bookings read failed", bookings.error);
    throw new Error("admin_private_bookings_read_failed");
  }
  const rows = (bookings.data ?? []) as unknown as Row[];

  if (schemaMissing) {
    return (
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight text-black">Private bookings</h1>
        <section role="alert" className="rounded-2xl bg-red-soft p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-red-dark">Private bookings are not set up yet</h2>
          <p className="mt-2 text-sm font-semibold text-red-dark">
            The private-bookings tables are not in the database, so nothing can be listed, recorded
            or blocked from this screen. Nothing has been lost — there is nowhere for a booking to
            be stored yet.
          </p>
          <p className="mt-2 text-sm font-semibold text-red-dark">
            If private bookings were working before now, tell a developer: it means the tables have
            stopped being visible to the app, not that the bookings are gone.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Private bookings</h1>
        <p className="mt-1 text-mid">
          Online and staff-entered bookings and blocks at the Ladywell Saturday 3–5pm slot.
          {(types ?? []).every((t) => !t.active) &&
            " Online booking is switched off for every type — only staff entries appear."}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 text-sm shadow-sm">
        <label className="flex flex-col gap-1 font-bold text-mid">
          Type
          <select name="kind" defaultValue={kind ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-black">
            <option value="">All</option>
            {FILTER_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          From
          <input type="date" name="from" defaultValue={from} className="rounded-xl border border-line bg-white px-3 py-2 text-black" />
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          To
          <input type="date" name="to" defaultValue={to} className="rounded-xl border border-line bg-white px-3 py-2 text-black" />
        </label>
        <button type="submit" className="rounded-full bg-blue px-5 py-2 font-extrabold text-white">Filter</button>
      </form>

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        {rows.length === 0 ? (
          <p className="text-mid">Nothing booked or blocked in this range.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-bold text-black">
                    {formatPrivateSlot(r.starts_at, r.ends_at)} · {KIND_LABELS[r.kind]}
                    {r.status === "pending_payment" && <span className="ml-2 font-normal text-mid">(awaiting payment)</span>}
                  </p>
                  <p className="text-mid">
                    {r.kind === "block"
                      ? r.note ?? "No reason given"
                      : [
                          r.host?.name || "(no name)",
                          `${r.places[0]?.count ?? 0} of ${r.total_places} registered`,
                          r.source === "online"
                            ? `paid ${formatPrice(r.price_pence)} online`
                            : `${PAYMENT_HANDLING_LABELS[r.payment_handling as PaymentHandling]} · ${formatPrice(r.price_pence)} (staff entry)`,
                        ].join(" · ")}
                  </p>
                </div>
                {r.kind === "block" ? (
                  <UnblockButton id={r.id} />
                ) : (
                  <Link href={`/checkin/private/${r.id}`} className="font-bold text-blue underline">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-black">Record an agreed booking</h2>
        <p className="mt-1 text-sm text-mid">
          For bookings already agreed by email or paid outside the app. The member is emailed their confirmation.
          Every entry records who made it and how it was paid.
        </p>
        <div className="mt-4">
          <PrivateManualBookingForm />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-black">Block a time</h2>
        <p className="mt-1 text-sm text-mid">
          Keeps a Saturday slot out of online booking — for example something in Empowr’s calendar that
          isn’t in this system. The reason is internal and never shown to customers.
        </p>
        <div className="mt-4">
          <PrivateBlockForm />
        </div>
      </section>
    </main>
  );
}
