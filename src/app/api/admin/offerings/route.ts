// POST /api/admin/offerings — create an offering.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { triggerCatalogueRebuild } from "@/lib/rebuild";
import { offeringSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const parsed = offeringSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_offerings")
    .insert(parsed.data)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That URL slug is already in use." },
        { status: 409 }
      );
    }
    console.error("admin offering create failed", error);
    return NextResponse.json(
      { error: "Could not create the offering — please try again." },
      { status: 500 }
    );
  }

  revalidateCatalogue();

  // A new ACTIVE offering adds a slug that generateStaticParams() did not know
  // about at build time, and /sessions/[slug] is dynamicParams = false — so
  // without a rebuild the session would be listed and 404 when clicked.
  // Creating it inactive changes no page, so it needs no build.
  if (data.active) {
    await triggerCatalogueRebuild(`offering created: ${data.slug}`);
  }

  return NextResponse.json({ offering: data }, { status: 201 });
}
