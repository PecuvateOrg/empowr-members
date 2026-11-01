// The tools an AI client can call through /api/mcp (planning/spec/agent-access.md, step 1: read only).
// Each tool calls the same server code as the matching screen, so the rules cannot drift, and each
// names the roles allowed to use it. What leaves here goes into a third-party AI tool, so tools return
// LESS than the screen where the screen holds health or contact data: the register says whether a
// skater has medical notes or a usable emergency contact, never the notes or the number.
import "server-only";
import { z } from "zod";
import { getRegister, listUpcomingOccurrencesForDashboard } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";
import { authoriseAudience, type SenderRole } from "@/lib/message-core";
import { listSentMessages } from "@/lib/message-log";
import { searchMembers } from "@/lib/member-search";
import type { McpCaller } from "@/lib/mcp/auth";

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
};

export function toolsFor(role: SenderRole) {
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.roles.includes(role))
    .map(([name, tool]) => ({ name, description: tool.description, inputSchema: z.toJSONSchema(tool.input) }));
}
