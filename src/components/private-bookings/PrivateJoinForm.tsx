"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { HIRE_SIZES, type HireSize, type Equipment } from "@/lib/private-bookings";

type Participant = { id: string; name: string; waiverSigned: boolean; joined: boolean };

export function PrivateJoinForm({
  token,
  participants,
  birthdayPersonTaken,
  full,
}: {
  token: string;
  participants: Participant[];
  birthdayPersonTaken: boolean;
  full: boolean;
}) {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const [equipment, setEquipment] = useState<Equipment>("hire");
  const [hireSize, setHireSize] = useState<HireSize | "">("");
  const [isBirthdayPerson, setIsBirthdayPerson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const available = participants.filter((p) => !p.joined);
  const chosen = participants.find((p) => p.id === participantId);
  const canSubmit =
    !busy && !full && !!chosen && chosen.waiverSigned && (equipment !== "hire" || hireSize !== "");

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/private-bookings/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          participant_id: participantId,
          equipment,
          ...(equipment === "hire" ? { hire_size: hireSize } : {}),
          is_birthday_person: isBirthdayPerson,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: `${chosen?.name} is registered for this party. See you there!` });
        setParticipantId("");
        setIsBirthdayPerson(false);
        router.refresh();
      } else if (body.error === "waiver_required") {
        setMessage({ ok: false, text: "A signed waiver is needed before registering this skater." });
      } else {
        setMessage({ ok: false, text: body.error ?? "Something went wrong — please try again." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the server. Check your connection and try again." });
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      {participants.length > 0 && (
        // Every skater on the account with their status FOR THIS PARTY. Being
        // on the account, or having a signed waiver, is not the same as being
        // on the party register, and staff were left chasing parents who
        // believed otherwise (issue #194).
        <ul className="space-y-1 rounded-xl bg-blue-pale/40 p-3 text-sm text-black" aria-label="Your skaters for this party">
          {participants.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-x-3">
              <span className="font-bold">{p.name}</span>
              <span className={p.joined ? "font-bold text-blue-dark" : "text-mid"}>
                {p.joined
                  ? "Registered for this party"
                  : p.waiverSigned
                    ? "Not registered yet"
                    : "Not registered yet: needs a waiver"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {participants.length === 0 || available.length === 0 ? (
        <p className="text-sm text-mid">
          {participants.length === 0
            ? "Add your skater and sign their waiver under Your skaters below. They can then be registered here."
            : "All your skaters are registered. Other children are registered by their own parent or guardian, from their own account."}
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="join-skater" className="block text-sm font-bold text-mid">Skater</label>
            <select
              id="join-skater"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
            >
              <option value="">Choose a skater</option>
              {available.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.waiverSigned}>
                  {p.name}
                  {!p.waiverSigned ? " — needs a waiver" : ""}
                </option>
              ))}
            </select>
            {available.some((p) => !p.waiverSigned) && (
              <p className="mt-1 text-xs text-mid">
                A signed waiver is needed first. Sign it under Your skaters below.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="join-equipment" className="block text-sm font-bold text-mid">Equipment</label>
            <select
              id="join-equipment"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as Equipment)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
            >
              <option value="hire">Hire skates, pads and helmet (included)</option>
              <option value="gear">Pads and helmet only, own skates (included)</option>
              <option value="own">Bringing own skates and protective gear</option>
            </select>
          </div>

          {equipment === "hire" && (
            <div>
              <label htmlFor="join-size" className="block text-sm font-bold text-mid">Hire size</label>
              <select
                id="join-size"
                value={hireSize}
                onChange={(e) => setHireSize(e.target.value as HireSize)}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
              >
                <option value="">Choose a size</option>
                {HIRE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {!birthdayPersonTaken && (
            <label className="flex items-center gap-2 text-sm text-black">
              <input
                type="checkbox"
                checked={isBirthdayPerson}
                onChange={(e) => setIsBirthdayPerson(e.target.checked)}
              />
              This skater is the birthday person
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
          >
            {busy ? "Registering…" : full ? "No places left" : "Register"}
          </button>
        </>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className="flex items-start gap-2 rounded-xl border border-line bg-white p-3 text-sm text-black"
        >
          {!message.ok && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden />}
          {message.text}
        </p>
      )}
    </form>
  );
}
