// Human wording for a plan's weekly slot, e.g. "Sk8 Skool for Kidz ·
// Mondays 4:00pm" or, where the entitlement carries no weekday, just the
// offering name.
//
// Pure and free of `server-only` on purpose so both the member page and the
// staff register can use it, same reasoning as lib/slot-matching.ts. It only
// FORMATS a slot — whether a slot covers an occurrence is slotCoversOccurrence's
// job, and that comparison must stay in Europe/London. Do not reimplement
// matching here from these strings.
import type { EntitledSlot } from "@/lib/slot-matching";

const DAY_PLURALS = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
] as const;

/** "16:00:00" -> "4:00pm". Input is a Europe/London wall-clock time, already
 *  local, so this is pure string formatting with no timezone maths. */
export function formatLocalTime(startsAtLocal: string): string {
  const [hourRaw, minute] = startsAtLocal.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return startsAtLocal;
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute && minute !== "00"
    ? `${display}:${minute}${suffix}`
    : `${display}${suffix}`;
}

export function describeSlot(
  slot: EntitledSlot,
  offeringTitle: string | undefined
): string {
  const title = offeringTitle ?? "This session";
  // A null weekday means "every slot of this offering" — correct for an
  // offering that runs once a week, and deliberately immune to a time change.
  if (slot.weekday === null || slot.starts_at_local === null) return title;
  const day = DAY_PLURALS[slot.weekday - 1] ?? "";
  return `${title} · ${day} ${formatLocalTime(slot.starts_at_local)}`;
}
