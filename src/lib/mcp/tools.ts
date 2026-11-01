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
  actionsInLastHour,
  CREDITS_PER_HOUR,
  MAX_CREDIT_PENCE,
} from "@/lib/mcp/actions";
import { createServiceClient } from "@/lib/supabase/service";
import { creditFields, creditFieldsProblem, issueCredit, memberCreditRecords } from "@/lib/credit-issue";
import { creditExpiry } from "@/lib/credits";
import { readSkateHireStock, setSkateHireStock, StockError, stockSchema } from "@/lib/skate-hire-admin";

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

const accountInput = z.object({ account_id: z.uuid().describe("A member account id from find_member.") });

const previewCreditInput = creditFields.extend({
  kind: creditFields.shape.kind.describe(
    "'general': an amount of goodwill credit. 'booking': cancels one of the member's paid confirmed bookings and credits what they paid. 'legacy': credit for a booking made on the old platform."
  ),
  amount_pence: creditFields.shape.amount_pence.describe("In pence (700 = £7). Not used for 'booking'."),
  reason: creditFields.shape.reason.describe("Why, for the staff record. Members do not see it."),
});

const issueCreditInput = z.object({
  preview_id: z.uuid().describe("The preview_id returned by preview_credit."),
  amount_pence: z.number().int().positive().describe("The amount the preview showed, as confirmed by the person."),
});

