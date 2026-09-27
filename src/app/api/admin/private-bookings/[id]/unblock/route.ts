// POST /api/admin/private-bookings/[id]/unblock — lift a staff block.
//
// Only ever touches kind='block' rows. It cannot cancel a booking, and lifting
// a block cannot remove anything that overlaps it, because a block and a
// booking can never overlap in the first place.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const { data, error } = await createServiceClient()
    .from("mem_private_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kind", "block")
    .eq("status", "confirmed")
    .select("id");
  if (error) {
    console.error("private unblock failed", id, error);
    return NextResponse.json({ error: "Could not lift the block." }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "No active block with that id." }, { status: 404 });
  }
  return NextResponse.json({ unblocked: id });
}
