import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { paidPartyToken } from "@/lib/paid-party-registration";
import { formatPrivateSlot } from "@/lib/private-bookings";
import { ClaimPaidParty } from "@/components/private-bookings/ClaimPaidParty";
import { HouseholdManager } from "@/components/account/HouseholdManager";
import { CopyLink } from "@/components/private-bookings/CopyLink";
import { membersUrl } from "@/lib/links";
import { checkWaivers } from "@/lib/waivers";
import type { Participant } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your paid birthday party", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function PaidPartySetup({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!paidPartyToken.safeParse(token).success) notFound();
  const authed = await getAuthedAccount();
  const next = encodeURIComponent(`/private-bookings/setup/${token}`);
  if (!authed) return <main className="mx-auto max-w-2xl space-y-5 px-4 py-10"><h1 className="text-3xl font-black">Set up your paid birthday party</h1>
    <p>Your party has already been paid for. Create a free account using the email you gave Empowr, or sign in, to add your child and get your guest registration link.</p>
    <div className="flex flex-wrap gap-4"><Link className="font-bold text-blue underline" href={`/signup?next=${next}`}>Create a free account</Link><Link className="font-bold text-blue underline" href={`/login?next=${next}`}>Sign in</Link></div></main>;
  const service = createServiceClient();
  const { data: registration, error } = await service.from("mem_paid_party_registrations").select("booking_id, recipient_email").eq("token", token).maybeSingle();
  if (error) throw new Error("paid_party_read_failed");
  if (!registration) notFound();
  if (!authed.user.email_confirmed_at || authed.user.email?.toLowerCase() !== registration.recipient_email) return <main className="mx-auto max-w-2xl space-y-4 px-4 py-10"><h1 className="text-2xl font-black">Use your party organiser account</h1><p>Sign in with the verified email address you gave Empowr. Contact the team if it needs changing.</p><Link href="/account" className="text-blue underline">Go to your account</Link></main>;
  const result = await service.from("mem_private_bookings").select("id, status, starts_at, ends_at, paid_places, total_places, host_account_id, invite_token, awaiting_host").eq("id", registration.booking_id).single();
  if (result.error) throw new Error("paid_party_booking_read_failed");
  const b = result.data;
  const closed = b.status !== "confirmed" || Date.parse(b.starts_at) <= Date.now();
  const mine = !b.awaiting_host && b.host_account_id === authed.account.id;
  let household: React.ReactNode = null;
  if (mine && !closed) {
    const people = await service.from("mem_participants").select("*").eq("account_id", authed.account.id).order("created_at");
    if (people.error) throw new Error("paid_party_participants_read_failed");
    const participants = (people.data ?? []) as Participant[];
    const waivers = await checkWaivers(authed.user.email ?? "", participants);
    household = <HouseholdManager initialParticipants={participants} initialUnsignedIds={waivers.filter(w => !w.signed).map(w => w.participantId)} accountName={authed.account.name} accountPhone={authed.account.phone} suggestedContact={null} />;
  }
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-black">Set up your paid birthday party</h1>
    <section className="space-y-2 rounded-2xl bg-card p-6 shadow-sm"><p className="font-bold">{formatPrivateSlot(b.starts_at,b.ends_at)}</p><p>{b.paid_places} paid places + 1 free birthday place = {b.total_places} total.</p><p>Payment already recorded — nothing more to pay for these places.</p></section>
    {closed ? <p>This party is no longer open for setup. Please contact Empowr.</p> : !mine ? <ClaimPaidParty token={token} /> : <>
      <section className="space-y-4 rounded-2xl bg-card p-6 shadow-sm"><h2 className="text-xl font-extrabold">1. Add your child and complete their waiver</h2><p>If your child is already listed, you can use their existing details.</p>{household}</section>
      <section className="space-y-4 rounded-2xl bg-card p-6 shadow-sm"><h2 className="text-xl font-extrabold">2. Register your child for this party</h2><p>Choose their skate hire and mark them as the birthday person. Their free place is already included.</p><Link className="font-bold text-blue underline" href={`/private-bookings/join/${b.invite_token}`}>Register the birthday child</Link></section>
      <section className="space-y-4 rounded-2xl bg-card p-6 shadow-sm"><h2 className="text-xl font-extrabold">3. Invite your guests</h2><p>Send this guest link to each parent or guardian. They can register their child, complete the waiver and choose skate hire. There is no guest payment.</p><CopyLink url={membersUrl(`/private-bookings/join/${b.invite_token}`)} /></section>
      <Link className="font-bold text-blue underline" href={`/private-bookings/${b.id}`}>Manage your party and see guest registrations</Link>
    </>}
  </main>;
}
