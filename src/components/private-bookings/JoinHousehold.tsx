"use client";

// The household form on the party invite page. The register form above it is
// rendered from the server's list of skaters, so the page is refreshed each
// time a skater or waiver is saved here.
//
// Saving a skater or their waiver does NOT register them for the party, and
// the register form sits above this one, so a parent who finished here
// thought they were done (issue #194). After each save, say so and point
// back up.
import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { HouseholdManager } from "@/components/account/HouseholdManager";

export function JoinHousehold(props: Omit<ComponentProps<typeof HouseholdManager>, "onChanged">) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <>
      {saved && (
        <p role="status" className="mb-4 rounded-xl bg-blue-pale/40 p-3 text-sm text-black">
          Saved. This does not register them for the party yet:{" "}
          <a href="#register" className="font-bold text-blue underline">
            choose them under Register a skater and press Register
          </a>
          .
        </p>
      )}
      <HouseholdManager
        {...props}
        onChanged={() => {
          setSaved(true);
          router.refresh();
        }}
      />
    </>
  );
}
