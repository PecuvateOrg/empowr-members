"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { HIRE_SIZES, type HireSize } from "@/lib/private-bookings";

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
  const [equipment, setEquipment] = useState<"own" | "hire">("hire");
  const [hireSize, setHireSize] = useState<HireSize | "">("");
  const [isBirthdayPerson, setIsBirthdayPerson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const joined = participants.filter((p) => p.joined);
  const available = participants.filter((p) => !p.joined);
  const chosen = participants.find((p) => p.id === participantId);
  const canSubmit =
    !busy && !full && !!chosen && chosen.waiverSigned && (equipment === "own" || hireSize !== "");

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
        setMessage({ ok: true, text: `${chosen?.name} is registered. See you there!` });
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
      {joined.length > 0 && (
        <p className="rounded-xl bg-blue-pale/40 p-3 text-sm text-black">
          Already registered: {joined.map((p) => p.name).join(", ")}
        </p>
      )}

      {participants.length === 0 || available.length === 0 ? (
        <p className="text-sm text-mid">
          {participants.length === 0 ? "Add the skater to your household first. " : "Registering someone else? Add them to your household first. "}
          <Link href="/account" className="underline">Go to your account</Link>
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
                A signed waiver is needed first. <Link href="/waiver" className="underline">Complete a waiver</Link>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="join-equipment" className="block text-sm font-bold text-mid">Skates</label>
            <select
              id="join-equipment"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as "own" | "hire")}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
            >
              <option value="hire">Hire skates (included)</option>
              <option value="own">Bringing own skates</option>
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
