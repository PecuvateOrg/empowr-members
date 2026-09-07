// The four things a door needs to know about a person, rendered once.
//
// Used by BOTH the register (components/admin/RegisterView.tsx) and the
// scan-a-ticket screen (app/(checkin)/checkin/[bookingId]/page.tsx). Those are
// two ways into the same decision — "is this person allowed in, and what do I
// need to know about them" — and they must not answer it differently. The
// register and the scan screen had already drifted once: the register showed a
// waiver warning and medical notes, the scan screen showed medical notes
// alone, so the same person could be waved through one and stopped at the
// other. Keeping the presentation here means a change lands on both.
//
// The data is resolved server-side (lib/register-departure.ts,
// lib/register-emergency-contact.ts) — these components only render a status
// they are handed, and deliberately contain no rules of their own.
import { AlertTriangle } from "lucide-react";
import type { DepartureStatus } from "@/lib/register-departure";
import {
  telHref,
  type EmergencyContactStatus,
} from "@/lib/register-emergency-contact";

/** Green YES as well as red NO.
 *
 *  The register used to render the red "no waiver" warning and NOTHING at all
 *  for a signed one, so staff were inferring cover from the ABSENCE of a
 *  warning — indistinguishable from a field that failed to load or a check
 *  that silently returned nothing. An explicit positive is the whole point. */
export function WaiverBadge({ signed }: { signed: boolean }) {
  return signed ? (
    <span className="inline-block rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
      Waiver ✓
    </span>
  ) : (
    <span className="inline-block rounded-full bg-red-soft px-2 py-0.5 text-xs font-extrabold text-red-dark">
      No waiver
    </span>
  );
}

/** How this person leaves. See lib/register-departure.ts for the rule — in
 *  particular why "no consent" renders as collected-in-person and never as the
 *  parent's standing default. */
export function DepartureLine({ departure }: { departure: DepartureStatus }) {
  switch (departure.kind) {
    case "not_applicable":
      return <span className="text-muted">—</span>;
    case "authorised":
      return <span className="font-semibold text-black">{departure.label}</span>;
    case "collected_in_person":
      return (
        <span className="font-semibold text-mid">
          Collected in person
          {departure.usually && (
            <span className="mt-0.5 block text-xs font-normal text-muted">
              Usually {departure.usually.toLowerCase()} — not authorised today
            </span>
          )}
        </span>
      );
    case "ambiguous":
      return (
        <span className="flex items-center gap-1 font-bold text-red-dark">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Check with the office
        </span>
      );
  }
}

/** Who to ring.
 *
 *  Never renders blank. On 2026-09-07 eight of 49 participants had no
 *  emergency contact and four live future bookings belonged to them, so "none
 *  on file" is a real state staff will meet — and an empty cell would read as
 *  "nothing to see" rather than "there is nobody to call". The self-reference
 *  case is louder still: it looks answered until the moment it matters. */
export function EmergencyContactLine({
  contact,
}: {
  contact: EmergencyContactStatus;
}) {
  switch (contact.kind) {
    case "ok": {
      const href = telHref(contact.phone);
      return (
        <span className="block">
          <span className="block font-semibold text-black">{contact.name}</span>
          {href ? (
            <a
              href={href}
              className="text-sm font-bold text-blue underline underline-offset-2"
            >
              {contact.phone}
            </a>
          ) : (
            <span className="text-sm font-semibold text-mid">
              {contact.phone}
            </span>
          )}
        </span>
      );
    }
    case "no_phone":
      return (
        <span className="block">
          <span className="block font-semibold text-black">{contact.name}</span>
          <span className="flex items-center gap-1 text-sm font-bold text-red-dark">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            No number on file
          </span>
        </span>
      );
    case "self":
      return (
        <span className="flex items-start gap-1 font-bold text-red-dark">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Listed as their own contact
            <span className="mt-0.5 block text-xs font-semibold">
              Not usable in an emergency
            </span>
          </span>
        </span>
      );
    case "missing":
      return (
        <span className="flex items-center gap-1 font-bold text-red-dark">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          None on file
        </span>
      );
  }
}

/** "7" / "52" — plain, next to the name. A door reads age to know instantly
 *  whether the departure line below it even applies. */
export function AgeLabel({ age }: { age: number | null }) {
  if (age === null) return null;
  return (
    <span className="text-sm font-semibold text-mid">Age {age}</span>
  );
}
