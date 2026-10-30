import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

// Skate Jam hire stock: pairs owned per UK size. Stock is reused every
// session; mem_skate_jam_hire_stock counts what each date has reserved.
// Lowering a count below a date's reservations is allowed (bookings already
// made keep their pair); the page shows the shortfall.

const UPCOMING_DATES = 4;

export async function GET() {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const service = createServiceClient();
  const [sizes, dates] = await Promise.all([
    service.from("mem_skate_jam_hire_sizes").select("size,quantity").order("size"),
    service.from("mem_occurrences").select("id,starts_at,mem_offerings!inner(slug)")
      .eq("mem_offerings.slug", "skate-jam").neq("status", "cancelled")
      .gte("starts_at", new Date().toISOString()).order("starts_at").limit(UPCOMING_DATES),
  ]);
  if (sizes.error || dates.error) {
    console.error("skate hire admin read failed", sizes.error ?? dates.error);
    return NextResponse.json({ error: "Could not load skate hire stock. Please try again." }, { status: 500 });
  }
  const ids = (dates.data ?? []).map((d) => d.id);
  const reserved = ids.length
    ? await service.from("mem_skate_jam_hire_stock").select("occurrence_id,size,reserved").in("occurrence_id", ids)
    : { data: [], error: null };
  if (reserved.error) {
    console.error("skate hire reservations read failed", reserved.error);
    return NextResponse.json({ error: "Could not load skate hire bookings. Please try again." }, { status: 500 });
  }
  return NextResponse.json({
    sizes: sizes.data,
    dates: (dates.data ?? []).map((d) => ({
      id: d.id,
      starts_at: d.starts_at,
      reserved: Object.fromEntries((reserved.data ?? []).filter((r) => r.occurrence_id === d.id).map((r) => [r.size, r.reserved])),
    })),
  });
}

const stockSchema = z.object({
  sizes: z.array(z.object({ size: z.number().int().min(3).max(10), quantity: z.number().int().min(0).max(100) }).strict())
    .min(1).max(8)
    .refine((rows) => new Set(rows.map((r) => r.size)).size === rows.length, "Each size once"),
}).strict();

export async function PUT(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = stockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number of pairs (0–100) for each size." }, { status: 400 });
  const service = createServiceClient();
  for (const row of parsed.data.sizes) {
    const { data, error } = await service.from("mem_skate_jam_hire_sizes")
      .update({ quantity: row.quantity }).eq("size", row.size).select("size").maybeSingle();
    if (error) {
      console.error("skate hire stock update failed", row.size, error);
      return NextResponse.json({ error: `Could not save UK ${row.size}. Sizes before it were saved; please try again.` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: `UK ${row.size} is not a hire size.` }, { status: 400 });
  }
  const { data, error } = await service.from("mem_skate_jam_hire_sizes").select("size,quantity").order("size");
  if (error) return NextResponse.json({ error: "Saved, but could not reload the stock." }, { status: 500 });
  return NextResponse.json({ sizes: data });
}
