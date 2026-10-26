"use client";

// Marks a message read once the page is actually on screen. A POST from the browser, not a side effect of
// rendering on the server: link prefetches and crawlers GET the page and must not mark anything read.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MESSAGES_CHANGED_EVENT } from "@/components/messaging/MessagesNavLink";

export function MarkRead({ messageId, alreadyRead }: { messageId: string; alreadyRead: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (alreadyRead) return;
    let cancelled = false;
    fetch(`/api/messages/${messageId}/read`, { method: "POST" })
      .then((response) => {
        if (!response.ok || cancelled) return;
        window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
        router.refresh();
      })
      .catch(() => {
        // Left unread; it will be marked next time it is opened.
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, alreadyRead, router]);
  return null;
}
