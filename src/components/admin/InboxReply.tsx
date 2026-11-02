"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormNotice, Input, Label, Textarea } from "@/components/ui/form";
import type { ContactStatus } from "@/lib/contact-inbox";

/** Reply to a contact-form message, or close/reopen it without replying. */
export function InboxReply({ id, topic, status, linked }: { id: string; topic: string; status: ContactStatus; linked: boolean }) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function post(payload: object): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That did not work. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("That did not work. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (await post({ action: "reply", request_id: requestId, subject: form.get("subject"), body: form.get("body") })) setSent(true);
  }

  if (sent) return <FormNotice tone="success">Reply sent.</FormNotice>;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-6">
      <h2 className="text-xl font-extrabold text-black">Reply</h2>
      <p className="text-sm text-mid">
        {linked
          ? "Goes to their Notifications in Members, by email and as a phone alert if they have alerts on."
          : "Goes by email to the address they gave."}
      </p>
      <form onSubmit={reply} className="space-y-4">
        <div>
          <Label htmlFor="reply-subject">Subject</Label>
          <Input id="reply-subject" name="subject" className="mt-1" required maxLength={150} defaultValue={`Re: ${topic}`} />
        </div>
        <div>
          <Label htmlFor="reply-body">Message</Label>
          <Textarea id="reply-body" name="body" rows={6} className="mt-1" required maxLength={5000} />
        </div>
        {error && <FormNotice tone="error">{error}</FormNotice>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reply"}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ action: "status", status: status === "closed" ? "open" : "closed" })}
            className="min-h-11 rounded-full border border-line px-5 text-sm font-extrabold text-black hover:text-blue"
          >
            {status === "closed" ? "Reopen" : "Close without replying"}
          </button>
        </div>
      </form>
    </section>
  );
}
