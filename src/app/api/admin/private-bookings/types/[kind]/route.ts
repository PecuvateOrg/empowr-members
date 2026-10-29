// PATCH /api/admin/private-bookings/types/[kind] — edit a private booking
// type's price, equipment hire price and skater limits. Checkout prices from
// this row (mem_hold_private_booking), and the booking page and
// /api/public/live-sessions read it live, so a save is in effect at once.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { privateTypePricesSchema } from "@/lib/validation";

type Params = { params: Promise<{ kind: string }> };

const EDITABLE = new Set(["birthday", "coaching_one", "coaching_group"]);

export async function PATCH(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { kind } = await params;
  if (!EDITABLE.has(kind)) {
    return NextResponse.json({ error: "Unknown booking type" }, { status: 404 });
  }

  const parsed = privateTypePricesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { data, error } = await createServiceClient()
    .from("mem_private_booking_types")
    .update(parsed.data)
    .eq("kind", kind)
    .select("kind, unit_price_pence, hire_price_pence, min_places, max_places")
    .maybeSingle();
  if (error) {
    console.error("admin private type update failed", kind, error);
    return NextResponse.json({ error: "Could not save — please try again." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Booking type not found" }, { status: 404 });
  }
  console.info(`private booking type updated by ${admin.email}: ${JSON.stringify(data)}`);
  return NextResponse.json({ type: data });
}
