"use client";

// A link to /waiver that remembers the current page, so the waiver's
// success screen can offer "Continue your booking" straight back to it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { waiverHref } from "@/lib/waiver-return";

export function WaiverLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={waiverHref(pathname)} className={className}>
      {children}
    </Link>
  );
}
