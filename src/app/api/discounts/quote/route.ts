import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { bookingBasketSchema } from "@/lib/validation";
import { discountForPlace, type Discount } from "@/lib/discounts";

type Target = { price_pence?: number | null; offering: {
  id: string; price_pence: number; early_bird_price_pence: number | null; active: boolean;
} };

export async function POST(request: Request) {
  if (!(await getAuthedAccount())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = bookingBasketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.discount_code) return NextResponse.json({ error: "Enter a discount code and add a session to your basket." }, { status: 400 });
  const service = createServiceClient();
  const { data, error } = await service.from("mem_discount_codes").select("id,code,kind,value,offering_id,expires_at,active")
    .eq("code", parsed.data.discount_code).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check this code. Please try again." }, { status: 500 });
  const discount = data as Discount | null;
  if (!discount || !discount.active || (discount.expires_at && Date.parse(discount.expires_at) <= Date.now())) {
    return NextResponse.json({ error: "This code is invalid, paused or expired." }, { status: 400 });
  }
  let subtotal = 0;
  let savings = 0;
  for (const item of parsed.data.items) {
    const occurrence = !!item.occurrence_id;
    const { data: row, error: targetError } = await service.from(occurrence ? "mem_occurrences" : "mem_course_runs")
      .select(`${occurrence ? "" : "price_pence,"}offering:mem_offerings(id,price_pence,early_bird_price_pence,active)`)
      .eq("id", (item.occurrence_id ?? item.course_run_id)!).maybeSingle();
    if (targetError) return NextResponse.json({ error: "Could not check session prices. Please try again." }, { status: 500 });
    const target = row as unknown as Target | null;
    if (!target?.offering?.active) return NextResponse.json({ error: "A session in your basket is no longer available." }, { status: 409 });
    const price = item.early_bird ? target.offering.early_bird_price_pence : target.price_pence ?? target.offering.price_pence;
    if (price === null) return NextResponse.json({ error: "Choose a standard ticket before applying this code." }, { status: 409 });
    subtotal += price * item.participant_ids.length;
    savings += discountForPlace(price, target.offering.id, discount) * item.participant_ids.length;
  }
  if (!savings) return NextResponse.json({ error: "This code does not apply to the sessions in your basket." }, { status: 400 });
  const total = subtotal - savings;
  if (total > 0 && total < 30) return NextResponse.json({ error: "This code leaves less than the 30p minimum payment. Add another place or remove the code." }, { status: 400 });
  return NextResponse.json({ code: discount.code, subtotal_pence: subtotal, discount_pence: savings, total_pence: total });
}
