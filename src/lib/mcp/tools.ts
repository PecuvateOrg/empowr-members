// The tools an AI client can call through /api/mcp (planning/spec/agent-access.md): reads (step 1)
// and the two-step message send (step 2), which goes through the same audience gate, identity and
// send code as the messages screen.
// Each tool calls the same server code as the matching screen, so the rules cannot drift, and each
// names the roles allowed to use it. What leaves here goes into a third-party AI tool, so tools return
// LESS than the screen where the screen holds health or contact data: the register says whether a
// skater has medical notes or a usable emergency contact, never the notes or the number.
import "server-only";
import { z } from "zod";
import {
  getRegister,
  listAdminOccurrences,
  listAdminOfferings,
  listAdminVenues,
  listUpcomingOccurrencesForDashboard,
} from "@/lib/admin-data";
import { createOccurrence, updateOccurrence } from "@/lib/occurrence-admin";
import { cancelOccurrence } from "@/lib/occurrence-cancel";
import { occurrenceSchema } from "@/lib/validation";
import { KIND_LABELS, formatPrivateSlot, privateBlockSchema, type PrivateKind } from "@/lib/private-bookings";
import { listPrivateAvailability } from "@/lib/private-bookings-server";
import { blockPrivateSlot, unblockPrivateSlot } from "@/lib/private-blocks";
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
  CANCELS_PER_HOUR,
  MAX_REFUND_PENCE,
  MAX_CREDIT_PENCE,
} from "@/lib/mcp/actions";
import { createServiceClient } from "@/lib/supabase/service";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";
import { getContactMessage, listContactMessages } from "@/lib/contact-inbox";
import { ReplyError, replyToContact } from "@/lib/contact-reply";
import { creditFields, creditFieldsProblem, issueCredit, memberCreditRecords } from "@/lib/credit-issue";
import { creditExpiry, refundBooking } from "@/lib/credits";
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

const offeringInput = z.object({ offering_id: z.uuid().describe("An offering id from list_offerings.") });

const isoTime = z.iso.datetime({ offset: true }).describe("ISO 8601 with the UK offset, e.g. 2026-11-14T10:00:00+00:00 (BST is +01:00).");
const dateFields = {
  starts_at: isoTime,
  ends_at: isoTime,
  venue_id: z.uuid().nullable().describe("From list_venues; null uses the offering's default."),
  capacity: z.number().int().min(1).nullable().describe("Places; null = the venue's default."),
  early_bird_capacity: z.number().int().min(0).nullable().describe("Early-bird places, part of capacity; null = no early bird."),
};
const addDateInput = z.object({
  offering_id: z.uuid(),
  course_run_id: z.uuid().nullable().default(null).describe("Only for a session inside a course run."),
  ...dateFields,
});
const updateDateInput = z.object({
  session_id: z.uuid().describe("A date id from list_dates or list_sessions."),
  starts_at: dateFields.starts_at.optional(),
  ends_at: dateFields.ends_at.optional(),
  venue_id: dateFields.venue_id.optional(),
  capacity: dateFields.capacity.optional(),
  early_bird_capacity: dateFields.early_bird_capacity.optional(),
}).describe("Only the fields to change.");

const previewCancelInput = z.object({
  session_id: z.uuid(),
  outcome: z.enum(["credit", "refund"]).default("credit").describe(
    "'credit' (default): paid bookings get account credit. 'refund': paid bookings are refunded to the card they paid with (any part paid with credit comes back as credit). Subscribers always get credit."
  ),
  reason: z.string().trim().max(500).optional().describe("Shown to families in the cancellation email."),
  sessions_in_month: z.union([z.literal(4), z.literal(5)]).default(4).describe("How many sessions the month has, for subscribers' pro-rata credit."),
});
const cancelInput = z.object({
  preview_id: z.uuid().describe("The preview_id returned by preview_cancel_session."),
  expected_bookings: z.number().int().min(0).describe("The confirmed bookings count the preview showed."),
});

