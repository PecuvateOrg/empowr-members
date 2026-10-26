// Request shapes for the staff messaging routes. Kept apart from message-core so zod never reaches a
// client bundle (the composer imports message-core for limits).
import { z } from "zod";
import { BODY_MAX, SUBJECT_MAX } from "@/lib/message-core";

export const audienceSchema = z.object({
  type: z.enum(["occurrence", "offering", "account"]),
  id: z.string().uuid(),
});

// Control characters other than newline/tab have no place in a subject or body (and a CR/LF in a
// subject is how header injection starts).
const noControls = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export const previewSchema = z.object({ audience: audienceSchema });

export const sendSchema = z.object({
  audience: audienceSchema,
  subject: z
    .string()
    .trim()
    .min(1, "Add a subject.")
    .max(SUBJECT_MAX, `Keep the subject to ${SUBJECT_MAX} characters.`)
    .refine((s) => !/[\r\n]/.test(s) && noControls(s), "The subject must be a single line of plain text."),
  body: z
    .string()
    .trim()
    .min(1, "Write a message.")
    .max(BODY_MAX, `Keep the message to ${BODY_MAX} characters.`)
    .refine(noControls, "The message contains characters that cannot be sent."),
  urgent: z.boolean(),
  /** Minted by the composer when the preview is shown; makes a double click or a retry send once. */
  request_id: z.string().uuid(),
  /** How many families the staff member saw in the preview. If the server now counts a different
   *  number (a booking changed in between) it refuses and asks for a fresh preview. */
  expected_count: z.number().int().min(0),
});
