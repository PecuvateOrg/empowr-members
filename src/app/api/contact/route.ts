// The Members contact form (2026-11-02): one submit, two destinations.
//
// 1. Forwarded server-to-server to the main site's contact function, which verifies the Turnstile
//    token, files the CRM escalation and emails the sender a confirmation - exactly what the browser
//    used to call directly. The token is single-use, so it is checked there and nowhere else. The
//    function picks the Turnstile secret by Origin, and a server fetch sends none, so it is set here.
// 2. Only when that succeeds, saved to the admin Inbox (mem_contact_messages) and staff are alerted.
//
// account_id is the SIGNED-IN account, never a match on the typed email: anyone can type anyone's
// address, and the Inbox shows the linked account's skaters.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { alertStaff, insertContactMessage } from "@/lib/contact-inbox";

// The `www` host, not the apex: the apex redirects (see ContactForm).
const CONTACT_ENDPOINT = "https://www.empowrcic.org/.netlify/functions/contact";
const MEMBERS_ORIGIN = "https://members.empowrcic.org";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  topic: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(10000),
  company: z.string().max(200).optional().default(""),
  turnstileToken: z.string().max(4096).optional().default(""),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  const v = parsed.data;

  // Honeypot: real people leave it blank. Look successful and keep nothing.
  if (v.company) return NextResponse.json({ ok: true });

  const forwarded = await fetch(CONTACT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: MEMBERS_ORIGIN },
    body: JSON.stringify({
      name: v.name,
      email: v.email,
      subject: `Members — ${v.topic}`,
      message: v.message,
      company: "",
      source: "members",
      turnstileToken: v.turnstileToken,
    }),
    signal: AbortSignal.timeout(15000),
  }).catch((err) => {
    console.error("contact forward failed", err instanceof Error ? err.message : err);
    return null;
  });
  if (!forwarded?.ok) {
    if (forwarded) console.error("contact forward returned", forwarded.status, await forwarded.text().catch(() => ""));
    return NextResponse.json({ error: "Your message could not be sent. Please try again." }, { status: 502 });
  }

  let accountId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase.from("mem_accounts").select("id").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      accountId = (data?.id as string | undefined) ?? null;
    }
  } catch (err) {
    // The CRM already has it; an unlinked Inbox entry beats none.
    console.error("contact account lookup failed", err instanceof Error ? err.message : err);
  }

  try {
    const id = await insertContactMessage({ accountId, name: v.name, email: v.email, topic: v.topic, body: v.message });
    await alertStaff({ id, name: v.name, topic: v.topic, body: v.message });
  } catch (err) {
    // The CRM copy and the sender's confirmation have gone, so the member is told it worked; the
    // missing Inbox entry is a staff-side fault and goes to the logs.
    console.error("contact inbox save failed", err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true });
}
