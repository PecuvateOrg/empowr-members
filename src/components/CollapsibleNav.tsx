"use client";

// Header nav that shows in full above its breakpoint and collapses behind a
// menu button below it. Shared by the member and admin headers so the open/
// close behaviour, focus handling and ARIA wiring exist once rather than
// being copied per header and drifting apart.
//
// WHY THE BREAKPOINT IS A PROP. It was hardcoded to `sm` (640px) for both
// headers, and the two headers are not the same size. Measured 2026-09-08
// against the built app: AdminHeader needs 746px to lay its row out — six
// links, a "Sign out" and a wordmark, every one of them whitespace-nowrap —
// and at 640px it has 577px. The overrun did not wrap or scroll the nav. The
// brand shrank as a flex item while its text kept its own width, so from
// 640px to 833px "Members Admin" was PRINTED ON TOP OF "Check in", and below
// 768px the page grew a horizontal scrollbar with "Sign out" off the right
// edge entirely. Nothing reported it: at 768px there is no page overflow at
// all, just two strings occupying the same pixels.
//
// SiteHeader is fine at `sm` (58px of slack at its tightest) and keeps it.
// AdminHeader takes `lg`. 834px is where it first has room, which is 25px of
// margin — thin enough that renaming one link would put it back on top of
// itself — so the collapse holds until 1024px and a door tablet gets the
// stacked menu, which is the better control there anyway.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { AuthNavAction } from "@/components/AuthNavAction";

export type NavItem = { href: string; label: string };

export type NavBreakpoint = keyof typeof BREAKPOINTS;

// Written out in full, never interpolated. Tailwind resolves classes by
// scanning source text for literals, so `${bp}:flex` would compile, render
// nothing, and fail silently — the nav would simply never appear.
const BREAKPOINTS = {
  sm: { inline: "sm:flex", collapsed: "sm:hidden" },
  lg: { inline: "lg:flex", collapsed: "lg:hidden" },
} as const;

export function CollapsibleNav({
  links,
  menuId,
  breakpoint = "sm",
}: {
  links: NavItem[];
  /** Unique per header so aria-controls resolves when more than one
   *  header could ever render. */
  menuId: string;
  /** Width at which the full row replaces the menu button. Pick it from what
   *  the header actually needs, not from what looks right on a desktop. */
  breakpoint?: NavBreakpoint;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { inline, collapsed } = BREAKPOINTS[breakpoint];

  // Close on navigation, or the panel stays open over the page you just
  // moved to.
  useEffect(() => setOpen(false), [pathname]);

  // A viewport that grows past the breakpoint swaps the menu button for the
  // full row. The panel is hidden by CSS at that point but `open` stayed
  // true, so shrinking back re-opened a panel nobody asked for — and the
  // button underneath it read aria-expanded="true" the whole time it was
  // invisible.
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(
      breakpoint === "lg" ? "(min-width: 64rem)" : "(min-width: 40rem)"
    );
    if (query.matches) setOpen(false);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, breakpoint]);

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
      {/* SignOutButton's label is `hidden sm:inline`, which is correct at
          BOTH breakpoints: this row does not exist below its own breakpoint,
          and `lg` is above `sm`, so wherever the row renders the label shows.
          It would only break for a breakpoint below `sm`. */}
      <nav
        className={`hidden items-center gap-5 text-sm font-bold whitespace-nowrap text-mid ${inline}`}
      >
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
        className={`-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-mid transition-colors hover:text-blue ${collapsed}`}
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
          className={`absolute inset-x-0 top-full z-40 border-b border-line bg-warm-white shadow-md ${collapsed}`}
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
