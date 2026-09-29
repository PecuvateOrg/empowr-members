import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { getAuthedAccount } from "@/lib/auth";
import { listBookingParticipants } from "@/lib/booking";
import { TIMEZONE } from "@/lib/business-rules";
import { links } from "@/lib/links";
import {
  ONLINE_KINDS,
  PRIVATE_TERMS,
  TYPE_PARAM,
  parsePrivateDraft,
  type OnlineKind,
} from "@/lib/private-bookings";
import { listPrivateAvailability, listPrivateTypes } from "@/lib/private-bookings-server";
import { PrivateBookingForm } from "@/components/private-bookings/PrivateBookingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Private bookings — Empowr Members" };

// How far ahead the date picker looks. Bookings open 14 days out (KB).
const LOOKAHEAD_DAYS = 120;

export default async function PrivateBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const requested = params.type ? TYPE_PARAM[params.type] : undefined;

  // Anyone can choose a booking and see its price; signing in is asked for
  // only when they press Book (owner decision 2026-09-29). Nothing is held
  // until payment starts, and that API route requires a session, so an
  // anonymous visitor still cannot lock out a Saturday.
  const authed = await getAuthedAccount();

  // `null` means the private-bookings schema is not applied yet. For a
  // customer that is the same outcome as no bookable type: there is nothing to
  // book, so the "opening soon" card below is the honest answer either way.
  // The distinction only matters to staff, and it is drawn on /admin.
  const types = ((await listPrivateTypes()) ?? []).filter(
    (t): t is typeof t & { kind: OnlineKind } =>
      t.active && (ONLINE_KINDS as readonly string[]).includes(t.kind)
  );

  if (types.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight text-black">Private bookings</h1>
        <div className="mt-6 rounded-2xl bg-card p-6 shadow-sm">
          <p className="font-bold text-black">Online private booking is opening soon.</p>
          <p className="mt-2 text-sm text-mid">
            In the meantime, get in touch and we’ll arrange your party or coaching session with you.
          </p>
          <a
            href={`${links.mainSite}/contact?source=private-bookings`}
            className="mt-4 inline-flex rounded-full bg-blue px-6 py-3 font-extrabold text-white"
          >
            Contact Empowr
          </a>
        </div>
      </main>
    );
  }

  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const until = formatInTimeZone(
    new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000),
    TIMEZONE,
    "yyyy-MM-dd"
  );
  const [slots, participants] = await Promise.all([
    listPrivateAvailability(today, until),
    authed
      ? listBookingParticipants(
          { id: authed.account.id, email: authed.user.email ?? "" },
          { age_min: null, age_max: null },
          new Date()
        )
      : Promise.resolve([]),
  ]);

  const initialKind =
    requested && types.some((t) => t.kind === requested) ? requested : types[0].kind;
  // Choices carried through sign-in. Only a draft for the kind being shown is
  // used; the form re-checks the date against live availability.
  const draft = parsePrivateDraft(params);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">Book a private session</h1>
      <p className="mt-2 text-mid">
        The Ladywell Centre, Saturdays 3–5pm. Bookings open at least two weeks ahead.
      </p>

      <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <PrivateBookingForm
          types={types}
          slots={slots}
          participants={participants.map((p) => ({
            id: p.id,
            name: p.name,
            waiverSigned: p.waiverSigned,
          }))}
          initialKind={initialKind}
          signedIn={!!authed}
          draft={draft?.kind === initialKind ? draft : null}
        />
      </section>

      <p className="mt-6 text-sm text-mid">{PRIVATE_TERMS}</p>
    </main>
  );
}
