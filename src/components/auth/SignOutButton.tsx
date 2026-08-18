"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** `alwaysShowLabel` is for stacked menus, where the label has room and a
 *  lone icon among text rows reads as an unlabelled control. */
export function SignOutButton({
  alwaysShowLabel = false,
}: {
  alwaysShowLabel?: boolean;
} = {}) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      className="flex items-center gap-1.5 py-3 transition-colors hover:text-blue"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span className={alwaysShowLabel ? "inline" : "hidden sm:inline"}>
        Sign out
      </span>
    </button>
  );
}
