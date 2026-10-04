"use client";

import { useState } from "react";
import { WaiverForm } from "@/components/waiver/WaiverForm";
import { firstEmergencyContact } from "@/lib/ec-relationships";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { ageOn } from "@/lib/age";
import type { Participant } from "@/lib/types";
import type { EmergencyContactSuggestion } from "@/lib/waivers";
import type { ParticipantInput, ParticipantWithWaiverInput } from "@/lib/validation";
import { Button, FormNotice } from "@/components/ui/form";
import { ParticipantForm } from "@/components/account/ParticipantForm";

export function HouseholdManager({
  initialParticipants,
  initialUnsignedIds,
  accountName,
  accountPhone,
  suggestedContact,
}: {
  initialParticipants: Participant[];
  accountName: string;
  accountPhone: string | null;
  /** The account holder's own most recent nomination, for the self path.
   *  Null when nothing safe could be offered. */
  suggestedContact: EmergencyContactSuggestion | null;
  /** Ids with no valid waiver, resolved server-side by checkWaivers(). */
  initialUnsignedIds: string[];
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  // Tracked in state rather than read from the prop so the banner is correct
  // the instant someone is added — this page never reloads on add, and a
  // brand-new participant has no waiver until the add form's own waiver
  // saves. The inline waiver below clears ids as it covers them.
  const [unsignedIds, setUnsignedIds] = useState<string[]>(initialUnsignedIds);
  const [signing, setSigning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingSelf, setAddingSelf] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needWaiver = participants.filter((p) => unsignedIds.includes(p.id));

  // Adds the person, then signs their waiver from the same form (team
  // request 2026-10-04). Two existing routes, not a new one: if the waiver
  // fails the person is still added, and the banner below offers it again.
  async function create(values: ParticipantInput & Partial<ParticipantWithWaiverInput>) {
    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not add the participant.");
    const created = body.participant as Participant;
    setParticipants((list) => [...list, created]);
    setAdding(false);

    const waiver = await fetch("/api/waivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, participant_ids: [created.id] }),
    });
    if (!waiver.ok) {
      const body = await waiver.json().catch(() => ({}));
      setUnsignedIds((ids) => [...ids, created.id]);
      setError(
        `${created.name} was added, but the waiver didn't save: ` +
          `${body.error ?? "please try again"}. Use "Sign the waiver now" below.`
      );
    }
  }

  async function update(id: string, values: ParticipantInput) {
    const res = await fetch(`/api/participants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not save the participant.");
    setParticipants((list) =>
      list.map((p) => (p.id === id ? (body.participant as Participant) : p))
    );
    setEditingId(null);
  }

  async function remove(participant: Participant) {
    setError(null);
    if (
      !window.confirm(
        `Remove ${participant.name} from your household? Their details will be deleted. ` +
          `Their signed waiver is kept securely by the Empowr team for 3 years (or until a child ` +
          `turns 21, if later) in case of a claim, then deleted. This can't be undone.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/participants/${participant.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove the participant.");
      return;
    }
    setParticipants((list) => list.filter((p) => p.id !== participant.id));
    setUnsignedIds((ids) => ids.filter((id) => id !== participant.id));
  }

  return (
    <div className="space-y-4">
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {/* Persistent until every person is covered. The waiver is a hard gate
          on booking, walk-ins AND subscribing, so leaving it unmentioned
          until one of those refuses is how someone ends up discovering it at
          the door. Named per person, because a household can be half done. */}
      {needWaiver.length > 0 && !signing && (
        <FormNotice tone="error">
          <span className="block">
            {needWaiver.map((p) => p.name).join(", ")}{" "}
            {needWaiver.length === 1 ? "needs" : "need"} a signed waiver before
            being booked onto a session or subscribed. One waiver covers
            everyone selected and lasts a year.
          </span>
          <Button type="button" className="mt-2" onClick={() => setSigning(true)}>
            Sign the waiver now
          </Button>
        </FormNotice>
      )}

      {signing && (
        <div className="rounded-xl border border-line p-4 sm:p-6">
          <WaiverForm
            participants={participants.map((p) => ({
              id: p.id,
              name: p.name,
              age: ageOn(p.dob),
              alreadySigned: !unsignedIds.includes(p.id),
            }))}
            defaultEmergencyContact={firstEmergencyContact(participants)}
            onSigned={(ids) => {
              setUnsignedIds((list) => list.filter((id) => !ids.includes(id)));
              setSigning(false);
            }}
          />
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-mid underline"
            onClick={() => setSigning(false)}
          >
            Do it later
          </button>
        </div>
      )}

      {participants.length === 0 && !adding && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No one in your household yet — add your first participant to get
          ready for booking.
        </p>
      )}

      <ul className="space-y-3">
        {participants.map((participant) =>
          editingId === participant.id ? (
            <li
              key={participant.id}
              className="rounded-xl border border-line p-4"
            >
              <ParticipantForm
                initial={participant}
                submitLabel="Save changes"
                onSubmit={(values) => update(participant.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={participant.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-pale">
                  <UserRound className="h-4.5 w-4.5 text-blue" aria-hidden />
                </span>
                <div>
                  <p className="font-extrabold text-black">
                    {participant.name}
                    <span className="ml-2 rounded-full bg-blue-soft px-2.5 py-0.5 text-xs font-bold text-blue-dark">
                      age {ageOn(participant.dob)}
                    </span>
                    {unsignedIds.includes(participant.id) ? (
                      <span className="ml-2 rounded-full bg-red-soft px-2.5 py-0.5 text-xs font-bold text-red-dark">
                        Waiver needed
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-blue-pale px-2.5 py-0.5 text-xs font-bold text-blue-dark">
                        ✓ Waiver signed
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-mid">
                    Born {format(parseISO(participant.dob), "d MMMM yyyy")}
                    {participant.emergency_contact_name && (
                      <>
                        {" · "}Emergency: {participant.emergency_contact_name}
                        {participant.emergency_contact_phone &&
                          ` (${participant.emergency_contact_phone})`}
                        {participant.emergency_contact_relationship &&
                          `, ${participant.emergency_contact_relationship}`}
                      </>
                    )}
                  </p>
                  {participant.medical_notes && (
                    <p className="mt-1 text-sm text-muted">
                      Medical: {participant.medical_notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(participant.id);
                  }}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-blue-pale hover:text-blue"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(participant)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-red-soft hover:text-red-dark"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-line p-4">
          {/* Who the emergency contact is flips with the path, so the
              defaults have to flip with it too.

              Adding a CHILD: the responsible adult is the account holder,
              so their own name and number are the right answer and the
              common case — this is the path most households use most.

              Adding YOURSELF: your own details are the one answer that must
              never appear, because an emergency contact has to be someone
              who is not the person lying on the floor. The only thing
              offered here is a contact the member previously nominated on a
              waiver, already filtered server-side to exclude themselves.
              Where there is none, the fields stay empty rather than
              guessing. */}
          <ParticipantForm
            submitLabel={addingSelf ? "Add myself and sign waiver" : "Add skater and sign waiver"}
            defaultName={addingSelf ? accountName : undefined}
            defaultEmergencyContactName={
              addingSelf ? suggestedContact?.name : accountName
            }
            defaultEmergencyContactPhone={
              addingSelf ? suggestedContact?.phone : accountPhone ?? undefined
            }
            participantKind={addingSelf ? "self" : "other"}
            withWaiver
            onSubmit={create}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAddingSelf(true);
              setAdding(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add myself as a skater
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditingId(null);
              setAddingSelf(false);
              setAdding(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a child or someone else
          </Button>
        </div>
      )}
    </div>
  );
}
