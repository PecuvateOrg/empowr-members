// Admin phone alerts (new Inbox messages) for this device. Stored per auth user in
// mem_staff_push_subscriptions, separate from a member's own alerts - see usePushAlerts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

export async function GET(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ on: false });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  if (!endpoint) return NextResponse.json({ on: false });
  const { data, error } = await createServiceClient()
    .from("mem_staff_push_subscriptions")
    .select("id")
    .eq("user_id", admin.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) {
    console.error("staff push status read failed", admin.id, error);
    return NextResponse.json({ error: "Could not check alerts" }, { status: 500 });
  }
  return NextResponse.json({ on: Boolean(data) });
}

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("mem_staff_push_subscriptions")
    .upsert(
      {
        user_id: admin.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("staff push subscribe failed", admin.id, error);
    return NextResponse.json({ error: "Could not turn on alerts. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { error } = await createServiceClient()
    .from("mem_staff_push_subscriptions")
    .delete()
    .eq("user_id", admin.id)
    .eq("endpoint", parsed.data.endpoint);
  if (error) {
    console.error("staff push unsubscribe failed", admin.id, error);
    return NextResponse.json({ error: "Could not turn off alerts. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
