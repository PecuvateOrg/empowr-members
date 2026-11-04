import { createServiceClient } from "@/lib/supabase/service";
import { PaidPartyRegistrationForm } from "@/components/admin/PaidPartyRegistrationForm";
import { CopyLink } from "@/components/private-bookings/CopyLink";
import { membersUrl } from "@/lib/links";
import { formatPrivateSlot } from "@/lib/private-bookings";

// Only rendered inside the authenticated admin layout.
export async function PaidPartyRegistrationSection() {
  const { data, error } = await createServiceClient().from("mem_paid_party_registrations")
    .select("id, token, recipient_email, claimed_at, booking:mem_private_bookings(starts_at,ends_at,total_places,status)")
    .order("created_at", { ascending: false }).limit(20);
  if (error?.code === "PGRST205") return <p>Registration links for already-paid parties are not set up yet.</p>;
  if (error) throw new Error("admin_paid_party_read_failed");
  return <div className="space-y-6"><PaidPartyRegistrationForm />
    {!!data?.length && <details><summary className="cursor-pointer font-bold">Recent organiser setup links</summary><ul className="divide-y divide-line">{data.map(row => {
      const b = row.booking as unknown as { starts_at: string; ends_at: string; total_places: number; status: string };
      return <li key={row.id} className="space-y-2 py-4 text-sm"><p className="font-bold">{row.recipient_email}</p><p>{formatPrivateSlot(b.starts_at,b.ends_at)} · {b.total_places} places</p><p>{b.status !== "confirmed" ? "Booking cancelled" : row.claimed_at ? "Connected to organiser’s account" : "Awaiting organiser registration"}</p><CopyLink label="Organiser setup link" url={membersUrl(`/private-bookings/setup/${row.token}`)} /></li>;
    })}</ul></details>}
  </div>;
}
