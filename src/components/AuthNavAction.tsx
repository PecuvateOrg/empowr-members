"use client";

// The one part of the header that depends on who is looking.
//
// It has to resolve on the CLIENT. /sessions and /sessions/[slug] are
// prerendered, and reading the session server-side means calling
// cookies(), a dynamic API, which would drop both back to per-request
// rendering and undo the caching work. So the header itself stays fully
// static and only this slot resolves after mount.
//
// The slot reserves its width up front so the nav does not shift when it
// settles.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function AuthNavAction({ expanded = false }: { expanded?: boolean }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Reserve the slot while unknown rather than rendering a guess and
  // swapping it a frame later.
  if (signedIn === null) {
    return <span aria-hidden className={expanded ? "block h-9" : "w-6"} />;
  }

  if (signedIn) return <SignOutButton alwaysShowLabel={expanded} />;

  return (
    <Link
      href="/login"
      className={`py-3 transition-colors hover:text-blue ${
        expanded ? "block" : ""
      }`}
    >
      Sign in
    </Link>
  );
}
