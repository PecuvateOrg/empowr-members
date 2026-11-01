// POST /api/admin/private-bookings/[id]/unblock — lift a staff block.
//
// Only ever touches kind='block' rows. It cannot cancel a booking, and lifting
// a block cannot remove anything that overlaps it, because a block and a
// booking can never overlap in the first place.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { unblockPrivateSlot } from "@/lib/private-blocks";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  return unblockPrivateSlot(id);
}
