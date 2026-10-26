// The real database behind lib/message-send.ts. Service-role only (these tables have no API-role
// writes). Every read destructures `error` and throws: a failed read must never look like "no
// subscribers" or "nobody to email".
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailBatch } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { chunk, mapLimit } from "@/lib/message-core";
import type { MessageStore, SendDeps, Subscription } from "@/lib/message-send";

type Service = ReturnType<typeof createServiceClient>;

async function inChunks<T>(ids: string[], read: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, 100)) out.push(...(await read(part)));
  return out;
}

/** Auth lookups and row updates are one call each, so run them a few at a time. */
const eachLimited = async <T,>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
  await mapLimit(items, limit, fn);
};

export function createMessageStore(service: Service = createServiceClient()): MessageStore {
  return {
    async insertMessage(m) {
      const { error } = await service.from("mem_messages").insert({
        id: m.id,
        request_id: m.requestId,
        sender_user_id: m.senderUserId,
        sender_role: m.senderRole,
        sender_name: m.senderName,
        audience_type: m.audience.type,
        audience_id: m.audience.id,
        audience_label: m.audienceLabel,
        subject: m.subject,
        body: m.body,
        urgent: m.urgent,
      });
      if (!error) return { duplicate: false };
      if (error.code === "23505") {
        const { data, error: readError } = await service
          .from("mem_messages")
          .select("id")
          .eq("request_id", m.requestId)
          .maybeSingle();
        if (readError) throw new Error(`duplicate message lookup failed: ${readError.message}`);
        if (data) return { duplicate: true, id: data.id as string };
      }
      throw new Error(`message insert failed: ${error.message}`);
    },

    async insertRecipients(messageId, recipients) {
      if (recipients.length === 0) return;
      const { error } = await service.from("mem_message_recipients").insert(
        recipients.map((r) => ({
          message_id: messageId,
          account_id: r.accountId,
          participant_names: r.participantNames,
        }))
      );
      if (error) throw new Error(`recipient insert failed: ${error.message}`);
    },

    async accountEmails(accountIds) {
      const accounts = await inChunks(accountIds, async (part) => {
        const { data, error } = await service.from("mem_accounts").select("id, user_id").in("id", part);
        if (error) throw new Error(`account read failed: ${error.message}`);
        return (data ?? []) as { id: string; user_id: string | null }[];
      });
      const emails = new Map<string, string>();
      await eachLimited(accounts, 10, async (a) => {
        if (!a.user_id) return;
        const { data, error } = await service.auth.admin.getUserById(a.user_id);
        if (error) throw new Error(`login lookup failed: ${error.message}`);
        if (data.user?.email) emails.set(a.id, data.user.email);
      });
      return emails;
    },

    async recordEmail(messageId, records) {
      await eachLimited(records, 10, async (r) => {
        const { error } = await service
          .from("mem_message_recipients")
          .update({ email_status: r.status, email_id: r.emailId ?? null, email_error: r.error ?? null })
          .eq("message_id", messageId)
          .eq("account_id", r.accountId);
        if (error) throw new Error(`email result save failed: ${error.message}`);
      });
    },

    async subscriptions(accountIds) {
      const rows = await inChunks(accountIds, async (part) => {
        const { data, error } = await service
          .from("mem_push_subscriptions")
          .select("id, account_id, endpoint, p256dh, auth")
          .in("account_id", part);
        if (error) throw new Error(`subscription read failed: ${error.message}`);
        return data ?? [];
      });
      return rows.map(
        (r): Subscription => ({
          id: r.id as string,
          accountId: r.account_id as string,
          endpoint: r.endpoint as string,
          p256dh: r.p256dh as string,
          auth: r.auth as string,
        })
      );
    },

    async deleteSubscriptions(ids) {
      for (const part of chunk(ids, 100)) {
        const { error } = await service.from("mem_push_subscriptions").delete().in("id", part);
        if (error) throw new Error(`subscription delete failed: ${error.message}`);
      }
    },

    async recordPush(messageId, sentByAccount, usedSubscriptionIds) {
      await eachLimited([...sentByAccount], 10, async ([accountId, count]) => {
        const { error } = await service
          .from("mem_message_recipients")
          .update({ push_sent_count: count })
          .eq("message_id", messageId)
          .eq("account_id", accountId);
        if (error) throw new Error(`push count save failed: ${error.message}`);
      });
      for (const part of chunk(usedSubscriptionIds, 100)) {
        const { error } = await service
          .from("mem_push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .in("id", part);
        if (error) throw new Error(`subscription touch failed: ${error.message}`);
      }
    },
  };
}

export function createSendDeps(): SendDeps {
  return { store: createMessageStore(), sendBatch: sendEmailBatch, sendPush };
}
