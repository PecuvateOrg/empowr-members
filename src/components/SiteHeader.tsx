import Image from "next/image";
import Link from "next/link";
import { CollapsibleNav } from "@/components/CollapsibleNav";

// One header for the member-facing app, public catalogue included.
//
// /sessions previously rendered its own PublicHeader with a different set
// of links, so a signed-in member tapping "Sessions" landed on what felt
// like a different site: no Bookings link, no menu button, no wordmark.
// The links are identical everywhere now; only the auth action differs,
// and that resolves client-side so this stays statically rendered.
const LINKS = [
  { href: "/sessions", label: "Sessions" },
  { href: "/bookings", label: "Bookings" },
  { href: "/account", label: "Account" },
];

export function SiteHeader() {
  return (
    // `relative` anchors the collapsed menu panel.
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
          <span className="text-lg font-black tracking-tight whitespace-nowrap text-black">
            Empowr Members
          </span>
        </Link>
        <CollapsibleNav links={LINKS} menuId="site-menu" />
      </div>
    </header>
  );
}
