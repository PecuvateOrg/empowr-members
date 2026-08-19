"use client";

// Header nav that shows in full from `sm` up and collapses behind a menu
// button below it. Shared by the member and admin headers so the open/
// close behaviour, focus handling and ARIA wiring exist once rather than
// being copied per header and drifting apart.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { AuthNavAction } from "@/components/AuthNavAction";

export type NavItem = { href: string; label: string };

export function CollapsibleNav({
  links,
  menuId,
}: {
  links: NavItem[];
  /** Unique per header so aria-controls resolves when more than one
   *  header could ever render. */
  menuId: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation, or the panel stays open over the page you just
  // moved to.
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
        {links.map((link) => (
          <NavLink key={link.href} href={link.href}>
            {link.label}
          </NavLink>
        ))}
        <AuthNavAction />
      </nav>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={menuId}
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
          id={menuId}
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-warm-white shadow-md sm:hidden"
        >
          <nav className="mx-auto flex max-w-5xl flex-col px-4 py-2 text-sm font-bold text-mid">
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                className="border-b border-line/60"
                onNavigate={() => setOpen(false)}
                // Full-width rows: an underline here reads as another
                // divider, so colour alone marks the current section.
                indicator="none"
              >
                {link.label}
              </NavLink>
            ))}
            <div className="py-1">
              <AuthNavAction expanded />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
