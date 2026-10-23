// POST /api/admin/deletions/[id] — staff release a held request or reverse any open one.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { endDeletion, releaseDeletion } from "@/lib/account-deletion";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["release", "reverse"]) });

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin?.email) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = parsed.data.action === "release" ? await releaseDeletion(id) : await endDeletion(id, { staffEmail: admin.email });
    if (!result.ok) return NextResponse.json({ error: "This request can't be changed now — refresh the page." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin deletion action failed", id, parsed.data.action, err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
