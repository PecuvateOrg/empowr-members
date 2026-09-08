"use client";

// One subscriber on the register — the same collapse as RegisterBookingRow.
//
// This list never had the table's horizontal-scroll problem, but it got the
// same extra lines per person and reads as a wall of text with them. More
// importantly the two lists must agree: a door that learns "the arrow opens the
// safeguarding detail" from the table above has to find the same thing here,
// and a flag has to mean the same thing in both places. That includes medical
// notes — a badge on the surface, the note itself inside.

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RegisterSubscriber } from "@/lib/admin-data";
import {
  DepartureLine,
  EmergencyContactLine,
  SafetyFlags,
  MedicalNotesBlock,
} from "@/components/admin/ParticipantSafetyInfo";

export function RegisterSubscriberItem({ sub }: { sub: RegisterSubscriber }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold text-black">{sub.name}</p>
          <p className="text-sm text-mid">
            {sub.planName}
            {sub.age !== null && ` · age ${sub.age}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <SafetyFlags
              departure={sub.departure}
              emergencyContact={sub.emergencyContact}
              medicalNotes={sub.medicalNotes}
            />
          </p>
        </div>
        <div className="flex items-center gap-1">
          {sub.waiverSigned ? (
            <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-extrabold text-blue-dark">
              Waiver signed
            </span>
          ) : (
            <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
              No waiver — do not let them take part
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={detailId}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-mid transition-colors hover:bg-blue-pale hover:text-blue"
          >
            <span className="sr-only">
              {open
                ? `Hide details for ${sub.name}`
                : `Show details for ${sub.name}`}
            </span>
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {open && (
        <div id={detailId} className="mt-3 rounded-xl bg-blue-pale/25 p-3">
          {/* Notes first, as on the booking row: it is the one a door acts on
              immediately, and a parent's free text needs the full width. */}
          <MedicalNotesBlock notes={sub.medicalNotes} />
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            {sub.departure.kind !== "not_applicable" && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-mid">
                  Leaving
                </dt>
                <dd className="mt-1">
                  <DepartureLine departure={sub.departure} />
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-mid">
                Emergency contact
              </dt>
              <dd className="mt-1">
                <EmergencyContactLine contact={sub.emergencyContact} />
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}
