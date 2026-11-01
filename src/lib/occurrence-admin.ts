// Adding and editing session dates. Called by /api/admin/occurrences(/[id]) and the AI tools
// (lib/mcp/tools.ts); returns the HTTP response the screen has always had.
import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import type { OccurrenceInput } from "@/lib/validation";
import { privateClashRefusal } from "@/lib/private-bookings-server";

export async function createOccurrence(input: OccurrenceInput): Promise<NextResponse> {
  const parsed = { data: input };
  if (new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    return NextResponse.json(
      { error: "End time must be after the start time." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const clash = await privateClashRefusal(service, parsed.data);
  if (clash) return NextResponse.json({ error: clash.error }, { status: clash.status });

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

  await revalidateCatalogue("occurrence created");
  return NextResponse.json({ occurrence: data }, { status: 201 });
}

export async function updateOccurrence(id: string, input: OccurrenceInput): Promise<NextResponse> {
  const parsed = { data: input };
  if (new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    return NextResponse.json(
      { error: "End time must be after the start time." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const clash = await privateClashRefusal(service, parsed.data);
  if (clash) return NextResponse.json({ error: clash.error }, { status: clash.status });

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
