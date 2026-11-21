import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { formatPrivateSlot } from "@/lib/private-bookings";
import { PARTY_INVITE_COOKIE, isPartyInviteToken } from "@/lib/party-invite";

export type PendingPartyInvite = { href: string; hostFirstName: string; when: string };

// The party invitation this browser last opened, if it is still open for
// registration and this account has nobody on it yet. Shown on /account so a
// guest stranded there after sign-in or adding a skater can get back (#194).
// Best effort: any failure just means no prompt, never a broken account page.
export async function pendingPartyInvite(accountId: string): Promise<PendingPartyInvite | null> {
  const token = (await cookies()).get(PARTY_INVITE_COOKIE)?.value;
  if (!isPartyInviteToken(token)) return null;
  try {
    const service = createServiceClient();
    const { data: booking, error } = await service
      .from("mem_private_bookings")
      .select("id, status, starts_at, ends_at, host_account_id")
      .eq("invite_token", token)
      .eq("kind", "birthday")
      .maybeSingle();
    if (error || !booking) return null;
    if (booking.status !== "confirmed" || new Date(booking.starts_at) <= new Date()) return null;
    if (booking.host_account_id === accountId) return null;

    const [{ count, error: placesError }, { data: host }] = await Promise.all([
      service
        .from("mem_private_booking_places")
        .select("participant_id", { count: "exact", head: true })
        .eq("private_booking_id", booking.id)
        .eq("account_id", accountId),
      service.from("mem_accounts").select("name").eq("id", booking.host_account_id).maybeSingle(),
    ]);
    if (placesError || (count ?? 0) > 0) return null;

    return {
      href: `/private-bookings/join/${token}`,
      hostFirstName: ((host?.name as string) || "").trim().split(/\s+/)[0] || "Your host",
      when: formatPrivateSlot(booking.starts_at, booking.ends_at),
    };
  } catch (e) {
    console.error("pending party invite read failed", e);
    return null;
  }
}
