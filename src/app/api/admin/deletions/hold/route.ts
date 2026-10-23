// POST /api/admin/deletions/hold — set or clear the staff hold on a member's account (a safeguarding
// concern or incident the system cannot see). Has the same effect as the automatic holds.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { setStaffHold } from "@/lib/account-deletion";

const schema = z.object({ account_id: z.string().uuid(), hold: z.boolean(), note: z.string().trim().max(500).nullable().optional() });

export async function POST(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await setStaffHold(parsed.data.account_id, parsed.data.hold, parsed.data.note ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin deletion hold failed", parsed.data.account_id, err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
