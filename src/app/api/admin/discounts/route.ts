import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { discountSchema } from "@/lib/discounts";

export async function GET() {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const service = createServiceClient();
  const [codes, offerings] = await Promise.all([
    service.from("mem_discount_codes").select("id,code,kind,value,offering_id,expires_at,active,created_at").order("created_at", { ascending: false }),
    service.from("mem_offerings").select("id,title,active").order("title"),
  ]);
  if (codes.error || offerings.error) {
    console.error("discount admin read failed", codes.error ?? offerings.error);
    return NextResponse.json({ error: "Could not load discount codes. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ discounts: codes.data, offerings: offerings.data });
}

export async function POST(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = discountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const service = createServiceClient();
  if (parsed.data.offering_id) {
    const { data, error } = await service.from("mem_offerings").select("id").eq("id", parsed.data.offering_id).eq("active", true).maybeSingle();
    if (error) return NextResponse.json({ error: "Could not check the session type." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Choose an active session type." }, { status: 400 });
  }
  const { data, error } = await service.from("mem_discount_codes").insert(parsed.data).select().single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That discount code already exists." }, { status: 409 });
    console.error("discount create failed", error);
    return NextResponse.json({ error: "Could not create the discount code." }, { status: 500 });
  }
  return NextResponse.json({ discount: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = z.object({ id: z.string().uuid(), active: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid discount update" }, { status: 400 });
  const { data, error } = await createServiceClient().from("mem_discount_codes")
    .update({ active: parsed.data.active }).eq("id", parsed.data.id).select().maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update the discount code." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Discount code not found." }, { status: 404 });
  return NextResponse.json({ discount: data });
}
