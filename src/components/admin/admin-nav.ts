// The admin console menu. One list, read by the desktop sidebar and the
// mobile drawer alike, so the two can never offer different pages.
//
// Adding an admin page = adding a row here. The sidebar has room for it;
// the old header row did not (it was measured at six links and full).
//
// Groups follow how the Empowr team works, agreed with the owner 2026-09-28.
// `/checkin` lives outside /admin on purpose: it is the full-screen door view
// used on a phone, so it is linked from here rather than wrapped in the shell.

import {
  BookOpen,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Package,
  QrCode,
  ReceiptPoundSterling,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path counts as current (the dashboard would otherwise
   *  match every admin page). */
  exact?: boolean;
  /** Leaves the admin console; shown with an outward marker. */
  external?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Today",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/checkin", label: "Check in", icon: QrCode },
    ],
  },
  {
    label: "Sessions",
    items: [
      { href: "/admin/offerings", label: "Offerings", icon: Package },
      { href: "/admin/venues", label: "Venues", icon: MapPin },
    ],
  },
  {
    label: "Members & money",
    items: [
      { href: "/admin/credits", label: "Credit notes", icon: ReceiptPoundSterling },
      { href: "/admin/rescue", label: "Restore a lost booking", icon: LifeBuoy },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/admin/analytics", label: "Analytics", icon: TrendingUp }],
  },
  {
    label: "Help",
    items: [
      { href: "/admin/guides", label: "Guides", icon: BookOpen },
      { href: "/account", label: "Member site", icon: ExternalLink, external: true },
    ],
  },
];

export function isCurrent(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
