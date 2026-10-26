"use client";

// The unread-message badge, in the two shapes the nav needs: an icon at the far right of the desktop
// header (`MessagesNavLink`) and a row in the touch Menu panel (`MessagesMenuRow`), with `useUnreadMessages`
// shared so they cannot disagree.
//
// CLIENT-SIDE ON PURPOSE. SiteHeader is statically rendered and also appears on public pages; reading the
// count on the server would call cookies() and de-opt every one of them (see AuthNavAction for the same
// constraint). The count is fetched after mount, through the member's own RLS-scoped client, so it can only
// ever count their own rows. `null` = not signed in / not known yet: nothing is rendered, so a signed-out
// visitor never sees a Messages link.
//
// The bottom bar still carries exactly three slots (owner, 2026-09-15). Messages lives in the Menu panel, and
// the Menu tab shows a dot when something is unread.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Fired by anything that changes what is unread (opening a message). */
export const MESSAGES_CHANGED_EVENT = "empowr:messages-changed";

export function useUnreadMessages(): number | null {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function refresh() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (active) setCount(null);
        return;
      }
      const { count: unread, error } = await supabase
        .from("mem_message_recipients")
        .select("message_id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) {
        // A failed count must not look like "all read" - hide the badge but keep the link.
        console.error("unread message count failed", error.message);
        if (active) setCount(0);
        return;
      }
      if (active) setCount(unread ?? 0);
    }

    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(MESSAGES_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener(MESSAGES_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return count;
}

export function unreadLabel(count: number | null): string {
  return count ? `Messages, ${count} unread` : "Messages";
}

export function UnreadPill({ count, className = "" }: { count: number | null; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-hidden
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue px-1 text-[11px] font-black leading-none text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Desktop header icon, next to the basket. Renders nothing when signed out. */
export function MessagesNavLink() {
  const pathname = usePathname();
  const count = useUnreadMessages();
  if (count === null) return null;
  const active = pathname === "/messages" || pathname.startsWith("/messages/");
  return (
    <Link
      href="/messages"
      aria-current={active ? "page" : undefined}
      aria-label={unreadLabel(count)}
      className={`relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors lg:flex ${
        active ? "text-blue" : "text-mid hover:text-blue"
      }`}
    >
      <Mail className="h-6 w-6" aria-hidden />
      <UnreadPill count={count} className="absolute right-1 top-1" />
    </Link>
  );
}

/** A small dot on the bottom bar's Menu tab while something is unread, so the badge is not hidden inside a
 *  closed panel. Decorative: the panel row carries the accessible count. */
export function MenuUnreadDot() {
  const count = useUnreadMessages();
  if (!count) return null;
  return <span aria-hidden className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue ring-2 ring-warm-white" />;
}

/** The Messages row in the touch Menu panel. */
export function MessagesMenuRow({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const count = useUnreadMessages();
  if (count === null) return null;
  const active = pathname === "/messages" || pathname.startsWith("/messages/");
  return (
    <Link
      href="/messages"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={unreadLabel(count)}
      className={`flex items-center gap-2 border-b border-line/60 py-3 transition-colors ${active ? "text-blue" : "hover:text-blue"}`}
    >
      Messages
      <UnreadPill count={count} />
    </Link>
  );
}
