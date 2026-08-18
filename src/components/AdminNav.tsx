"use client";

// Admin navigation: full row from `sm` up, collapsed behind a menu button
// below it.
//
// Admin is the one header that genuinely needed this. It carries four
// items and was overflowing at 320px — the earlier fix only made it fit
// by dropping to text-xs, tightening the gaps and hiding the "Members
// Admin" wordmark entirely. Collapsing the nav gives that wordmark back
// and leaves room for admin sections yet to be added.
//
// The member and public headers deliberately do NOT do this: they carry
// two or three items that already fit, and hiding "Sessions" behind an
// extra tap would put a barrier in front of the booking path. The
// discoverability cost is acceptable here precisely because staff use the
// same handful of admin routes every day.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/auth/SignOutButton";

const LINKS = [
  { href: "/admin/offerings", label: "Offerings" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/account", label: "Member site" },
];

export function AdminNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation. Without this the panel stays open over the page
  // you just moved to.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      <nav className="hidden items-center gap-5 text-sm font-bold whitespace-nowrap text-mid sm:flex">
        {LINKS.map((link) => (
          <NavLink key={link.href} href={link.href}>
            {link.label}
          </NavLink>
        ))}
        <SignOutButton />
      </nav>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-mid transition-colors hover:text-blue sm:hidden"
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden />
        ) : (
          <Menu className="h-6 w-6" aria-hidden />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="admin-menu"
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-warm-white shadow-md sm:hidden"
        >
          <nav className="mx-auto flex max-w-5xl flex-col px-4 py-2 text-sm font-bold text-mid">
            {LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                className="border-b border-line/60 last:border-b-0"
                onNavigate={() => setOpen(false)}
                indicator="none"
              >
                {link.label}
              </NavLink>
            ))}
            <div className="py-1">
              <SignOutButton alwaysShowLabel />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
