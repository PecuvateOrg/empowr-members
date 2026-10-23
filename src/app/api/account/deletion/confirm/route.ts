// POST /api/account/deletion/confirm — from the emailed link. No sign-in: the signed link is the
// authority. POST (from a page button), never GET, so a mail scanner opening the link cannot
// confirm a deletion.
import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmDeletion } from "@/lib/account-deletion";

const schema = z.object({ id: z.string().uuid(), t: z.string().min(10).max(100) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  try {
    const result = await confirmDeletion(parsed.data.id, parsed.data.t);
    if (!result.ok) {
      const error = result.reason === "expired"
        ? "This link has expired. Sign in and request deletion again."
        : result.reason === "closed" ? "This request has already been closed." : "This link is not valid.";
      return NextResponse.json({ error }, { status: 410 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("account deletion confirm failed", parsed.data.id, err);
    return NextResponse.json({ error: "Something went wrong. Please try again, or contact us." }, { status: 500 });
  }
}
