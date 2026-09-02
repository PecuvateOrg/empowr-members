// PATCH / DELETE /api/admin/course-runs/[id]
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { courseRunSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = courseRunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_course_runs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.error("admin course run update failed", id, error);
    return NextResponse.json(
      { error: "Could not save the course run — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Course run not found" }, { status: 404 });
  }

  await revalidateCatalogue("course run updated");
  return NextResponse.json({ courseRun: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_course_runs")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This course run has bookings or dates attached, so it can't be removed.",
        },
        { status: 409 }
      );
    }
    console.error("admin course run delete failed", id, error);
    return NextResponse.json(
      { error: "Could not remove the course run — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Course run not found" }, { status: 404 });
  }

  await revalidateCatalogue("course run deleted");
  return NextResponse.json({ ok: true });
}