/** Run a screen handler and turn its HTTP answer into a tool result or refusal. */
async function screenCall(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ToolRefusal(typeof body.error === "string" ? body.error : "That did not work.");
  return body;
}

const londonDate = z.iso.date().describe("A date, YYYY-MM-DD.");
const privateRangeInput = z.object({ from: londonDate, to: londonDate.optional() });
const blockInput = privateBlockSchema.extend({
  starts_at: isoTime,
  hours: z.union([z.literal(1), z.literal(2)]).describe("1 or 2 hours."),
  note: z.string().trim().max(500).optional().describe("Internal reason; customers never see it."),
});
const unblockInput = z.object({ block_id: z.uuid().describe("A block's id from list_private_bookings (kind 'block').") });

const retryRefundInput = z.object({
  booking_id: z.uuid().describe("A booking with a refund still pending, from get_member_credit's refunds."),
  account_id: z.uuid(),
});

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

type StoredPreview = { audience: Audience; subject: string; body: string; urgent: boolean };

const inboxListInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  only_open: z.boolean().default(true).describe("Only messages not yet replied to or closed."),
});
const inboxReplyInput = z.object({
  message_id: z.uuid().describe("An id from list_inbox."),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(5000),
});
const inboxSendInput = z.object({
  preview_id: z.uuid().describe("The preview_id returned by preview_inbox_reply."),
});

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

  list_offerings: {
    description: "Every session type, course, camp and event, with id, type, price (pence) and whether it is active.",
    roles: ["admin"],
    input: z.object({}),
    run: async () =>
      (await listAdminOfferings()).map((o) => ({ id: o.id, title: o.title, type: o.type, price_pence: o.price_pence, active: o.active })),
  },

  list_venues: {
    description: "Venues, with ids for add_date / update_date.",
    roles: ["admin"],
    input: z.object({}),
    run: async () => listAdminVenues(),
  },

  list_dates: {
    description: "Every date of one offering (past and future), with capacity, early-bird places, status and booking tallies.",
    roles: ["admin"],
    input: offeringInput,
    run: async (args: z.infer<typeof offeringInput>) =>
      (await listAdminOccurrences(args.offering_id)).map((o) => ({ ...o, when: formatOccurrence(o.starts_at, o.ends_at) })),
  },

  add_date: {
    description:
      "Add a date to an offering. It goes on sale straight away (subscribers are added overnight). Confirm the day, times, venue and places with the person first. A date with no bookings can be removed on the offerings screen.",
    roles: ["admin"],
    input: addDateInput,
    run: async (args: z.infer<typeof addDateInput>, caller) => {
      const input = occurrenceSchema.safeParse(args);
      if (!input.success) throw new ToolRefusal(input.error.issues[0]?.message ?? "Check the date details.");
      try {
        const result = await screenCall(await createOccurrence(input.data));
        await logAction(caller, "add_date", args, { when: formatOccurrence(args.starts_at, args.ends_at), occurrence: result.occurrence }, true);
        return result;
      } catch (err) {
        if (err instanceof ToolRefusal) await logAction(caller, "add_date", args, { error: err.message }, false);
        throw err;
      }
    },
  },

  update_date: {
    description:
      "Change a date's times, venue, capacity or early-bird places. Families already booked are NOT told automatically; offer to message them (preview_message) if the time or venue changes. Confirm the change with the person first.",
    roles: ["admin"],
    input: updateDateInput,
    run: async (args: z.infer<typeof updateDateInput>, caller) => {
      const { data: current, error } = await createServiceClient()
        .from("mem_occurrences")
        .select("offering_id, course_run_id, starts_at, ends_at, venue_id, capacity, early_bird_capacity, status")
        .eq("id", args.session_id)
        .maybeSingle();
      if (error) throw new Error(`date read failed: ${error.message}`);
      if (!current) throw new ToolRefusal("That date could not be found.");
      if (current.status !== "scheduled") throw new ToolRefusal("Only a scheduled date can be changed.");
      const { session_id, ...changes } = args;
      const input = occurrenceSchema.safeParse({
        offering_id: current.offering_id,
        course_run_id: current.course_run_id,
        starts_at: current.starts_at,
        ends_at: current.ends_at,
        venue_id: current.venue_id,
        capacity: current.capacity,
        early_bird_capacity: current.early_bird_capacity,
        ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
      });
      if (!input.success) throw new ToolRefusal(input.error.issues[0]?.message ?? "Check the date details.");
      const before = { starts_at: current.starts_at, ends_at: current.ends_at, venue_id: current.venue_id, capacity: current.capacity, early_bird_capacity: current.early_bird_capacity };
      try {
        const result = await screenCall(await updateOccurrence(session_id, input.data));
        await logAction(caller, "update_date", args, { when: formatOccurrence(input.data.starts_at, input.data.ends_at), before, changes }, true);
        return result;
      } catch (err) {
        if (err instanceof ToolRefusal) await logAction(caller, "update_date", args, { error: err.message }, false);
        throw err;
      }
    },
  },

  preview_cancel_session: {
    description:
      `Step 1 of 2 for Empowr cancelling a session. Nothing changes. Shows who is booked and what happens: every paid booking gets account credit (or, with outcome 'refund', its money back to the card, at most ${pounds(MAX_REFUND_PENCE)} per session), subscribers get their pro-rata credit, free bookings and unpaid holds are released, and each family is emailed. Returns a preview_id valid for ${PREVIEW_TTL_MINUTES} minutes; show the person and only call cancel_session once they say yes.`,
    roles: ["admin"],
    input: previewCancelInput,
    run: async (args: z.infer<typeof previewCancelInput>, caller) => {
      const db = createServiceClient();
      const { data: occ, error } = await db
        .from("mem_occurrences")
        .select("starts_at, ends_at, status, offering:mem_offerings(title)")
        .eq("id", args.session_id)
        .maybeSingle();
      if (error) throw new Error(`date read failed: ${error.message}`);
      if (!occ) throw new ToolRefusal("That session could not be found.");
      const o = occ as unknown as { starts_at: string; ends_at: string; status: string; offering: { title: string } | null };
      if (o.status === "cancelled_by_empowr") throw new ToolRefusal("This session is already cancelled.");
      const { data: rows, error: be } = await db
        .from("mem_bookings")
        .select("account_id, status, source, price_paid_pence")
        .eq("occurrence_id", args.session_id)
        .in("status", ["confirmed", "pending_payment"]);
      if (be) throw new Error(`bookings read failed: ${be.message}`);
      const bookings = rows ?? [];
      const confirmed = bookings.filter((b) => b.status === "confirmed");
      const paid = confirmed.filter((b) => (b.price_paid_pence ?? 0) > 0);
      const result = {
        session: `${o.offering?.title ?? "Session"} - ${formatOccurrence(o.starts_at, o.ends_at)}`,
        confirmed_bookings: confirmed.length,
        families: new Set(confirmed.map((b) => b.account_id)).size,
        paid_bookings: paid.length,
        credit_for_paid_pence: paid.reduce((t, b) => t + (b.price_paid_pence ?? 0), 0),
        subscriber_bookings: confirmed.filter((b) => b.source === "member" && !b.price_paid_pence).length,
        free_bookings: confirmed.filter((b) => !(b.source === "member") && !b.price_paid_pence).length,
        unpaid_holds_released: bookings.length - confirmed.length,
        outcome: args.outcome,
      };
      if (args.outcome === "refund" && result.credit_for_paid_pence > MAX_REFUND_PENCE) {
        throw new ToolRefusal(`That would refund up to ${pounds(result.credit_for_paid_pence)}; AI tools can refund at most ${pounds(MAX_REFUND_PENCE)} per session. Use the offerings screen.`);
      }
      const previewId = await logAction(caller, "preview_cancel_session", args, result, true);
      return {
        preview_id: previewId,
        ...result,
        [args.outcome === "refund" ? "refund_up_to" : "credit_for_paid"]: pounds(result.credit_for_paid_pence),
        reason: args.reason ?? null,
      };
    },
  },

  cancel_session: {
    description:
      `Step 2 of 2: cancels the session from a preview_cancel_session call made in the last ${PREVIEW_TTL_MINUTES} minutes, after the person has said yes. Cannot be undone: the session comes off sale, credit or card refunds are issued and families are emailed. At most ${CANCELS_PER_HOUR} an hour per person.`,
    roles: ["admin"],
    input: cancelInput,
    run: async (args: z.infer<typeof cancelInput>, caller) => {
      const preview = await findPreview(caller, args.preview_id, "preview_cancel_session");
      if (!preview) throw new ToolRefusal(`No cancellation preview with that id from you in the last ${PREVIEW_TTL_MINUTES} minutes. Call preview_cancel_session again.`);
      if (preview.result.confirmed_bookings !== args.expected_bookings) {
        throw new ToolRefusal(`The preview showed ${String(preview.result.confirmed_bookings)} bookings, not ${args.expected_bookings}. Show the person the preview again.`);
      }
      const p = previewCancelInput.parse(preview.input);
      if ((await actionsInLastHour(caller, "cancel_session")) >= CANCELS_PER_HOUR) {
        throw new ToolRefusal(`You have cancelled ${CANCELS_PER_HOUR} sessions through an AI tool in the last hour. Wait, or use the offerings screen.`);
      }
      const { count, error } = await createServiceClient()
        .from("mem_bookings")
        .select("id", { count: "exact", head: true })
        .eq("occurrence_id", p.session_id)
        .eq("status", "confirmed");
      if (error) throw new Error(`bookings read failed: ${error.message}`);
      if (count !== preview.result.confirmed_bookings) {
        throw new ToolRefusal(`Bookings changed since the preview (now ${count}). Call preview_cancel_session again and show the person.`);
      }
      const input = { preview_id: args.preview_id, expected_bookings: args.expected_bookings };
      try {
        const result = await screenCall(
          await cancelOccurrence(p.session_id, { outcome: p.outcome, reason: p.reason ?? null, sessions_in_month: p.sessions_in_month }, caller.user.id)
        );
        await logAction(caller, "cancel_session", input, { ...preview.result, ...result }, true);
        return { cancelled: preview.result.session, ...result };
      } catch (err) {
        if (err instanceof ToolRefusal) await logAction(caller, "cancel_session", input, { ...preview.result, error: err.message }, false);
        throw err;
      }
    },
  },

  list_private_bookings: {
    description:
      "Private bookings (birthdays, private coaching) and staff blocks on the Saturday 3-5pm slot, from a date (and optionally to one), with host, places, price and internal note.",
    roles: ["admin"],
    input: privateRangeInput,
    run: async (args: z.infer<typeof privateRangeInput>) => {
      let query = createServiceClient()
        .from("mem_private_bookings")
        .select("id, kind, status, source, starts_at, ends_at, total_places, price_pence, payment_handling, note, host:mem_accounts(name), places:mem_private_booking_places(count)")
        .in("status", ["pending_payment", "confirmed"])
        .gte("starts_at", `${args.from}T00:00:00Z`)
        .order("starts_at")
        .limit(200);
      if (args.to) query = query.lte("starts_at", `${args.to}T23:59:59Z`);
      const { data, error } = await query;
      if (error) throw new Error(`private bookings read failed: ${error.message}`);
      return (data ?? []).map((r) => {
        const row = r as unknown as { id: string; kind: PrivateKind; status: string; source: string; starts_at: string; ends_at: string; total_places: number; price_pence: number; note: string | null; host: { name: string } | null; places: { count: number }[] };
        return {
          id: row.id,
          kind: row.kind,
          type: KIND_LABELS[row.kind] ?? row.kind,
          when: formatPrivateSlot(row.starts_at, row.ends_at),
          status: row.status,
          source: row.source,
          host: row.host?.name ?? null,
          places_filled: row.places?.[0]?.count ?? 0,
          total_places: row.total_places,
          price: pounds(row.price_pence ?? 0),
          note: row.note,
        };
      });
    },
  },

  private_availability: {
    description: "Free private-booking slots between two dates, by booking type and length, by the same rule online booking uses.",
    roles: ["admin"],
    input: z.object({ from: londonDate, to: londonDate }),
    run: async (args: { from: string; to: string }) =>
      (await listPrivateAvailability(args.from, args.to)).map((a) => ({ ...a, when: formatPrivateSlot(a.starts_at, a.ends_at) })),
  },

  block_private_slot: {
    description:
      "Mark 3-4pm, 4-5pm or 3-5pm on a Saturday unavailable for private bookings, with an internal reason. Refused if anything is already booked or blocked in that time; a paid booking is never overwritten. Confirm the date and time with the person first.",
    roles: ["admin"],
    input: blockInput,
    run: async (args: z.infer<typeof blockInput>, caller) => {
      const when = formatPrivateSlot(args.starts_at, new Date(new Date(args.starts_at).getTime() + args.hours * 3_600_000).toISOString());
      try {
        const result = await screenCall(await blockPrivateSlot(args, caller.user.id));
        await logAction(caller, "block_private_slot", args, { when, block: result.block }, true);
        return { blocked: when, ...result };
      } catch (err) {
        if (err instanceof ToolRefusal) await logAction(caller, "block_private_slot", args, { when, error: err.message }, false);
        throw err;
      }
    },
  },

  unblock_private_slot: {
    description: "Lift a staff block so the time can be booked again. Only works on blocks, never on a booking.",
    roles: ["admin"],
    input: unblockInput,
    run: async (args: z.infer<typeof unblockInput>, caller) => {
      const { data, error } = await createServiceClient().from("mem_private_bookings").select("starts_at, ends_at").eq("id", args.block_id).eq("kind", "block").maybeSingle();
      if (error) throw new Error(`block read failed: ${error.message}`);
      const when = data ? formatPrivateSlot(data.starts_at, data.ends_at) : null;
      try {
        const result = await screenCall(await unblockPrivateSlot(args.block_id));
        await logAction(caller, "unblock_private_slot", args, { when }, true);
        return { unblocked: when, ...result };
      } catch (err) {
        if (err instanceof ToolRefusal) await logAction(caller, "unblock_private_slot", args, { when, error: err.message }, false);
        throw err;
      }
    },
  },

  retry_refund: {
    description:
      "Finish a refund that was already approved but did not complete (it shows under refunds pending in get_member_credit). Never starts a new refund. Safe to repeat: Stripe pays it once.",
    roles: ["admin"],
    input: retryRefundInput,
    run: async (args: z.infer<typeof retryRefundInput>, caller) => {
      const { data, error } = await createServiceClient().from("mem_booking_refunds").select("booking_id, card_pence, credit_pence")
        .eq("booking_id", args.booking_id).eq("account_id", args.account_id).maybeSingle();
      if (error) throw new Error(`refund read failed: ${error.message}`);
      if (!data) throw new ToolRefusal("No pending refund found for that booking.");
      try {
        const result = await refundBooking(args.booking_id, args.account_id);
        await logAction(caller, "retry_refund", args, { card_pence: result.card_pence, credit_pence: result.credit_pence }, true);
        return { refunded_to_card: pounds(result.card_pence), returned_as_credit: pounds(result.credit_pence) };
      } catch (err) {
        const message = "Refund is still pending. Check Stripe before further action; retries after 23 hours require reconciliation.";
        await logAction(caller, "retry_refund", args, { error: String(err) }, false);
        throw new ToolRefusal(message);
      }
    },
  },

  // --- Admin Inbox (contact-form messages), 2026-11-02 -----------------------------------------
  // Contact data stays on the screen: the AI sees name, topic, text and linked skaters, never the
  // email address. Replies go through lib/contact-reply.ts, the same code as the Inbox screen.

  list_inbox: {
    description:
      "Messages members sent through the Members contact form (the admin Inbox), newest first: who, topic, their text, the skaters on their account, status and an id for preview_inbox_reply. Set only_open to skip ones already replied to or closed.",
    roles: ["admin"],
    input: inboxListInput,
    run: async (args: z.infer<typeof inboxListInput>) => {
      const all = await listContactMessages(args.limit);
      const rows = args.only_open ? all.filter((m) => m.status === "open") : all;
      const service = createServiceClient();
      const ids = [...new Set(rows.map((m) => m.account_id).filter((x): x is string => Boolean(x)))];
      const skaters = new Map<string, string[]>();
      if (ids.length) {
        const { data, error } = await service.from("mem_participants").select("account_id, name").in("account_id", ids);
        if (error) throw new Error(`participants read failed: ${error.message}`);
        for (const p of (data ?? []) as { account_id: string; name: string }[]) {
          if (p.name === "Deleted skater") continue;
          skaters.set(p.account_id, [...(skaters.get(p.account_id) ?? []), p.name]);
        }
      }
      return rows.map((m) => ({
        id: m.id,
        received: formatInTimeZone(m.created_at, TIMEZONE, "EEE d MMM yyyy, h:mmaaa"),
        from: m.name,
        topic: m.topic,
        message: m.body,
        signed_in: Boolean(m.account_id),
        skaters: m.account_id ? (skaters.get(m.account_id) ?? []) : [],
        status: m.status,
        unread: !m.read_at,
      }));
    },
  },

  preview_inbox_reply: {
    description:
      `Step 1 of 2 for replying to an Inbox message. Nothing is sent. Returns how it will reach them (their Members Notifications, email and phone alert if they were signed in; otherwise email only) and a preview_id valid for ${PREVIEW_TTL_MINUTES} minutes. Show the person the reply and only call send_inbox_reply once they have said yes.`,
    roles: ["admin"],
    input: inboxReplyInput,
    run: async (args: z.infer<typeof inboxReplyInput>, caller) => {
      const contact = await getContactMessage(args.message_id);
      if (!contact) throw new ToolRefusal("No Inbox message with that id. Call list_inbox.");
      const via = contact.account_id ? "their Members Notifications, email and a phone alert if they have alerts on" : "email only (they were not signed in)";
      const previewId = await logAction(caller, "preview_inbox_reply", args, { to: contact.name, via }, true);
      return {
        preview_id: previewId,
        to: contact.name,
        topic: contact.topic,
        via,
        already_replied: contact.status === "replied",
        subject: args.subject,
        body: args.body,
      };
    },
  },

  send_inbox_reply: {
    description:
      `Step 2 of 2: sends the exact reply from a preview_inbox_reply call made in the last ${PREVIEW_TTL_MINUTES} minutes and marks the message replied. Only call this after the person has seen the preview and said to send it. Shares the limit of ${SENDS_PER_HOUR} sends an hour per person. Sending the same preview twice sends once.`,
    roles: ["admin"],
    input: inboxSendInput,
    run: async (args: z.infer<typeof inboxSendInput>, caller) => {
      const preview = await findPreview(caller, args.preview_id, "preview_inbox_reply");
      if (!preview) throw new ToolRefusal(`No reply preview with that id from you in the last ${PREVIEW_TTL_MINUTES} minutes. Call preview_inbox_reply again.`);
      const sent = (await actionsInLastHour(caller, "send_message")) + (await actionsInLastHour(caller, "send_inbox_reply"));
      if (sent >= SENDS_PER_HOUR) throw new ToolRefusal(`You have sent ${SENDS_PER_HOUR} messages through an AI tool in the last hour. Wait, or use the Inbox screen.`);
      const m = preview.input as z.infer<typeof inboxReplyInput>;
      const contact = await getContactMessage(m.message_id);
      if (!contact) throw new ToolRefusal("That Inbox message no longer exists.");
      try {
        const result = await replyToContact(contact, caller.user, { requestId: args.preview_id, subject: m.subject, body: m.body });
        await logAction(caller, "send_inbox_reply", { preview_id: args.preview_id }, result, true);
        return { sent: true, to: contact.name, via: result.via === "account" ? "Members Notifications and email" : "email" };
      } catch (err) {
        if (err instanceof ReplyError) throw new ToolRefusal(err.message);
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
