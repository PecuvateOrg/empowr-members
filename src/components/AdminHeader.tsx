import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";

export function AdminHeader() {
  return (
    // `relative` anchors AdminNav's mobile panel, which positions itself
    // at top-full across the full header width.
    <header className="relative border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px]"
          />
          {/* Visible at every width again: collapsing the nav behind a
              menu button below `sm` freed the room that previously forced
              this to be hidden. */}
          <span className="text-lg font-black tracking-tight whitespace-nowrap text-black">
            Members Admin
          </span>
        </Link>
        <AdminNav />
      </div>
    </header>
  );
}
