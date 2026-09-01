import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ScanLine } from "lucide-react";

export const metadata: Metadata = { title: "Guides — Members Admin" };

/**
 * Door-side guides for staff.
 *
 * These live in the admin rather than in a shared document because the people
 * who need them are already holding this app at the door, and because a guide
 * kept beside the code it describes is the only kind that gets updated when
 * the behaviour changes.
 */
export default function GuidesIndexPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Guides</h1>
        <p className="mt-1 text-mid">
          How to run things at the door.
        </p>
      </div>

      <Link
        href="/admin/guides/check-in"
        className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-pale">
          <ScanLine className="h-5 w-5 text-blue" aria-hidden />
        </span>
        <div>
          <p className="font-extrabold text-black">Checking people in</p>
          <p className="text-sm text-mid">
            Booked skaters, subscribers, waivers, and what to do when someone
            is not on the list
          </p>
        </div>
      </Link>

      <p className="flex items-start gap-2 text-sm text-muted">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        More guides will appear here as things change.
      </p>
    </main>
  );
}
