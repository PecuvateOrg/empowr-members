import Image from "next/image";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";

export function PublicHeader() {
  return (
    <header className="border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px]"
          />
          <span className="hidden text-lg font-black tracking-tight whitespace-nowrap text-black sm:inline">
            Empowr Members
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-xs font-bold whitespace-nowrap text-mid sm:gap-5 sm:text-sm">
          <NavLink href="/sessions">Sessions</NavLink>
          <NavLink href="/account">My account</NavLink>
        </nav>
      </div>
    </header>
  );
}
