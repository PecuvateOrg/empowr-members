import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

// Free skate hire stock: pairs owned per UK size, shared by Skate Jam and
// SYNKRON8 dates (mem_skate_jam_hire_stock, per date) and Level 1 course runs
// (mem_skate_hire_run_stock, one pair per skater for the whole run).
// Lowering a count below a date's reservations is allowed (bookings already
// made keep their pair); the page shows the shortfall.

const UPCOMING_DATES = 4;

export async function GET() {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const service = createServiceClient();
  const today = new Date().toISOString();
  const upcoming = (slug: string) => service.from("mem_occurrences").select("id,starts_at,mem_offerings!inner(slug,title)")
    .eq("mem_offerings.slug", slug).eq("status", "scheduled")
    .gte("starts_at", today).order("starts_at").limit(UPCOMING_DATES);
  const [sizes, jam, synkron8, runs] = await Promise.all([
    service.from("mem_skate_jam_hire_sizes").select("size,quantity").order("size"),
    upcoming("skate-jam"),
    upcoming("synkron8"),
    service.from("mem_course_runs").select("id,label,starts_on,ends_on,offering:mem_offerings(title)")
      .eq("free_skate_hire", true).gte("ends_on", today.slice(0, 10)).order("starts_on"),
  ]);
  const readError = sizes.error ?? jam.error ?? synkron8.error ?? runs.error;
  if (readError) {
    console.error("skate hire admin read failed", readError);
    return NextResponse.json({ error: "Could not load skate hire stock. Please try again." }, { status: 500 });
  }
  const dates = [...(jam.data ?? []), ...(synkron8.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = dates.map((d) => d.id);
  const runIds = (runs.data ?? []).map((r) => r.id);
  const [reserved, runReserved] = await Promise.all([
    ids.length ? service.from("mem_skate_jam_hire_stock").select("occurrence_id,size,reserved").in("occurrence_id", ids) : { data: [], error: null },
    runIds.length ? service.from("mem_skate_hire_run_stock").select("course_run_id,size,reserved").in("course_run_id", runIds) : { data: [], error: null },
  ]);
  if (reserved.error || runReserved.error) {
    console.error("skate hire reservations read failed", reserved.error ?? runReserved.error);
    return NextResponse.json({ error: "Could not load skate hire bookings. Please try again." }, { status: 500 });
  }
  return NextResponse.json({
    sizes: sizes.data,
    dates: [
      ...dates.map((d) => ({
        id: d.id,
        title: (d.mem_offerings as unknown as { title: string }).title,
        starts_at: d.starts_at,
        reserved: Object.fromEntries((reserved.data ?? []).filter((r) => r.occurrence_id === d.id).map((r) => [r.size, r.reserved])),
      })),
      ...(runs.data ?? []).map((r) => ({
        id: r.id,
        title: (r.offering as unknown as { title: string } | null)?.title ?? "Course",
        label: `${r.label}, whole course`,
        starts_at: r.starts_on,
        reserved: Object.fromEntries((runReserved.data ?? []).filter((x) => x.course_run_id === r.id).map((x) => [x.size, x.reserved])),
      })),
    ],
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
