// POST /api/admin/private-bookings/blocks — mark 3–4pm, 4–5pm or 3–5pm on a
// Saturday unavailable, with an internal reason customers never see.
//
// A block is a row under the same no-overlap constraint as a booking, so it
// cannot be placed over a paid booking — that is refused and named, never
// overwritten. Until Google Calendar sync exists, this is how staff keep out
// anything the calendar knows about that Members does not.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { privateBlockSchema, privateRpcRefusal } from "@/lib/private-bookings";

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

  const { data, error } = await createServiceClient().rpc("mem_block_private_slot", {
    p_starts_at: parsed.data.starts_at,
    p_hours: parsed.data.hours,
    p_user_id: admin.id,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    if (error.message?.includes("mem_private_unavailable")) {
      return NextResponse.json(
        { error: "Something is already booked or blocked in that time. Check the list below — a paid booking is never overwritten." },
        { status: 409 }
      );
    }
    const refusal = privateRpcRefusal(error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("private block failed", error);
    return NextResponse.json({ error: "Could not block that time." }, { status: 500 });
  }
  return NextResponse.json({ block: data }, { status: 201 });
}
