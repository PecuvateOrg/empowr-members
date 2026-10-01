"use client";

import { useState } from "react";
import {
  AgeLabel,
  EmergencyContactLine,
  MedicalNotesBlock,
  WaiverBadge,
} from "@/components/admin/ParticipantSafetyInfo";
import type { EmergencyContactStatus } from "@/lib/register-emergency-contact";

export type CheckinAttendee = {
  placeId: string;
  name: string;
  age: number | null;
  isBirthdayPerson: boolean;
  equipment: string;
  waiverSigned: boolean;
  medicalNotes: string | null;
  emergencyContact: EmergencyContactStatus;
  checkedInAt: string | null;
};

export function PrivateCheckinList({ attendees }: { attendees: CheckinAttendee[] }) {
  const [query, setQuery] = useState("");
  const [checkedIn, setCheckedIn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(attendees.map((a) => [a.placeId, a.checkedInAt !== null]))
  );
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const shown = attendees.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));
  const count = Object.values(checkedIn).filter(Boolean).length;

  async function toggle(placeId: string, next: boolean) {
    setPending(placeId);
    setFailed(null);
    const res = await fetch(`/api/admin/private-bookings/places/${placeId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked_in: next }),
    }).catch(() => null);
    if (res?.ok) setCheckedIn((c) => ({ ...c, [placeId]: next }));
    else setFailed(placeId);
    setPending(null);
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-black">
          Checked in {count} of {attendees.length}
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search attendees by name"
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-black"
        />
      </div>

      {attendees.length === 0 ? (
        <p className="mt-4 text-sm text-mid">Nobody has registered yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {shown.map((a) => {
            const isIn = checkedIn[a.placeId];
            return (
              <li key={a.placeId} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-black">{a.name}</span>
                    {a.isBirthdayPerson && <span className="text-sm font-bold text-blue">Birthday person</span>}
                    <AgeLabel age={a.age} />
                    <WaiverBadge signed={a.waiverSigned} />
                  </div>
                  <button
                    type="button"
                    disabled={pending === a.placeId}
                    onClick={() => void toggle(a.placeId, !isIn)}
                    className={`rounded-full px-4 py-1.5 text-sm font-extrabold disabled:opacity-50 ${
                      isIn ? "border border-line text-black" : "bg-blue text-white"
                    }`}
                  >
                    {pending === a.placeId ? "…" : isIn ? "Undo check-in" : "Check in"}
                  </button>
                </div>
                <p className="text-sm text-mid">{a.equipment}</p>
                <div className="text-sm">
                  <EmergencyContactLine contact={a.emergencyContact} />
                </div>
                <MedicalNotesBlock notes={a.medicalNotes} />
                {failed === a.placeId && (
                  <p role="alert" className="text-sm font-bold text-red-dark">
                    Could not update — check the connection and try again.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
