import Image from "next/image";
import Link from "next/link";

// Written 2026-07-09 (Phase 1 auth scaffolding), before any session existed
// to book — "coming soon" copy and a primary CTA out to EELA (then the only
// place to see sessions) were both correct at the time. Neither was updated
// when the site went live 2026-08-27. EELA now links INTO Members for
// booking (members.empowrcic.org/sessions/... — see Empowr EELA's
// lib/links.ts), so sending this page's own visitors OUT to EELA instead of
// to this app's own live catalogue had it backwards.
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
        <Link
          href="/sessions"
          className="rounded-full bg-blue px-7 py-2.5 font-extrabold text-white shadow-blue transition-colors duration-200 hover:bg-blue-dark"
        >
          Explore our sessions
        </Link>
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
