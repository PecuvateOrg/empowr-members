// POST /api/admin/occurrences/[id]/cancel — Empowr cancels a session. The work is in
// lib/occurrence-cancel.ts (shared with the AI tools).
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { cancelOccurrence } from "@/lib/occurrence-cancel";
import { cancelOccurrenceSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = cancelOccurrenceSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose refund or credit and 4 or 5 sessions this month." },
      { status: 400 }
    );
  }
  return cancelOccurrence(id, parsed.data, admin.id);
}
