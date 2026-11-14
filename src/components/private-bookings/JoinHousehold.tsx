"use client";

// The household form on the party invite page. The register form above it is
// rendered from the server's list of skaters, so the page is refreshed each
// time a skater or waiver is saved here.
import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { HouseholdManager } from "@/components/account/HouseholdManager";

export function JoinHousehold(props: Omit<ComponentProps<typeof HouseholdManager>, "onChanged">) {
  const router = useRouter();
  return <HouseholdManager {...props} onChanged={() => router.refresh()} />;
}
