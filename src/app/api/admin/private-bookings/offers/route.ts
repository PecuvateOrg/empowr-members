import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { privateOfferSchema, privateOfferRefusal } from "@/lib/private-offers";
import { privateRpcRefusal } from "@/lib/private-bookings";
import { membersUrl } from "@/lib/links";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = privateOfferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a date and number of paid places." }, { status: 400 });
  const { data, error } = await createServiceClient().rpc("mem_create_private_offer", {
    p_starts_at: parsed.data.starts_at, p_paid_places: parsed.data.paid_places, p_created_by: admin.id,
  });
  if (error) {
    const message = privateOfferRefusal(error.message) ?? privateRpcRefusal(error.message)?.message;
    if (!message) console.error("private offer create failed", error.code);
    return NextResponse.json({ error: message ?? "Could not create the offer. Please try again." }, { status: message ? 409 : 500 });
  }
  return NextResponse.json({ url: membersUrl(`/private-bookings/offer/${data.token}`), expires_at: data.expires_at }, { status: 201 });
}
