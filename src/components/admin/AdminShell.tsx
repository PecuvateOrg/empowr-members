"use client";

// The admin console frame: a left-hand menu at lg and up that staff can
// collapse to an icon rail, and a burger + slide-in drawer below lg.
//
// WHY lg. The same touch boundary the member site uses (see BottomNav): a
// door tablet is a 768px iPad in portrait and gets the drawer, so the page
// keeps its full width where it is actually used standing up.
//
// COLLAPSED STATE is a per-browser convenience, so localStorage is right
// for it — and every access is wrapped, because it throws in some private
// windows. The first render is always expanded (the server cannot know), and
// the saved choice is applied after mount.
//
// The drawer reuses useMenuDisclosure: Escape, outside click, close on
// navigate and close-above-the-breakpoint all behave exactly as the member
// menus do.

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useMenuDisclosure } from "@/components/useMenuDisclosure";
import { ADMIN_NAV, isCurrent } from "@/components/admin/admin-nav";

const COLLAPSE_KEY = "members-admin-sidebar-collapsed";
const DESKTOP = "(min-width: 1024px)";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/admin" className="flex min-w-0 items-center gap-3">
      <Image
        src="/logo.png"
        alt="Empowr CIC"
        width={140}
        height={140}
        className="h-auto w-[44px] shrink-0"
      />
      {!compact && (
        <span className="truncate text-lg font-black tracking-tight text-black">
          Members Admin
        </span>
      )}
    </Link>
  );
}

function NavList({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <hr className="mx-2 mb-2 border-line" />
          ) : (
            <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-mid">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const current = isCurrent(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${
                      current
                        ? "bg-blue text-white"
                        : "text-black hover:bg-blue-pale/60"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className={collapsed ? "sr-only" : "truncate"}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const drawer = useMenuDisclosure({ closeAbove: DESKTOP });

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable: stay expanded
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // not remembered this time; still toggles
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-cream lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-line bg-warm-white lg:sticky lg:top-0 lg:flex lg:h-screen ${
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        }`}
      >
        <div className={`flex items-center border-b border-line py-4 ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <Brand compact={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
        <div className={`flex border-t border-line px-3 py-2 ${collapsed ? "flex-col items-center" : "items-center justify-between"}`}>
          {!collapsed && (
            <div className="px-3 text-sm font-semibold text-black">
              <SignOutButton alwaysShowLabel />
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-mid transition-colors hover:bg-blue-pale/60 hover:text-blue"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-warm-white px-4 py-3 lg:hidden">
        <Brand />
        <button
          ref={drawer.buttonRef}
          type="button"
          onClick={drawer.toggle}
          aria-label={drawer.open ? "Close menu" : "Open menu"}
          aria-expanded={drawer.open}
          aria-controls="admin-drawer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-black hover:bg-blue-pale/60"
        >
          {drawer.open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity lg:hidden ${
          drawer.open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />
      <div
        id="admin-drawer"
        ref={drawer.panelRef}
        inert={!drawer.open}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-warm-white shadow-xl transition-transform lg:hidden ${
          drawer.open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Brand />
          <button
            type="button"
            onClick={() => drawer.setOpen(false)}
            aria-label="Close menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-black hover:bg-blue-pale/60"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <NavList />
        <div className="border-t border-line px-6 py-2 text-sm font-semibold text-black">
          <SignOutButton alwaysShowLabel />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
