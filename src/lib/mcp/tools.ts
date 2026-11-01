// The tools an AI client can call through /api/mcp (planning/spec/agent-access.md): reads (step 1)
// and the two-step message send (step 2), which goes through the same audience gate, identity and
// send code as the messages screen.
// Each tool calls the same server code as the matching screen, so the rules cannot drift, and each
// names the roles allowed to use it. What leaves here goes into a third-party AI tool, so tools return
// LESS than the screen where the screen holds health or contact data: the register says whether a
// skater has medical notes or a usable emergency contact, never the notes or the number.
import "server-only";
import { z } from "zod";
import { getRegister, listUpcomingOccurrencesForDashboard } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";
import { authoriseAudience, describeRecipients, SEGMENTS, type Audience, type SenderRole } from "@/lib/message-core";
import { prepareAudience } from "@/lib/message-audience";
import { listMessageOfferings, listSentMessages } from "@/lib/message-log";
import { audienceSchema, sendSchema } from "@/lib/message-schema";
import { sendMessage } from "@/lib/message-send";
import { messageSenderFor } from "@/lib/message-sender";
import { createSendDeps } from "@/lib/message-store";
import { searchMembers } from "@/lib/member-search";
import type { McpCaller } from "@/lib/mcp/auth";
import {
  findPreview,
  logAction,
  MAX_RECIPIENTS_PER_SEND,
  messageFingerprint,
  PREVIEW_TTL_MINUTES,
  SENDS_PER_HOUR,
  sendsInLastHour,
} from "@/lib/mcp/actions";
import { createServiceClient } from "@/lib/supabase/service";

/** A failure the caller should see as a tool error rather than a server fault. */
export class ToolRefusal extends Error {}

type Tool = {
  description: string;
  roles: SenderRole[];
  input: z.ZodObject;
  run: (args: never, caller: McpCaller) => Promise<unknown>;
};

const listSessionsInput = z.object({
  days: z.number().int().min(1).max(60).default(7).describe("How many days ahead (coaches: at most 7)."),
});

const registerInput = z.object({ session_id: z.uuid().describe("A session id from list_sessions.") });

const findMemberInput = z.object({
  query: z.string().min(2).max(100).describe("Any words from the account holder's name, email or phone, or a skater's name."),
});

const sentMessagesInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

const previewInput = sendSchema.pick({ audience: true, subject: true, body: true, urgent: true }).extend({
  audience: audienceSchema.describe(
    "Who to message: {type: 'occurrence', id: <session id from list_sessions>}, or for admins also 'offering', 'account' (id from find_member) or 'segment' (id from list_message_groups)."
  ),
  urgent: z.boolean().default(false).describe("Marks the message URGENT. Only for same-day changes such as a cancelled session."),
});

const sendInput = z.object({
  preview_id: z.uuid().describe("The preview_id returned by preview_message."),
  expected_count: z.number().int().min(1).describe("The number of families the preview said it reaches, as shown to the person."),
});

type StoredPreview = { audience: Audience; subject: string; body: string; urgent: boolean };

