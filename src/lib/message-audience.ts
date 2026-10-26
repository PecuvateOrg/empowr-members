// Member messaging - turn an audience into (a) a label and (b) the families it reaches, behind the role
// gate. Used by BOTH the preview and the send, so what staff confirm is what the server re-resolves.
//
// ORDER IS THE SECURITY PROPERTY: the role gate runs BEFORE any recipient is read, so a coach asking
// for an offering or an out-of-window session learns nothing about who is booked.
import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { formatOccurrence } from "@/lib/format";
import {
  authoriseAudience,
  type Audience,
  type RecipientPreview,
  type SenderRole,
} from "@/lib/message-core";

type Service = ReturnType<typeof createServiceClient>;

export type PreparedAudience =
  | { ok: true; label: string; recipients: RecipientPreview[] }
  | { ok: false; status: 403 | 404 | 500; error: string };

type Target = { label: string; startsAt: string | null };

async function loadTarget(service: Service, audience: Audience): Promise<Target | null> {
  if (audience.type === "occurrence") {
    const { data, error } = await service
      .from("mem_occurrences")
      .select("starts_at, ends_at, offering:mem_offerings(title)")
      .eq("id", audience.id)
      .maybeSingle();
    if (error) throw new Error(`occurrence read failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as { starts_at: string; ends_at: string; offering: { title: string } | null };
    return {
      label: `${row.offering?.title ?? "Session"} - ${formatOccurrence(row.starts_at, row.ends_at)}`,
      startsAt: row.starts_at,
    };
  }
  if (audience.type === "offering") {
    const { data, error } = await service.from("mem_offerings").select("title").eq("id", audience.id).maybeSingle();
    if (error) throw new Error(`offering read failed: ${error.message}`);
    return data ? { label: `${data.title as string} (all upcoming dates)`, startsAt: null } : null;
  }
  const { data, error } = await service.from("mem_accounts").select("id").eq("id", audience.id).maybeSingle();
  if (error) throw new Error(`account read failed: ${error.message}`);
  return data ? { label: "", startsAt: null } : null;
}

export async function prepareAudience(
  service: Service,
  role: SenderRole,
  audience: Audience,
  now: Date = new Date()
): Promise<PreparedAudience> {
  // A coach can only ever message one session; refuse everything else before touching the database.
  if (role === "coach" && audience.type !== "occurrence") {
    const gate = authoriseAudience(role, audience, null, now);
    if (!gate.ok) return gate;
  }
  try {
    const target = await loadTarget(service, audience);
    if (!target) return { ok: false, status: 404, error: "That audience could not be found." };
    const gate = authoriseAudience(role, audience, target.startsAt, now);
    if (!gate.ok) return gate;

    const { data, error } = await service.rpc("mem_message_audience", { p_type: audience.type, p_id: audience.id });
    if (error) throw new Error(`audience read failed: ${error.message}`);
    const recipients = ((data ?? []) as { account_id: string; account_name: string; participant_names: string[] }[]).map(
      (r) => ({ accountId: r.account_id, accountName: r.account_name, participantNames: r.participant_names ?? [] })
    );
    return { ok: true, label: target.label, recipients };
  } catch (err) {
    console.error("prepareAudience failed", audience, err);
    return { ok: false, status: 500, error: "Could not work out who this message would reach. Nothing was sent." };
  }
}
