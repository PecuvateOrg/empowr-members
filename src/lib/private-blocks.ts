// Staff blocks on the private-booking slot. Called by /api/admin/private-bookings/blocks,
// /api/admin/private-bookings/[id]/unblock and the AI tools (lib/mcp/tools.ts); returns the HTTP
// response the screen has always had.
import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { privateRpcRefusal, type privateBlockSchema } from "@/lib/private-bookings";

/** A block is a row under the same no-overlap constraint as a booking, so it can never be placed
 *  over a paid booking. */
export async function blockPrivateSlot(input: z.infer<typeof privateBlockSchema>, userId: string): Promise<NextResponse> {
  const parsed = { data: input };
  const admin = { id: userId };
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

/** Only ever touches kind='block' rows, so it cannot cancel a booking. */
export async function unblockPrivateSlot(id: string): Promise<NextResponse> {
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
