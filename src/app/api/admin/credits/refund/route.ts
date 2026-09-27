import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { refundBooking } from "@/lib/credits";
import { createServiceClient } from "@/lib/supabase/service";
export async function POST(request: Request) {
  if (!await getAuthedAdmin()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = z.object({ booking_id: z.string().uuid(), account_id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
  // This endpoint only retries a previously approved refund, not a new refund.
  const { data, error } = await createServiceClient().from("mem_booking_refunds").select("booking_id")
    .eq("booking_id", parsed.data.booking_id).eq("account_id", parsed.data.account_id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "No pending refund found." }, { status: 409 });
  try { return NextResponse.json(await refundBooking(parsed.data.booking_id, parsed.data.account_id)); }
  catch { return NextResponse.json({ error: "Refund is still pending. Check Stripe before further action; retries after 23 hours require reconciliation." }, { status: 503 }); }
}
