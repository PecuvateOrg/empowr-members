import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import { checkWaivers } from "@/lib/waivers";
import { ageOn } from "@/lib/age";
import type { Participant } from "@/lib/types";
import { WaiverForm } from "@/components/waiver/WaiverForm";
import { safeWaiverReturn } from "@/lib/waiver-return";
import { firstEmergencyContact } from "@/lib/ec-relationships";

export const metadata: Metadata = { title: "Waiver — Empowr Members" };

export default async function WaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");
  // The page the member came from (usually a session they were booking),
  // so the success screen can send them straight back to it.
  const returnTo = safeWaiverReturn((await searchParams).returnTo);

  const supabase = await createClient();
  // Failing quietly here would present an empty waiver form — nobody to
  // sign for — which reads as "there is nothing to do" on the one page
  // that gates every first booking.
  const { data, error } = await supabase
    .from("mem_participants")
    .select("*")
    .eq("account_id", authed.account.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("waiver participants read failed", authed.account.id, error);
    throw new Error("participants_read_failed");
  }
  const participants = (data ?? []) as Participant[];

  // Show current cover so the form can default to only those who need it,
  // rather than asking people to re-sign for everyone every time.
  const statuses = await checkWaivers(authed.user.email ?? "", participants);
  const signedIds = new Set(
    statuses.filter((s) => s.signed).map((s) => s.participantId)
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Risk waiver and consent
        </h1>
        <p className="mt-1 text-mid">
          Everyone who takes part needs a waiver on file before they can be
          booked onto a session. Each waiver lasts a year, so you only need to do
          this once a year for each person.
        </p>
      </div>

      {participants.length === 0 ? (
        <div className="rounded-xl bg-blue-pale px-4 py-4 text-sm font-semibold text-blue-dark">
          Add the people in your household first — then you can complete their
          waiver here.{" "}
          <Link href="/account" className="underline">
            Go to your account
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
          <WaiverForm
            participants={participants.map((p) => ({
              id: p.id,
              name: p.name,
              age: ageOn(p.dob),
              alreadySigned: signedIds.has(p.id),
            }))}
            returnTo={returnTo}
            // Seeded from household setup, which usually holds it already.
            defaultEmergencyContact={firstEmergencyContact(participants)}
          />
        </div>
      )}
    </main>
  );
}
