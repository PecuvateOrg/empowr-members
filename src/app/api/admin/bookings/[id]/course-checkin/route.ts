import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { getBookingForCheckin } from "@/lib/admin-data";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getAuthedCheckinStaff();
  if (!staff)
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const date =
    body && typeof body === "object" && "session_date" in body
      ? body.session_date
      : null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json(
      { error: "Choose a course session date." },
      { status: 400 },
    );
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  )
    return NextResponse.json(
      { error: "Choose a valid course session date." },
      { status: 400 },
    );
  const booking = await getBookingForCheckin(id);
  if (!booking?.isCourseRun || !booking.waiverSigned)
    return NextResponse.json(
      { error: "A course booking with a signed waiver is required." },
      { status: 409 },
    );
  const { data, error } = await createServiceClient().rpc(
    "mem_check_in_course_booking",
    { p_booking_id: id, p_session_date: date, p_checked_in_by: staff.id },
  );
  if (error) {
    const invalid = error.message.includes("mem_course_checkin_invalid");
    console.error("course check-in failed", id, error.code);
    return NextResponse.json(
      {
        error: invalid
          ? "This booking cannot be checked in for that date."
          : "Could not save check-in. Please try again.",
      },
      { status: invalid ? 409 : 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    rowFlipped: Boolean(data),
    alreadyAttended: !data,
  });
}
