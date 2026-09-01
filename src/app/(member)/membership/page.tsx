// Phase 2 Step 6 — the member-facing membership surface.
//
// A Subscription is to ONE weekly slot for ONE named skater, so this page is
// a list of slots rather than a pricing tier ladder. Plans come from
// listActivePlans(), which filters on active=true — an inactive plan is
// invisible here AND rejected by the subscribe route, so there is one switch
// rather than two places to keep in step.
//
// ⚠️ A subscriber is NOT yet auto-booked onto their sessions (Phase 2 Step 4,
// the Q5 build). Until that ships they appear on the staff register directly
// from their subscription and do not need to book. The copy below has to say
// so, because the whole value of subscribing is not booking each week.
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { listActivePlans } from "@/lib/membership";
import { describeSlot } from "@/lib/slot-describe";
import {
  SubscribePanel,
  type SubscribablePlan,
} from "@/components/membership/SubscribePanel";
import { ManageBillingButton } from "@/components/membership/ManageBillingButton";
import { FormNotice } from "@/components/ui/form";
import type { Participant, Membership } from "@/lib/types";

export const metadata: Metadata = { title: "Membership — Empowr Members" };
export const dynamic = "force-dynamic";

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");
  const { subscribed } = await searchParams;

  const service = createServiceClient();
  const [plans, participantsRes, membershipsRes, offeringsRes] = await Promise.all([
    listActivePlans(),
    service
      .from("mem_participants")
      .select("*")
      .eq("account_id", authed.account.id)
      .order("created_at", { ascending: true }),
    service
      .from("mem_memberships")
      .select("*")
      .eq("account_id", authed.account.id)
      .in("status", ["active", "past_due"]),
    service.from("mem_offerings").select("id, title"),
  ]);

  const participants = (participantsRes.data ?? []) as Participant[];
  const memberships = (membershipsRes.data ?? []) as Membership[];
  const offeringTitles = new Map(
    (offeringsRes.data ?? []).map((o) => [o.id as string, o.title as string])
  );
  const planNames = new Map(plans.map((p) => [p.id, p.name]));
  const participantNames = new Map(participants.map((p) => [p.id, p.name]));

  const subscribable: SubscribablePlan[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    price_pence: plan.price_pence,
    covers: plan.slots
      .map((s) => describeSlot(s, offeringTitles.get(s.offering_id)))
      .join(" · "),
    subscribedParticipantIds: memberships
      .filter((m) => m.plan_id === plan.id && m.participant_id)
      .map((m) => m.participant_id as string),
  }));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Membership
        </h1>
        <p className="mt-1 text-mid">
          Subscribe to a weekly session and stop paying for it each time.
        </p>
      </div>

      {subscribed && (
        <FormNotice tone="success">
          Your subscription is set up. Your place is held every week — just
          turn up, you do not need to book.
        </FormNotice>
      )}

      {memberships.length > 0 && (
        <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-extrabold text-black">
            Your subscriptions
          </h2>
          <ul className="mt-4 space-y-3">
            {memberships.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-extrabold text-black">
                    {planNames.get(m.plan_id) ?? "Subscription"}
                  </p>
                  <p className="text-sm text-mid">
                    {(m.participant_id &&
                      participantNames.get(m.participant_id)) ||
                      "Household member"}
                  </p>
                </div>
                {m.status === "past_due" ? (
                  <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                    Payment failed — update your card
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-extrabold text-blue-dark">
                    Active
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <ManageBillingButton />
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">
          {memberships.length > 0
            ? "Subscribe to another session"
            : "Choose a session"}
        </h2>
        <p className="mt-1 text-sm text-mid">
          Each subscription covers one skater at one weekly session. A child
          who attends two different sessions needs a subscription for each.
        </p>
        <div className="mt-5">
          {plans.length === 0 ? (
            <p className="text-sm text-mid">
              No subscriptions are open at the moment.
            </p>
          ) : (
            <SubscribePanel plans={subscribable} participants={participants} />
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-blue-pale p-6 sm:p-8">
        <h2 className="text-lg font-extrabold text-blue-dark">
          How it works once you subscribe
        </h2>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-blue-dark">
          <li>
            Your place is held every week — you do not need to book each
            session.
          </li>
          <li>
            You will be on the register when you arrive. Just check in with a
            member of staff.
          </li>
          <li>
            Make sure the waiver is signed for whoever the subscription
            covers, or they cannot take part.
          </li>
          <li>Cancel any time using Manage or cancel above.</li>
        </ul>
      </section>
    </main>
  );
}
