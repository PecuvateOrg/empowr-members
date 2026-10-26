// POST /api/messages/[id]/read - the signed-in member marks one of their own messages read.
//
// A POST from the page after it has rendered, never a side effect of rendering it: link prefetches and
// crawlers GET pages, and must not mark anything read. Uses the member's own RLS-scoped client, so the
// database - not this code - guarantees it can only touch their own recipient row and only read_at.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("mem_message_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("message_id", id)
    .is("read_at", null);
  if (error) {
    console.error("mark message read failed", id, error);
    return NextResponse.json({ error: "Could not mark this message read." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
