// Server/job module. No server-only import: Lambda bundles this file too.
import { JWT } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { membersUrl } from "./links";

export type CalendarBooking = {
  id: string; kind: string; status: string; starts_at: string; ends_at: string;
  total_places: number; host: { name: string } | null;
  venue: { name: string } | null;
  places: { equipment: string; hire_size: string | null }[];
};
export const SOURCE = "members-private-bookings-v1";
export function calendarEventId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("calendar_invalid_booking_id");
  return `emp${id.replaceAll("-", "").toLowerCase()}`;
}
export function bookingEvent(b: CalendarBooking) {
  const names: Record<string,string> = { birthday: "Birthday party", coaching_one: "1:1 coaching", coaching_group: "Group coaching", custom: "Private event" };
  const counts = new Map<string,number>();
  for (const p of b.places) {
    const label = p.equipment === "gear" ? "Protective gear only" : p.equipment === "hire" ? `Skate hire ${p.hire_size ?? "size pending"}` : null;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return {
    id: calendarEventId(b.id), status: "confirmed",
    summary: b.kind === "block" ? "Unavailable" : `BOOKED: ${names[b.kind] ?? "Private booking"} — ${b.total_places} skaters`,
    // Internal notes can contain personal details: never copy them to Calendar.
    description: [b.kind === "block" ? "Blocked in Members." : `Organiser: ${b.host?.name || "Awaiting organiser registration"}`,
      ...Array.from(counts).sort(([a],[c])=>a.localeCompare(c)).map(([label,n])=>`${label}: ${n}`),
      `Manage in Members: ${membersUrl(b.kind === "block" ? "/admin/private-bookings" : `/checkin/private/${b.id}`)}`,
      "Calendar edits do not change the booking. Make changes in Members."].join("\n"),
    location: b.venue?.name ?? "",
    start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: "Europe/London" },
    end: { dateTime: new Date(b.ends_at).toISOString(), timeZone: "Europe/London" },
    extendedProperties: { private: { source: SOURCE, bookingId: b.id } },
    reminders: { useDefault: false },
  };
}
type Event = ReturnType<typeof bookingEvent>;
export type RemoteEvent = Partial<Event> & { etag?: string };
export interface CalendarTransport {
  request(method: string, path: string, body?: unknown, etag?: string): Promise<{ status: number; body: RemoteEvent }>;
}
export function googleTransport(calendarId: string, keyJson: string): CalendarTransport {
  const key = JSON.parse(keyJson) as { client_email?: string; private_key?: string };
  if (!key.client_email || !key.private_key) throw new Error("calendar_credentials_missing");
  const auth = new JWT({ email: key.client_email, key: key.private_key, scopes: ["https://www.googleapis.com/auth/calendar.events"] });
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return { async request(method,path,body,etag) {
    const token = await auth.getAccessToken();
    if (!token.token) throw new Error("calendar_auth_failed");
    const response = await fetch(`${base}${path}${method === "GET" ? "" : "?sendUpdates=none"}`, {
      method, headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, body: response.status === 200 ? await response.json() as RemoteEvent : {} };
  } };
}
function requireSuccess(status: number) {
  if (status < 200 || status >= 300) throw new Error(`calendar_http_${status}`);
}
export async function syncBooking(b: CalendarBooking, transport: CalendarTransport): Promise<void> {
  const path = `/${calendarEventId(b.id)}`;
  const existing = await transport.request("GET",path);
  if (![200,404,410].includes(existing.status)) requireSuccess(existing.status);
  if (existing.status === 200 && existing.body.status !== "cancelled" && existing.body.extendedProperties?.private?.source !== SOURCE) {
    throw new Error("calendar_event_ownership_mismatch");
  }
  if (b.status !== "confirmed") {
    if (existing.status !== 200 || existing.body.status === "cancelled") return;
    const deleted = await transport.request("DELETE",path,undefined,existing.body.etag);
    if (![404,410].includes(deleted.status)) requireSuccess(deleted.status);
    return;
  }
  const desired = bookingEvent(b);
  if (existing.status === 200) {
    const same = Object.keys(desired).every(k => JSON.stringify(existing.body[k as keyof Event]) === JSON.stringify(desired[k as keyof Event]));
    if (same) return;
    requireSuccess((await transport.request("PUT",path,desired,existing.body.etag)).status);
  } else {
    const created = await transport.request("POST","",desired);
    // Concurrent create / Google tombstone: retry from GET on the next run.
    // Never generate a different ID, which could duplicate a paid booking.
    requireSuccess(created.status);
  }
}

export async function syncPrivateCalendar(service: SupabaseClient, transport: CalendarTransport, now = new Date()) {
  let cursor: string | null = null;
  let synced = 0;
  let failed = 0;
  // Keyset pagination avoids the default 1000-row cap and includes cancelled
  // bookings so removing a booking in Members removes its Calendar event.
  for (;;) {
    let query = service.from("mem_private_bookings").select(
      "id,kind,status,starts_at,ends_at,total_places,host:mem_accounts!host_account_id(name),venue:mem_venues(name),places:mem_private_booking_places(equipment,hire_size)"
    ).gte("ends_at",now.toISOString()).order("id").limit(100);
    if (cursor) query = query.gt("id",cursor);
    const { data, error } = await query;
    if (error) throw new Error("calendar_booking_read_failed");
    const rows = (data ?? []) as unknown as CalendarBooking[];
    if (!rows.length) break;
    for (const row of rows) {
      // Pending holds have never been published and must not appear in Calendar.
      if (row.status === "pending_payment") continue;
      try { await syncBooking(row,transport); synced++; }
      catch { failed++; } // No customer details, tokens or Google response bodies in logs.
    }
    cursor = rows[rows.length-1].id;
  }
  return { synced, failed };
}
