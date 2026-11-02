// POST /api/push/subscribe   - a signed-in member registers this device for alerts.
// DELETE /api/push/subscribe - they turn alerts off on this device.
//
// The subscription (endpoint + keys) is a credential for pushing to the device, so the table has no
// API-role access at all: this route authenticates the member and writes with the service client.
// An endpoint belongs to a browser, not a person - if a different member signs in on the same browser
// and turns alerts on, the row moves to them (upsert on endpoint) rather than the first person's
// alerts continuing to land on a device someone else now holds.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

/** Whether this device's subscription is stored for the signed-in account (usePushAlerts' "on"). */
export async function GET(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ on: false });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  if (!endpoint) return NextResponse.json({ on: false });
  const { data, error } = await createServiceClient()
    .from("mem_push_subscriptions")
    .select("id")
    .eq("account_id", authed.account.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) {
    console.error("push status read failed", authed.account.id, error);
    return NextResponse.json({ error: "Could not check alerts" }, { status: 500 });
  }
  return NextResponse.json({ on: Boolean(data) });
}

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("mem_push_subscriptions")
    .upsert(
      {
        account_id: authed.account.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("push subscribe failed", authed.account.id, error);
    return NextResponse.json({ error: "Could not turn on alerts. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("mem_push_subscriptions")
    .delete()
    .eq("account_id", authed.account.id)
    .eq("endpoint", parsed.data.endpoint);
  if (error) {
    console.error("push unsubscribe failed", authed.account.id, error);
    return NextResponse.json({ error: "Could not turn off alerts. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
