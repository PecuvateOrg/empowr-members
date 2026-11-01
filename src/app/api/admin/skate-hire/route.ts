import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { readSkateHireStock, setSkateHireStock, StockError, stockSchema } from "@/lib/skate-hire-admin";

const fail = (err: unknown) =>
  err instanceof StockError
    ? NextResponse.json({ error: err.message }, { status: err.status })
    : NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });

export async function GET() {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  try {
    return NextResponse.json(await readSkateHireStock());
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = stockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number of pairs (0–100) for each size." }, { status: 400 });
  try {
    return NextResponse.json({ sizes: await setSkateHireStock(parsed.data.sizes) });
  } catch (err) {
    return fail(err);
  }
}
