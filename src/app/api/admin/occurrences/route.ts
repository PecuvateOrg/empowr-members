// POST /api/admin/occurrences — schedule a date for a per_occurrence
// offering (or a session within a course run).
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createOccurrence } from "@/lib/occurrence-admin";
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
  return createOccurrence(parsed.data);
}
