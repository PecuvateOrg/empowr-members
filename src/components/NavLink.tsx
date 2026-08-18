"use client";

// Header nav link with an active-section indicator.
//
// The headers previously gave no signal about where you were. The
// underline animates in with a scale transform rather than a width or
// layout change, so it is composited and never reflows the nav.
//
// Plain CSS on purpose — this is a two-property transition on an element
// that must be correct on first paint, which is not a case that earns a
// motion library.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  className = "",
  onNavigate,
  indicator = "underline",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
  /** "underline" suits a horizontal bar. In a stacked menu the links are
   *  full-width, so an underline spans the whole row and reads as another
   *  divider — there, colour alone carries it. */
  indicator?: "underline" | "none";
}) {
  const pathname = usePathname();

  // Match the section, not just the exact page, so /sessions/skate-jam
  // still marks "Sessions" as current.
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative py-3 transition-colors ${
        active ? "text-blue" : "hover:text-blue"
      } ${className}`}
    >
      {children}
      {indicator === "underline" && (
        <span
          aria-hidden
          className={`absolute inset-x-0 bottom-1.5 h-0.5 origin-left rounded-full bg-blue transition-transform duration-200 ease-out ${
            active ? "scale-x-100" : "scale-x-0"
          }`}
        />
      )}
    </Link>
  );
}
