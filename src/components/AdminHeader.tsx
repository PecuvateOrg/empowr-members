import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function AdminHeader() {
  return (
    <header className="border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px]"
          />
          <span className="hidden text-lg font-black tracking-tight whitespace-nowrap text-black sm:inline">
            Members Admin
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-xs font-bold whitespace-nowrap text-mid sm:gap-5 sm:text-sm">
          <Link href="/admin/offerings" className="py-3 transition-colors hover:text-blue">
            Offerings
          </Link>
          <Link href="/admin/venues" className="py-3 transition-colors hover:text-blue">
            Venues
          </Link>
          <Link href="/account" className="py-3 transition-colors hover:text-blue">
            Member site
          </Link>
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
