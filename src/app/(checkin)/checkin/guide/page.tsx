import type { Metadata } from "next";
import { CheckInGuide } from "@/components/guides/CheckInGuide";

export const metadata: Metadata = { title: "Checking people in — Door Check-in" };

export default function CheckInGuidePage() {
  return <CheckInGuide backHref="/checkin" backLabel="Check in" />;
}
