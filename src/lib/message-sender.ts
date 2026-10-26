// Who is sending a message, and as what. Admin = ADMIN_EMAILS; coach = CHECKIN_EMAILS only; an email on
// both lists is an admin (getAuthedCheckinStaff accepts either, so admin is tested first).
import "server-only";
import type { User } from "@supabase/supabase-js";
import { getAuthedCheckinStaff, isAdminEmail } from "@/lib/admin";
import { senderIdentity, type SenderIdentity, type SenderRole } from "@/lib/message-core";
import { createServiceClient } from "@/lib/supabase/service";

export type MessageSender = { user: User; role: SenderRole; identity: SenderIdentity };

/** The signed-in staff member, their role and the identity families will see; null when not staff. */
export async function getMessageSender(): Promise<MessageSender | null> {
  const user = await getAuthedCheckinStaff();
  if (!user) return null;
  const role: SenderRole = isAdminEmail(user.email) ? "admin" : "coach";
  if (role === "admin") return { user, role, identity: senderIdentity(role, null) };

  // A coach's name is their own account name, read here so it can never be typed in by the sender.
  const { data, error } = await createServiceClient()
    .from("mem_accounts")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("coach name read failed", user.id, error);
    throw new Error("coach_name_read_failed");
  }
  return { user, role, identity: senderIdentity(role, (data?.name as string | undefined) ?? null) };
}
