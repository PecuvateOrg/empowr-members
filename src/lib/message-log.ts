// Reads behind the staff messaging screens: the pickers on the composer and the sent log. Server-only,
// service client. Every read throws on error - an empty log must mean "nothing sent yet", never "the
// database did not answer".
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { listUpcomingOccurrencesForDashboard } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";
import {
  authoriseAudience,
  COACH_WINDOW_DAYS,
  chunk,
  type OfferingOption,
  type SenderRole,
  type SessionOption,
} from "@/lib/message-core";

/** Sessions the sender may pick. The coach list is filtered through the SAME gate the API applies. */
export async function listMessageSessions(role: SenderRole, now: Date = new Date()): Promise<SessionOption[]> {
  const days = role === "coach" ? COACH_WINDOW_DAYS + 1 : 60;
  const occurrences = await listUpcomingOccurrencesForDashboard(days, true);
  return occurrences
    .filter((o) => authoriseAudience(role, { type: "occurrence", id: o.id }, o.starts_at, now).ok)
    .map((o) => ({
      id: o.id,
      label: `${o.offering?.title ?? "Session"} - ${formatOccurrence(o.starts_at, o.ends_at)} (${o.booked_count} booked)`,
    }));
}

export async function listMessageOfferings(): Promise<OfferingOption[]> {
  const { data, error } = await createServiceClient()
    .from("mem_offerings")
    .select("id, title")
    .eq("active", true)
    .order("title");
  if (error) throw new Error(`offerings read failed: ${error.message}`);
  return (data ?? []) as OfferingOption[];
}

export type SentMessage = {
  id: string;
  createdAt: string;
  senderRole: "admin" | "coach";
  senderName: string;
  audienceType: "occurrence" | "offering" | "account";
  audienceLabel: string;
  subject: string;
  urgent: boolean;
  recipients: number;
  emailSent: number;
  emailFailed: number;
  emailPending: number;
  pushSent: number;
  read: number;
};

type MessageRow = {
  id: string;
  created_at: string;
  sender_role: "admin" | "coach";
  sender_name: string;
  audience_type: "occurrence" | "offering" | "account";
  audience_label: string;
  subject: string;
  body: string;
  urgent: boolean;
};
type RecipientRow = {
  message_id: string;
  account_id: string;
  email_status: "pending" | "sent" | "failed";
  email_error: string | null;
  push_sent_count: number;
  read_at: string | null;
};

const MESSAGE_COLUMNS = "id, created_at, sender_role, sender_name, audience_type, audience_label, subject, body, urgent";
const RECIPIENT_COLUMNS = "message_id, account_id, email_status, email_error, push_sent_count, read_at";

function summarise(m: MessageRow, rows: RecipientRow[]): SentMessage {
  return {
    id: m.id,
    createdAt: m.created_at,
    senderRole: m.sender_role,
    senderName: m.sender_name,
    audienceType: m.audience_type,
    audienceLabel: m.audience_label,
    subject: m.subject,
    urgent: m.urgent,
    recipients: rows.length,
    emailSent: rows.filter((r) => r.email_status === "sent").length,
    emailFailed: rows.filter((r) => r.email_status === "failed").length,
    emailPending: rows.filter((r) => r.email_status === "pending").length,
    pushSent: rows.reduce((n, r) => n + r.push_sent_count, 0),
    read: rows.filter((r) => r.read_at !== null).length,
  };
}

export async function listSentMessages(limit = 50): Promise<SentMessage[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`messages read failed: ${error.message}`);
  const messages = (data ?? []) as MessageRow[];
  const rows: RecipientRow[] = [];
  for (const part of chunk(messages.map((m) => m.id), 50)) {
    const { data: recipients, error: recipientError } = await service
      .from("mem_message_recipients")
      .select(RECIPIENT_COLUMNS)
      .in("message_id", part)
      .limit(5000);
    if (recipientError) throw new Error(`recipients read failed: ${recipientError.message}`);
    rows.push(...((recipients ?? []) as RecipientRow[]));
  }
  return messages.map((m) => summarise(m, rows.filter((r) => r.message_id === m.id)));
}

export type SentMessageDetail = SentMessage & {
  body: string;
  recipientRows: { accountId: string; name: string; participantNames: string[]; emailStatus: string; emailError: string | null; pushSent: number; readAt: string | null }[];
};

export async function getSentMessage(id: string): Promise<SentMessageDetail | null> {
  const service = createServiceClient();
  const { data, error } = await service.from("mem_messages").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`message read failed: ${error.message}`);
  if (!data) return null;
  const { data: recipients, error: recipientError } = await service
    .from("mem_message_recipients")
    .select(`${RECIPIENT_COLUMNS}, participant_names, account:mem_accounts(name)`)
    .eq("message_id", id)
    .limit(5000);
  if (recipientError) throw new Error(`recipients read failed: ${recipientError.message}`);
  const rows = (recipients ?? []) as unknown as (RecipientRow & { participant_names: string[]; account: { name: string } | null })[];
  const message = data as MessageRow;
  return {
    ...summarise(message, rows),
    body: message.body,
    recipientRows: rows
      .map((r) => ({
        accountId: r.account_id,
        name: r.account?.name ?? "(unknown)",
        participantNames: r.participant_names,
        emailStatus: r.email_status,
        emailError: r.email_error,
        pushSent: r.push_sent_count,
        readAt: r.read_at,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
