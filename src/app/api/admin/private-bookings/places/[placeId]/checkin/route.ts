// POST /api/admin/private-bookings/places/[placeId]/checkin — check a covered
// attendee in, or undo an accidental check-in. { checked_in: boolean }
//
// Door staff as well as admins, like the session register. Undo clears the
// check-in only; nobody paid for a covered place here, so it is never a refund.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ placeId: string }> }
) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { placeId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.checked_in !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await createServiceClient()
    .from("mem_private_booking_places")
    .update(
      body.checked_in
        ? { checked_in_at: new Date().toISOString(), checked_in_by_user_id: staff.id }
        : { checked_in_at: null, checked_in_by_user_id: null }
    )
    .eq("id", placeId)
    .select("id, checked_in_at");
  if (error) {
    console.error("private check-in failed", placeId, error);
    return NextResponse.json({ error: "Could not update check-in." }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Attendee not found." }, { status: 404 });
  }
  return NextResponse.json({ place: data[0] });
}
