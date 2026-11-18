// POST /api/admin/private-bookings/[id]/reschedule — move a confirmed private
// booking to another valid slot (issue #204). Admin only. The booking keeps
// its id, invite link, payment and guests; see lib/private-reschedule.ts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { privateRescheduleSchema, reschedulePrivateBooking } from "@/lib/private-reschedule";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const parsed = privateRescheduleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  return reschedulePrivateBooking(id, parsed.data, admin.id);
}
