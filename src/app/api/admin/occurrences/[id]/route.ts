// PATCH / DELETE /api/admin/occurrences/[id] — reschedule/edit, or
// remove an occurrence that never took any bookings.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { occurrenceSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

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
    .update({
      ...parsed.data,
      course_run_id: parsed.data.course_run_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.error("admin occurrence update failed", id, error);
    return NextResponse.json(
      { error: "Could not save this date — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Occurrence not found" }, { status: 404 });
  }

  await revalidateCatalogue("occurrence updated");
  return NextResponse.json({ occurrence: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_occurrences")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This date has bookings, so it can't be removed — cancel it instead.",
        },
        { status: 409 }
      );
    }
    console.error("admin occurrence delete failed", id, error);
    return NextResponse.json(
      { error: "Could not remove this date — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Occurrence not found" }, { status: 404 });
  }

  await revalidateCatalogue("occurrence deleted");
  return NextResponse.json({ ok: true });
}
