// Shared display labels for BookingStatus — used by the admin register
// page and the check-in lookup page. Kept in one place so the two
// surfaces can't silently drift on wording.
import type { BookingStatus } from "@/lib/types";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Payment pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  credited: "Cancelled — credited",
  refunded: "Cancelled — refunded",
  attended: "Attended",
  no_show: "No-show",
};
