import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a reason for undoing this check-in." },
      { status: 400 },
    );
  }

  // getAuthedAdmin is the server-side full-administrator capability.
  // CHECKIN_EMAILS staff fail this check even if they call the route directly.
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const { id } = parsedParams.data;
  const { error } = await createServiceClient().rpc(
    "mem_admin_undo_booking_checkin",
    {
      p_booking_id: id,
      p_staff_user_id: admin.id,
      p_reason: parsed.data.reason,
    },
  );

  if (error) {
    if (error.message.includes("mem_booking_not_found")) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (error.message.includes("mem_booking_not_attended")) {
      return NextResponse.json(
        { error: "This booking is no longer marked as attended." },
        { status: 409 },
      );
    }
    if (error.message.includes("mem_checkin_correction_invalid")) {
      return NextResponse.json(
        { error: "Enter a valid correction reason." },
        { status: 400 },
      );
    }

    console.error("undo check-in failed", id, error);
    return NextResponse.json(
      { error: "Could not undo this check-in." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
