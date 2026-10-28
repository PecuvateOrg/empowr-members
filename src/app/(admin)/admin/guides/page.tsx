import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  LayoutDashboard,
  LifeBuoy,
  Puzzle,
  ScanLine,
  Scale,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = { title: "Guides — Members Admin" };

/**
 * The staff guide book.
 *
 * These live in the admin rather than in a shared document because the people
 * who need them are already holding this app, and because a guide kept beside
 * the code it describes is the only kind that gets updated when the behaviour
 * changes. Change a screen, change its guide in the same PR.
 */
const GUIDES: { href: string; title: string; blurb: string; icon: LucideIcon }[] = [
  {
    href: "/admin/guides/check-in",
    title: "Checking people in",
    blurb: "Registers, waivers, subscribers, walk-ins and private bookings at the door",
    icon: ScanLine,
  },
  {
    href: "/admin/guides/how-it-works",
    title: "How it fits together",
    blurb: "Accounts, households, waivers, bookings, subscriptions, and who sees what",
    icon: Puzzle,
  },
  {
    href: "/admin/guides/customer-help",
    title: "Helping a customer",
    blurb: "Every step a member takes, with the words on screen",
    icon: CircleHelp,
  },
  {
    href: "/admin/guides/policies",
    title: "What customers can and can't do",
    blurb: "Cancelling, moving dates, refunds and walk-ins, per session",
    icon: Scale,
  },
  {
    href: "/admin/guides/admin",
    title: "Using the admin",
    blurb: "Offerings, private bookings, messages, credit, deletions, waivers",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/guides/troubleshooting",
    title: "Troubleshooting",
    blurb: '"The customer says…" and "an alert email arrived…"',
    icon: LifeBuoy,
  },
];

export default function GuidesIndexPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Guides</h1>
        <p className="mt-1 text-mid">How the platform works, and how to help the people using it.</p>
      </div>

      {GUIDES.map(({ href, title, blurb, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-pale">
            <Icon className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">{title}</p>
            <p className="text-sm text-mid">{blurb}</p>
          </div>
        </Link>
      ))}

      <p className="flex items-start gap-2 text-sm text-muted">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Door staff see only the check-in guide, from their Check in screen.
      </p>
    </main>
  );
}
