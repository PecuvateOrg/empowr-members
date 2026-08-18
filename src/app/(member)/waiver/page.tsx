import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import { checkWaivers } from "@/lib/waivers";
import { ageOn } from "@/lib/age";
import type { Participant } from "@/lib/types";
import { WaiverForm } from "@/components/waiver/WaiverForm";

export const metadata: Metadata = { title: "Waiver — Empowr Members" };

export default async function WaiverPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("mem_participants")
    .select("*")
    .eq("account_id", authed.account.id)
    .order("created_at", { ascending: true });
  const participants = (data ?? []) as Participant[];

  // Show current cover so the form can default to only those who need it,
  // rather than asking people to re-sign for everyone every time.
  const statuses = await checkWaivers(authed.user.email ?? "", participants);
  const signedIds = new Set(
    statuses.filter((s) => s.signed).map((s) => s.participantId)
  );

  // Seed the emergency contact from whichever participant already has one
  // — the account usually holds this already from household setup.
  const existingContact = participants.find(
    (p) => p.emergency_contact_name && p.emergency_contact_phone
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Risk waiver and consent
        </h1>
        <p className="mt-1 text-mid">
          Everyone who takes part needs a waiver on file before they can be
          booked onto a session. You only need to do this once for each person.
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
            defaultEmergencyContact={{
              name: existingContact?.emergency_contact_name ?? "",
              phone: existingContact?.emergency_contact_phone ?? "",
            }}
          />
        </div>
      )}
    </main>
  );
}
