import Image from "next/image";
import Link from "next/link";
import { links } from "@/lib/links";

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
        CIC offers — coming soon.
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