const setStockInput = z.object({
  sizes: stockSchema.shape.sizes.describe("Only the sizes to change: [{size: UK 3-10, quantity: pairs owned 0-100}]."),
});

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

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
      const preview = await findPreview(caller, args.preview_id, "preview_message");
      if (!preview) throw new ToolRefusal(`No preview with that id from you in the last ${PREVIEW_TTL_MINUTES} minutes. Call preview_message again.`);
      const previewCount = preview.result.count;
      if (previewCount !== args.expected_count) {
        throw new ToolRefusal(`The preview reached ${String(previewCount)} families, not ${args.expected_count}. Show the person the preview again.`);
      }
      if ((await actionsInLastHour(caller, "send_message")) >= SENDS_PER_HOUR) {
        throw new ToolRefusal(`You have sent ${SENDS_PER_HOUR} messages through an AI tool in the last hour. Wait, or use the messages screen.`);
      }
      const m = preview.input as StoredPreview & { fingerprint?: string };
      if (messageFingerprint(m) !== m.fingerprint) throw new ToolRefusal("That preview could not be verified. Call preview_message again.");

      const sender = await messageSenderFor(caller.user, caller.role);
      if (!sender.identity.ok) throw new ToolRefusal(sender.identity.error);
      const prepared = await prepareAudience(createServiceClient(), caller.role, m.audience);
      if (!prepared.ok) throw new ToolRefusal(prepared.error);
      if (prepared.recipients.length !== previewCount) {
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

  get_member_credit: {
    description:
      "One member's credit: balances with expiry and staff reasons, refunds still pending, and the paid confirmed bookings that could be cancelled for credit (with their booking ids).",
    roles: ["admin"],
    input: accountInput,
    run: async (args: z.infer<typeof accountInput>) => memberCreditRecords(args.account_id),
  },

  preview_credit: {
    description:
      `Step 1 of 2 for issuing credit. Nothing is issued. Returns exactly what would happen and a preview_id valid for ${PREVIEW_TTL_MINUTES} minutes. Show it to the person and only call issue_credit once they have said yes. AI tools can issue at most ${pounds(MAX_CREDIT_PENCE)} per credit.`,
    roles: ["admin"],
    input: previewCreditInput,
    run: async (args: z.infer<typeof previewCreditInput>, caller) => {
      const problem = creditFieldsProblem(args);
      if (problem) throw new ToolRefusal(problem);
      const db = createServiceClient();
      const { data: account, error: ae } = await db.from("mem_accounts").select("name").eq("id", args.account_id).maybeSingle();
      if (ae) throw new Error(`account read failed: ${ae.message}`);
      if (!account) throw new ToolRefusal("That member account could not be found.");

      let amount = args.amount_pence ?? 0;
      let what: string;
      if (args.kind === "booking") {
        const { data: b, error: be } = await db
          .from("mem_bookings")
          .select("status, price_paid_pence, account_id, participant:mem_participants(name), occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title)), course_run:mem_course_runs(label, offering:mem_offerings(title))")
          .eq("id", args.booking_id!)
          .maybeSingle();
        if (be) throw new Error(`booking read failed: ${be.message}`);
        const row = b as unknown as {
          status: string; price_paid_pence: number | null; account_id: string; participant: { name: string } | null;
          occurrence: { starts_at: string; ends_at: string; offering: { title: string } | null } | null;
          course_run: { label: string; offering: { title: string } | null } | null;
        } | null;
        if (!row || row.account_id !== args.account_id) throw new ToolRefusal("That booking is not on this member's account.");
        if (row.status !== "confirmed" || !row.price_paid_pence) throw new ToolRefusal("Only a paid, confirmed booking can be cancelled for credit.");
        amount = row.price_paid_pence;
        const session = row.occurrence
          ? `${row.occurrence.offering?.title ?? "Session"} on ${formatOccurrence(row.occurrence.starts_at, row.occurrence.ends_at)}`
          : `${row.course_run?.offering?.title ?? "Course"} (${row.course_run?.label ?? ""})`;
        what = `Cancel ${row.participant?.name ?? "the skater"}'s booking for ${session} and credit the ${pounds(amount)} they paid.`;
      } else if (args.kind === "legacy") {
        what = `Credit ${pounds(amount)} for an old-platform booking (${args.platform} ${args.reference}, ${args.session} on ${args.session_date}).`;
      } else {
        what = `Credit ${pounds(amount)}.`;
      }
      if (amount > MAX_CREDIT_PENCE) {
        throw new ToolRefusal(`That is ${pounds(amount)}; AI tools can issue at most ${pounds(MAX_CREDIT_PENCE)}. Use the credit notes screen.`);
      }
      const expires = creditExpiry();
      const result = { member: account.name, amount_pence: amount, what, expires };
      const previewId = await logAction(caller, "preview_credit", args, result, true);
      return { preview_id: previewId, ...result, reason: args.reason };
    },
  },

  issue_credit: {
    description:
      `Step 2 of 2: issues the exact credit from a preview_credit call made in the last ${PREVIEW_TTL_MINUTES} minutes, after the person has said yes. The member gets the credit straight away (and a booking credit cancels that booking). Limited to ${CREDITS_PER_HOUR} an hour per person. Issuing the same preview twice issues once.`,
    roles: ["admin"],
    input: issueCreditInput,
    run: async (args: z.infer<typeof issueCreditInput>, caller) => {
      const preview = await findPreview(caller, args.preview_id, "preview_credit");
      if (!preview) throw new ToolRefusal(`No credit preview with that id from you in the last ${PREVIEW_TTL_MINUTES} minutes. Call preview_credit again.`);
      if (preview.result.amount_pence !== args.amount_pence) {
        throw new ToolRefusal(`The preview was for ${pounds(Number(preview.result.amount_pence))}, not ${pounds(args.amount_pence)}. Show the person the preview again.`);
      }
      if ((await actionsInLastHour(caller, "issue_credit")) >= CREDITS_PER_HOUR) {
        throw new ToolRefusal(`You have issued ${CREDITS_PER_HOUR} credits through an AI tool in the last hour. Wait, or use the credit notes screen.`);
      }
      const fields = creditFields.parse(preview.input);
      const input = { preview_id: args.preview_id, amount_pence: args.amount_pence };
      // The preview id is the request id, so a retry returns the credit already issued.
      const result = await issueCredit(fields, args.preview_id, caller.user.id);
      await logAction(caller, "issue_credit", input, result.ok ? { ...preview.result, credit: result.credit } : { error: result.error }, result.ok);
      if (!result.ok) throw new ToolRefusal(result.error);
      return { issued: preview.result.what, member: preview.result.member, credit: result.credit };
    },
  },

  get_skate_hire_stock: {
    description:
      "Free skate hire: pairs owned per UK size (3-10), and how many are reserved on the next Skate Jam and SYNKRON8 dates and on current courses with free hire.",
    roles: ["admin"],
    input: z.object({}),
    run: async () => readSkateHireStock(),
  },

  set_skate_hire_stock: {
    description:
      "Change how many pairs are owned for one or more sizes. Takes effect for new bookings straight away; bookings already made keep their pair even if the count drops below them. Confirm the new numbers with the person first.",
    roles: ["admin"],
    input: setStockInput,
    run: async (args: z.infer<typeof setStockInput>, caller) => {
      const before = (await readSkateHireStock()).sizes;
      try {
        const after = await setSkateHireStock(args.sizes);
        const changes = args.sizes.map((r) => ({ size: r.size, from: before.find((b) => b.size === r.size)?.quantity ?? null, to: r.quantity }));
        await logAction(caller, "set_skate_hire_stock", args, { changes }, true);
        return { changes, sizes: after };
      } catch (err) {
        if (!(err instanceof StockError)) throw err;
        await logAction(caller, "set_skate_hire_stock", args, { error: err.message }, false);
        throw new ToolRefusal(err.message);
      }
    },
  },
};

export function toolsFor(role: SenderRole) {
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.roles.includes(role))
    .map(([name, tool]) => ({ name, description: tool.description, inputSchema: z.toJSONSchema(tool.input) }));
}