export const TOOLS: Record<string, Tool> = {
  list_sessions: {
    description:
      "Upcoming scheduled sessions, soonest first, with how many people are booked. Includes sessions that started in the last 24 hours.",
    roles: ["admin", "coach"],
    input: listSessionsInput,
    run: async (args: z.infer<typeof listSessionsInput>, caller) => {
      const now = new Date();
      const sessions = await listUpcomingOccurrencesForDashboard(caller.role === "coach" ? Math.min(args.days, 8) : args.days, true);
      return sessions
        .filter((o) => authoriseAudience(caller.role, { type: "occurrence", id: o.id }, o.starts_at, now).ok)
        .map((o) => ({
          id: o.id,
          title: o.offering?.title ?? "Session",
          when: formatOccurrence(o.starts_at, o.ends_at),
          starts_at: o.starts_at,
          booked: o.booked_count,
        }));
    },
  },

  get_register: {
    description:
      "Who is booked on one session: each skater's name, age, booking status, waiver, how they leave, and whether medical notes and a usable emergency contact are on file (open the register on the admin screen for the details themselves).",
    roles: ["admin", "coach"],
    input: registerInput,
    run: async (args: z.infer<typeof registerInput>, caller) => {
      const register = await getRegister(args.session_id);
      if (!register) throw new ToolRefusal("That session could not be found.");
      const gate = authoriseAudience(caller.role, { type: "occurrence", id: register.id }, register.starts_at);
      if (!gate.ok) throw new ToolRefusal(gate.error);
      return {
        title: register.offering?.title ?? "Session",
        when: formatOccurrence(register.starts_at, register.ends_at),
        status: register.status,
        capacity: register.capacity,
        bookings: register.bookings.map((b) => ({
          skater: b.participant?.name ?? null,
          age: b.age,
          status: b.status,
          source: b.source,
          waiver_signed: b.waiverSigned,
          leaves: b.departure.kind === "authorised" ? b.departure.label : b.departure.kind,
          has_medical_notes: Boolean(b.participant?.medical_notes?.trim()),
          emergency_contact_ok: b.emergencyContact.kind === "ok",
        })),
      };
    },
  },

  find_member: {
    description:
      "Find member accounts by any words from the account holder's name, email or phone, or a skater's name. Also says when someone signed a waiver but has no Members account.",
    roles: ["admin"],
    input: findMemberInput,
    run: async (args: z.infer<typeof findMemberInput>) => searchMembers(args.query),
  },

  list_sent_messages: {
    description: "Messages sent to families, newest first: who sent it, to whom, and how many were delivered and read.",
    roles: ["admin"],
    input: sentMessagesInput,
    run: async (args: z.infer<typeof sentMessagesInput>) => listSentMessages(args.limit),
  },

  list_message_groups: {
    description:
      "The fixed groups and courses an administrator can message, with their ids, for preview_message. (Single sessions come from list_sessions; single families from find_member.)",
    roles: ["admin"],
    input: z.object({}),
    run: async () => ({
      segments: SEGMENTS.map((g) => ({ id: g.id, label: g.label, audience_type: "segment" })),
      offerings: (await listMessageOfferings()).map((o) => ({ id: o.id, title: o.title, audience_type: "offering" })),
    }),
  },

  preview_message: {
    description:
      `Step 1 of 2 for messaging families (email, their Members inbox and a phone alert). Nothing is sent. Returns who it would reach and a preview_id valid for ${PREVIEW_TTL_MINUTES} minutes. Show the person the text, the sender name and the count, and only call send_message once they have said yes.`,
    roles: ["admin", "coach"],
    input: previewInput,
    run: async (args: z.infer<typeof previewInput>, caller) => {
      const sender = await messageSenderFor(caller.user, caller.role);
      if (!sender.identity.ok) throw new ToolRefusal(sender.identity.error);
      const prepared = await prepareAudience(createServiceClient(), caller.role, args.audience);
      if (!prepared.ok) throw new ToolRefusal(prepared.error);
      const count = prepared.recipients.length;
      if (count === 0) throw new ToolRefusal("Nobody is in that audience, so there is no one to message.");
      if (count > MAX_RECIPIENTS_PER_SEND) {
        throw new ToolRefusal(`That reaches ${count} families; AI tools can send to at most ${MAX_RECIPIENTS_PER_SEND} at once. Use the messages screen.`);
      }
      const summary = describeRecipients(prepared.recipients, args.audience.type);
      const previewId = await logAction(
        caller,
        "preview_message",
        { ...args, fingerprint: messageFingerprint(args) },
        { label: prepared.label, count, summary },
        true
      );
      return {
        preview_id: previewId,
        sending_as: sender.identity.senderName,
        to: prepared.label || summary,
        count,
        summary,
        urgent: args.urgent,
        subject: args.subject,
        body: args.body,
        recipients: prepared.recipients.map((r) => ({ family: r.accountName, skaters: r.participantNames })),
      };
    },
  },

  send_message: {
    description:
      `Step 2 of 2: sends the exact message from a preview_message call made in the last ${PREVIEW_TTL_MINUTES} minutes. Only call this after the person has seen the preview and said to send it. Limited to ${SENDS_PER_HOUR} sends an hour per person. Sending the same preview twice sends once.`,
    roles: ["admin", "coach"],
    input: sendInput,
    run: async (args: z.infer<typeof sendInput>, caller) => {
      const preview = await findPreview(caller, args.preview_id);
      if (!preview) throw new ToolRefusal(`No preview with that id from you in the last ${PREVIEW_TTL_MINUTES} minutes. Call preview_message again.`);
      if (preview.count !== args.expected_count) {
        throw new ToolRefusal(`The preview reached ${preview.count} families, not ${args.expected_count}. Show the person the preview again.`);
      }
      if ((await sendsInLastHour(caller)) >= SENDS_PER_HOUR) {
        throw new ToolRefusal(`You have sent ${SENDS_PER_HOUR} messages through an AI tool in the last hour. Wait, or use the messages screen.`);
      }
      const { data, error } = await createServiceClient()
        .from("mem_agent_actions")
        .select("input")
        .eq("id", args.preview_id)
        .single();
      if (error) throw new Error(`preview read failed: ${error.message}`);
      const m = data.input as StoredPreview;
      if (messageFingerprint(m) !== preview.fingerprint) throw new ToolRefusal("That preview could not be verified. Call preview_message again.");

      const sender = await messageSenderFor(caller.user, caller.role);
      if (!sender.identity.ok) throw new ToolRefusal(sender.identity.error);
      const prepared = await prepareAudience(createServiceClient(), caller.role, m.audience);
      if (!prepared.ok) throw new ToolRefusal(prepared.error);
      if (prepared.recipients.length !== preview.count) {
        throw new ToolRefusal(
          `Bookings changed since the preview: it now reaches ${describeRecipients(prepared.recipients, m.audience.type)}. Call preview_message again and show the person the new count.`
        );
      }

      const input = { preview_id: args.preview_id, expected_count: args.expected_count };
      try {
        const summary = await sendMessage(
          createSendDeps(),
          {
            id: crypto.randomUUID(),
            // The preview id makes a retried send a duplicate, which sendMessage refuses to send again.
            requestId: args.preview_id,
            senderUserId: caller.user.id,
            senderRole: caller.role,
            senderName: sender.identity.senderName,
            from: sender.identity.from,
            signOff: sender.identity.signOff,
            audience: m.audience,
            audienceLabel: prepared.label,
            subject: m.subject,
            body: m.body,
            urgent: m.urgent,
          },
          prepared.recipients
        );
        await logAction(caller, "send_message", input, summary, true);
        return summary;
      } catch (err) {
        await logAction(caller, "send_message", input, { error: String(err) }, false).catch(() => {});
        throw err;
      }
    },
  },
};

export function toolsFor(role: SenderRole) {
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.roles.includes(role))
    .map(([name, tool]) => ({ name, description: tool.description, inputSchema: z.toJSONSchema(tool.input) }));
}
