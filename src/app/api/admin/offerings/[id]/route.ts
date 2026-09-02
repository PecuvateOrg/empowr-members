// PATCH /api/admin/offerings/[id] — edit an offering. No DELETE:
// offerings accrue occurrences/bookings, so retiring one means setting
// active=false, not removing the row.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { offeringSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = offeringSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Read slug+active BEFORE the write. /sessions/[slug] is dynamicParams=false,
  // so the site has to rebuild when the set of ACTIVE slugs changes — and that
  // can only be detected by comparing against the previous values. The update
  // below returns the new row, which on its own cannot tell an activation from
  // a routine price edit.
  const { data: before } = await service
    .from("mem_offerings")
    .select("slug, active")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await service
    .from("mem_offerings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That URL slug is already in use." },
        { status: 409 }
      );
    }
    console.error("admin offering update failed", id, error);
    return NextResponse.json(
      { error: "Could not save the offering — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });
  }

  // EVERY catalogue write now rebuilds — revalidateCatalogue() does it.
  //
  // ⚠️ This used to be gated by shouldRebuildForOfferingChange(), so only an
  // activation, deactivation or slug rename triggered a build and a price or
  // copy edit did not. That gate was correct about builds and fatal in
  // practice: the ungated writes still invalidated the catalogue, which on a
  // dynamicParams = false route destroys the pages with nothing to rebuild
  // them. So the ORDINARY edits were the ones that took the site down. Do not
  // reintroduce the gate without reading lib/revalidate.ts first.
  const change =
    before && before.active !== data.active
      ? `offering ${data.active ? "activated" : "deactivated"}: ${data.slug}`
      : before && before.slug !== data.slug
        ? `offering slug changed: ${before.slug} -> ${data.slug}`
        : `offering updated: ${data.slug}`;
  await revalidateCatalogue(change);

  return NextResponse.json({ offering: data });
}
