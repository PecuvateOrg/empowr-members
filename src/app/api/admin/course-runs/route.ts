// POST /api/admin/course-runs — create a run of a per_run offering.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { courseRunSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

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
    .insert(parsed.data)
    .select()
    .single();
  if (error) {
    console.error("admin course run create failed", error);
    return NextResponse.json(
      { error: "Could not create the course run — please try again." },
      { status: 500 }
    );
  }

  revalidateCatalogue();
  return NextResponse.json({ courseRun: data }, { status: 201 });
}
