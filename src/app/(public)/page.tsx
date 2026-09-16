import Image from "next/image";
import Link from "next/link";
import { links } from "@/lib/links";

// "Explore our sessions" POINTS OUT TO EELA, and has been round the houses.
//
// It started (2026-07-09, Phase 1) pointing at EELA, because no session
// existed here to book. It was later repointed at this app's own /sessions
// catalogue on the reasoning that EELA links INTO Members for booking, so
// sending visitors back out looked backwards.
//
// That reasoning was overtaken on 2026-09-08, when EELA became the ONLY
// discovery surface for sessions and programme content (PR #57/#58): the
// header's "Sessions" link and the bottom bar's Menu entry both moved to
// EELA, and the "All sessions" backlink was stripped from session pages.
// THIS CTA WAS MISSED BY THAT SWEEP and was, until 2026-09-16, the last
// discovery-shaped link in the app still pointing inward — the home page
// disagreed with the header directly above it. Owner confirmed: send it out.
//
// It is NOT backwards. EELA links into Members at /sessions/<slug> — a deep
// link to one session's booking page, not to the catalogue. Browse there,
// book here. The two directions are different jobs.
//
// DELIBERATELY NOT CHANGED, and do not "finish the job" by changing them:
// BookingsList, TicketCard, BasketHandoff, BasketClient's non-empty state
// and the membership pages all still link to the internal /sessions. Those
// are in-flow "book something now" actions for a member already mid-task,
// not discovery, and the 2026-09-08 decision explicitly spared them.
//
// Same tab, matching the header's EELA link, which is a plain navigation
// rather than a new window.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-cream px-4 text-center sm:px-6">
      <Image
        src="/logo.png"
        alt="Empowr CIC"
        width={140}
        height={140}
        priority
        className="h-auto w-[110px]"
      />
      <h1 className="text-4xl font-black tracking-tight text-black">
        Empowr Members
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-mid">
        Book sessions, manage your membership, and access everything Empowr
        CIC offers.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        <a
          href={links.eela}
          className="rounded-full bg-blue px-7 py-2.5 font-extrabold text-white shadow-blue transition-colors duration-200 hover:bg-blue-dark"
        >
          Explore our sessions
        </a>
        <Link
          href="/login"
          className="rounded-full border border-line bg-card px-7 py-2.5 font-extrabold text-black transition-colors duration-200 hover:border-blue hover:text-blue"
        >
          Sign in
        </Link>
      </div>
      <p className="text-sm font-semibold text-mid">
        New here?{" "}
        <Link href="/signup" className="text-blue hover:text-blue-dark">
          Create an account
        </Link>
      </p>
    </main>
  );
}
