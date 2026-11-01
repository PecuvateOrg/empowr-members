// POST /api/admin/private-bookings/blocks — mark 3–4pm, 4–5pm or 3–5pm on a
// Saturday unavailable, with an internal reason customers never see.
//
// A block is a row under the same no-overlap constraint as a booking, so it
// cannot be placed over a paid booking — that is refused and named, never
// overwritten. Until Google Calendar sync exists, this is how staff keep out
// anything the calendar knows about that Members does not.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { privateBlockSchema } from "@/lib/private-bookings";
import { blockPrivateSlot } from "@/lib/private-blocks";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = privateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  return blockPrivateSlot(parsed.data, admin.id);
}
