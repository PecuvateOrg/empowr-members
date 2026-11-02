import Link from "next/link";

/** Sent / Inbox switch at the top of admin Messages. */
export function MessagesTabs({ active, unread }: { active: "sent" | "inbox"; unread: number }) {
  const tab = (on: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-extrabold ${
      on ? "bg-blue text-white" : "border border-line bg-card text-black hover:text-blue"
    }`;
  return (
    <nav aria-label="Messages" className="flex gap-2">
      <Link href="/admin/messages/inbox" aria-current={active === "inbox" ? "page" : undefined} className={tab(active === "inbox")}>
        Inbox
        {unread > 0 && (
          <span className={`rounded-full px-2 text-xs ${active === "inbox" ? "bg-white text-blue" : "bg-blue text-white"}`}>
            {unread}
          </span>
        )}
      </Link>
      <Link href="/admin/messages" aria-current={active === "sent" ? "page" : undefined} className={tab(active === "sent")}>
        Sent
      </Link>
    </nav>
  );
}
