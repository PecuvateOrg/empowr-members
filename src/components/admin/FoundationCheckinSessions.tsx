import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { listFoundationCheckinSessions } from "@/lib/foundation-checkin";
import { formatDate } from "@/lib/format";

export async function FoundationCheckinSessions({
  registerBase,
}: {
  registerBase: string;
}) {
  const sessions = await listFoundationCheckinSessions();
  if (sessions.length === 0) return null;
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <CalendarClock className="h-5 w-5 text-blue" aria-hidden /> Beginners
        Foundation
      </h2>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {sessions.map((session) => (
          <li key={`${session.id}:${session.date}`}>
            <Link
              href={`${registerBase}/${session.id}?date=${session.date}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
            >
              <div>
                <p className="font-extrabold text-black">{session.label}</p>
                <p className="text-sm font-semibold text-mid">
                  {formatDate(session.date)}
                  {session.starts_at_local &&
                    ` · ${session.starts_at_local.slice(0, 5)}`}
                  {session.ends_at_local &&
                    `–${session.ends_at_local.slice(0, 5)}`}
                </p>
              </div>
              <span className="text-sm font-bold text-blue">Open register</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
