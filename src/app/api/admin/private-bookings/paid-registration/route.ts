import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { paidPartySchema, paidPartyError } from "@/lib/paid-party-registration";
import { privateRpcRefusal } from "@/lib/private-bookings";
import { membersUrl } from "@/lib/links";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = paidPartySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const v = parsed.data;
  const { data, error } = await createServiceClient().rpc("mem_create_paid_party_registration", {
    p_request_id: v.request_id, p_email: v.email, p_starts_at: v.starts_at,
    p_paid_places: v.paid_places, p_actor: admin.id, p_note: v.note ?? null,
  });
  if (error) {
    const message = paidPartyError(error.message) ?? privateRpcRefusal(error.message)?.message;
    return NextResponse.json({ error: message ?? "Could not save the paid party. Please try again." }, { status: message ? 409 : 500 });
  }
  return NextResponse.json({ url: membersUrl(`/private-bookings/setup/${data.token}`), booking_id: data.booking_id }, { status: 201 });
}
