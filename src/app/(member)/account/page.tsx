import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import type { Participant } from "@/lib/types";
import { ProfileForm } from "@/components/account/ProfileForm";
import { HouseholdManager } from "@/components/account/HouseholdManager";

export const metadata: Metadata = { title: "Your account — Empowr Members" };

export default async function AccountPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  const supabase = await createClient();
  const { data: participants } = await supabase
    .from("mem_participants")
    .select("*")
    .eq("account_id", authed.account.id)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Your account
        </h1>
        <p className="mt-1 text-mid">
          Your details and the people in your household who take part.
        </p>
      </div>

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">Your details</h2>
        <p className="mt-1 text-sm text-mid">
          Signed in as <strong>{authed.user.email}</strong>
        </p>
        <div className="mt-5">
          <ProfileForm account={authed.account} />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">Your household</h2>
        <p className="mt-1 text-sm text-mid">
          Add the people who take part in sessions — you&apos;ll pick from
          this list when booking. Age eligibility is worked out from date of
          birth.
        </p>
        <div className="mt-5">
          <HouseholdManager
            initialParticipants={(participants ?? []) as Participant[]}
          />
        </div>
      </section>
    </main>
  );
}
