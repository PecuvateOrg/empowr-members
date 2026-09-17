"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary for the signed-in member area.
 *
 * Added 2026-09-17 alongside the read-error sweep. The reads behind these
 * pages now THROW when the database returns an error, instead of quietly
 * rendering an empty list — but until this file existed there was no
 * boundary anywhere in the app, so a throw landed on Next's unstyled
 * "Application error: a server-side exception has occurred". Telling a
 * member their bookings are gone is worse; telling them nothing at all is
 * not much better. This says what happened and offers a retry.
 *
 * Deliberately vague about the cause and never renders the message: these
 * are database errors and the copy is read by customers.
 */
export default function MemberError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the detail. This records the digest so a
    // report of "I saw an error page" can be tied to that server log.
    console.error("member area error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-blue-pale p-6 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-blue" aria-hidden />
        <h1 className="mt-3 text-xl font-extrabold text-blue-dark">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-blue-dark">
          We couldn&apos;t load this page just now. Nothing you&apos;ve booked or
          paid for is affected — please try again in a moment.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
          >
            Try again
          </button>
          <Link
            href="/account"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-blue px-6 py-2 font-extrabold text-blue-dark transition-colors hover:bg-white"
          >
            Back to my account
          </Link>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs font-semibold text-blue-dark/70">
            If you contact us, quote reference {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
