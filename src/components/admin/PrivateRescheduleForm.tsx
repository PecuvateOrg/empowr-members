"use client";

// Admin: move a confirmed private booking to another valid slot (issue #204).
// The booking keeps its id, invite link, payment and guests; only the time
// moves. A staff hold on the new time is replaced only when chosen here — a
// customer booking is never moved aside.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { londonSlotIso } from "@/lib/private-bookings";
import { TIMEZONE } from "@/lib/business-rules";

const input = "rounded-xl border border-line bg-white px-3 py-2 text-black";

export type RescheduleHold = { id: string; starts_at: string; ends_at: string; note: string | null };

export function PrivateRescheduleButton({
  booking,
  holds,
}: {
  booking: { id: string; kind: string; starts_at: string; ends_at: string; hasHost: boolean };
  holds: RescheduleHold[];
}) {
  const router = useRouter();
  const hours = Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 3600000);
  // A 2-hour booking can only start at 3pm; a 1-hour one at 3pm or 4pm.
  const startHours = hours === 1 ? [15, 16] : [15];
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState(15);
  const [holdId, setHoldId] = useState("");
  const [reason, setReason] = useState("");
  const [blockOld, setBlockOld] = useState(false);
  const [oldNote, setOldNote] = useState("");
  const [notify, setNotify] = useState(booking.hasHost);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const newStart = date ? londonSlotIso(date, hour as 15 | 16) : null;
  const newEnd = newStart ? new Date(Date.parse(newStart) + hours * 3600000).toISOString() : null;
  // Only holds that overlap the chosen time can be replaced.
  const overlapping = newStart && newEnd
    ? holds.filter((h) => Date.parse(h.starts_at) < Date.parse(newEnd) && Date.parse(h.ends_at) > Date.parse(newStart))
    : [];
  const chosenHold = overlapping.some((h) => h.id === holdId) ? holdId : "";

  async function submit() {
    if (!newStart) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/private-bookings/${booking.id}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_starts_at: booking.starts_at,
          new_starts_at: newStart,
          reason: reason.trim(),
          replace_block_id: chosenHold || null,
          block_old_slot: blockOld,
          ...(blockOld ? { old_slot_note: oldNote.trim() } : {}),
          notify_host: booking.hasHost && notify,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const mail = notify && booking.hasHost
          ? body.hostNotified ? " The host has been emailed." : " The host email could not be sent — tell them yourself."
          : "";
        setMessage({ ok: true, text: `Moved.${mail}` });
        router.refresh();
      } else {
        setMessage({ ok: false, text: body.error ?? "Could not move this booking. Nothing was changed." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the server. Nothing was changed." });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-bold text-blue underline">
        Reschedule
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-3 w-full space-y-3 rounded-xl border border-line bg-blue-pale/30 p-4 text-sm"
    >
      <p className="font-bold text-black">
        Move this booking. Its invite link, payment and registered guests stay as they are.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-bold text-mid">
          New Saturday
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          Start
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={input}>
            {startHours.map((h) => (
              <option key={h} value={h}>
                {h === 15 ? "3pm" : "4pm"} ({hours} {hours === 1 ? "hour" : "hours"})
              </option>
            ))}
          </select>
        </label>
      </div>
      {overlapping.length > 0 && (
        <label className="flex flex-col gap-1 font-bold text-mid">
          A staff hold is on this time
          <select value={chosenHold} onChange={(e) => setHoldId(e.target.value)} className={input}>
            <option value="">Keep the hold (the move will be refused)</option>
            {overlapping.map((h) => (
              <option key={h.id} value={h.id}>
                Replace hold {formatInTimeZone(h.starts_at, TIMEZONE, "h")}–{formatInTimeZone(h.ends_at, TIMEZONE, "haaa")}
                {h.note ? ` — ${h.note}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 font-bold text-mid">
        Reason (staff only)
        <input required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
      </label>
      <label className="flex items-center gap-2 font-bold text-mid">
        <input type="checkbox" checked={blockOld} onChange={(e) => setBlockOld(e.target.checked)} />
        Keep the old time closed (for example, the venue is shut)
      </label>
      {blockOld && (
        <label className="flex flex-col gap-1 font-bold text-mid">
          Why the old time stays closed (staff only)
          <input required minLength={3} maxLength={300} value={oldNote} onChange={(e) => setOldNote(e.target.value)} className={input} />
        </label>
      )}
      {booking.hasHost ? (
        <label className="flex items-center gap-2 font-bold text-mid">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email the host the new time
        </label>
      ) : (
        <p className="font-semibold text-mid">No host account yet, so there is no one to email.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !newStart} className="rounded-full bg-blue px-5 py-2 font-extrabold text-white disabled:opacity-50">
          {busy ? "Moving…" : "Move booking"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-bold text-mid underline">
          Cancel
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "font-bold text-blue-dark" : "font-bold text-red-dark"}>
          {message.text}
        </p>
      )}
    </form>
  );
}
