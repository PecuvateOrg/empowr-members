// The admin Inbox: messages sent through the Members contact form (a copy also goes to the CRM).
// Service-role only - mem_contact_messages and mem_staff_push_subscriptions have no API-role access
// (ops/sql/members-contact-inbox.sql). Every read destructures `error` and throws, so a failed read
// never shows as an empty inbox.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin";
import { sendPush } from "@/lib/push";
import { mapLimit } from "@/lib/message-core";

export type ContactStatus = "open" | "replied" | "closed";

export type ContactMessage = {
  id: string;
  created_at: string;
  account_id: string | null;
  name: string;
  email: string;
  topic: string;
  body: string;
  status: ContactStatus;
  read_at: string | null;
  replied_at: string | null;
  reply_message_id: string | null;
};

const COLUMNS = "id, created_at, account_id, name, email, topic, body, status, read_at, replied_at, reply_message_id";

export async function insertContactMessage(m: {
  accountId: string | null;
  name: string;
  email: string;
  topic: string;
  body: string;
}): Promise<string> {
  const { data, error } = await createServiceClient()
    .from("mem_contact_messages")
    .insert({ account_id: m.accountId, name: m.name, email: m.email, topic: m.topic, body: m.body })
    .select("id")
    .single();
  if (error) throw new Error(`contact message insert failed: ${error.message}`);
  return data.id as string;
}

export async function listContactMessages(limit = 100): Promise<ContactMessage[]> {
  const { data, error } = await createServiceClient()
    .from("mem_contact_messages")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`contact messages read failed: ${error.message}`);
  return (data ?? []) as ContactMessage[];
}

export async function getContactMessage(id: string): Promise<ContactMessage | null> {
  const { data, error } = await createServiceClient()
    .from("mem_contact_messages")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`contact message read failed: ${error.message}`);
  return (data as ContactMessage | null) ?? null;
}

export async function countUnreadContactMessages(): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("mem_contact_messages")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(`contact messages count failed: ${error.message}`);
  return count ?? 0;
}

export async function updateContactMessage(
  id: string,
  patch: Partial<Pick<ContactMessage, "status" | "read_at" | "replied_at" | "reply_message_id">> & { replied_by?: string }
): Promise<void> {
  const { error } = await createServiceClient().from("mem_contact_messages").update(patch).eq("id", id);
  if (error) throw new Error(`contact message update failed: ${error.message}`);
}

/** Phone alert to every admin device that asked for one. The ADMIN_EMAILS list is re-checked here,
 *  so someone taken off it stops getting alerts even if their device row is still stored. Never
 *  throws: the message is already saved, and a failed alert must not fail the member's send. */
export async function alertStaff(message: { id: string; name: string; topic: string; body: string }): Promise<void> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("mem_staff_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth");
    if (error) throw new Error(error.message);
    const subs = (data ?? []) as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[];

    const allowed = new Map<string, boolean>();
    for (const userId of new Set(subs.map((s) => s.user_id))) {
      const { data: user, error: userError } = await service.auth.admin.getUserById(userId);
      allowed.set(userId, !userError && isAdminEmail(user.user?.email));
    }

    const payload = {
      title: `New message: ${message.topic}`,
      body: `${message.name}: ${message.body.replace(/\s+/g, " ").slice(0, 120)}`,
      url: `/admin/messages/inbox/${message.id}`,
      urgent: false,
    };
    await mapLimit(subs.filter((s) => allowed.get(s.user_id)), 5, async (s) => {
      const outcome = await sendPush(s, payload);
      if (outcome === "gone") await service.from("mem_staff_push_subscriptions").delete().eq("id", s.id);
      else if (outcome === "sent")
        await service.from("mem_staff_push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
    });
  } catch (err) {
    console.error("staff alert failed", message.id, err instanceof Error ? err.message : err);
  }
}
