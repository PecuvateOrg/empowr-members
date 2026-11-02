"use client";

// Desktop header (lg and up): everything about the member's own account in
// one "My account" dropdown, grouped like the touch Menu panel (2026-11-02).
// The header row keeps only what members reach for: booking, their
// bookings, notifications and the basket.
//
// Signed out it is a plain "Sign in" link. Auth resolves on the client for
// the reason given in AuthNavAction: the header must stay static so the
// prerendered /sessions pages keep their caching.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMenuDisclosure } from "@/components/useMenuDisclosure";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/auth/SignOutButton";

const ACCOUNT_LINKS = [
  { href: "/account", label: "Account details" },
  { href: "/membership", label: "Subscriptions" },
] as const;

export function AccountMenu() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // This menu only exists at lg and up, so close it if the window narrows.
  const { open, setOpen, toggle, panelRef, buttonRef } = useMenuDisclosure({
    closeAbove: "(max-width: 63.99rem)",
  });

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

  if (signedIn === null) return <span aria-hidden className="w-24" />;

  if (!signedIn) {
    return (
      <Link href="/login" className="py-3 transition-colors hover:text-blue">
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="account-menu"
        className={`flex items-center gap-1.5 rounded-full border border-line px-3 py-2 transition-colors ${
          open ? "text-blue" : "hover:text-blue"
        }`}
      >
        <UserRound className="h-4 w-4" aria-hidden />
        My account
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="account-menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-line bg-warm-white p-2 shadow-md"
        >
          <nav className="flex flex-col px-2 text-sm font-bold text-mid">
            {ACCOUNT_LINKS.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                className="border-b border-line/60"
                onNavigate={() => setOpen(false)}
                indicator="none"
              >
                {label}
              </NavLink>
            ))}
            <p className="pb-1 pt-3 text-xs font-black uppercase tracking-wide text-mid/70">
              Help
            </p>
            <NavLink
              href="/contact"
              className="border-b border-line/60"
              onNavigate={() => setOpen(false)}
              indicator="none"
            >
              Contact us
            </NavLink>
            <SignOutButton alwaysShowLabel />
          </nav>
        </div>
      )}
    </div>
  );
}
