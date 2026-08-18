// POST /api/admin/occurrences — schedule a date for a per_occurrence
// offering (or a session within a course run).
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { occurrenceSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const parsed = occurrenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    return NextResponse.json(
      { error: "End time must be after the start time." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_occurrences")
    .insert({ ...parsed.data, course_run_id: parsed.data.course_run_id ?? null })
    .select()
    .single();
  if (error) {
    console.error("admin occurrence create failed", error);
    return NextResponse.json(
      { error: "Could not create the date — please try again." },
      { status: 500 }
    );
  }

  revalidateCatalogue();
  return NextResponse.json({ occurrence: data }, { status: 201 });
}
