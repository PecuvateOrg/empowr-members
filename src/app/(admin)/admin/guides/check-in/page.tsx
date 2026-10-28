import type { Metadata } from "next";
import { CheckInGuide } from "@/components/guides/CheckInGuide";

export const metadata: Metadata = { title: "Checking people in — Members Admin" };

export default function CheckInGuidePage() {
  return <CheckInGuide backHref="/admin/guides" backLabel="Guides" />;
}
