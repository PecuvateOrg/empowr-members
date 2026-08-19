import Image from "next/image";
import Link from "next/link";
import { CollapsibleNav } from "@/components/CollapsibleNav";

const LINKS = [
  { href: "/sessions", label: "Sessions" },
  { href: "/bookings", label: "Bookings" },
  { href: "/account", label: "Account" },
];

export function MemberHeader() {
  return (
    <header className="relative border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px]"
          />
          {/* Wordmark stays visible at every width now the nav collapses. */}
          <span className="text-lg font-black tracking-tight whitespace-nowrap text-black">
            Empowr Members
          </span>
        </Link>
        <CollapsibleNav links={LINKS} menuId="member-menu" />
      </div>
    </header>
  );
}
