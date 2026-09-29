// What a credit note came from, in words. Shared by the member's account page
// and the admin credit screen so a general credit (no booking, no old-platform
// reference) never renders as "Booking null".
//
// The member-facing label never shows the staff reason: that is an internal
// note (and mem_credit_balances, which members read, does not carry it).

type CreditSource = {
  source_booking_id: string | null;
  external_platform: string | null;
  external_reference: string | null;
};

export function creditSourceLabel(c: CreditSource): string {
  if (c.external_platform) return `${c.external_platform} / ${c.external_reference}`;
  if (c.source_booking_id) return `From a cancelled booking (${c.source_booking_id.slice(0, 8)})`;
  return "Account credit";
}
