"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { londonSlotIso } from "@/lib/private-bookings";

const input = "rounded-xl border border-line bg-white px-3 py-2 text-black";

const SPANS = [
  { value: "15-1", label: "3–4pm", hour: 15 as const, hours: 1 as const },
  { value: "16-1", label: "4–5pm", hour: 16 as const, hours: 1 as const },
  { value: "15-2", label: "3–5pm (whole slot)", hour: 15 as const, hours: 2 as const },
];

export function PrivateBlockForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [span, setSpan] = useState("15-2");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    const chosen = SPANS.find((s) => s.value === span)!;
    if (!date) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/private-bookings/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          starts_at: londonSlotIso(date, chosen.hour),
          hours: chosen.hours,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: "Blocked." });
        setNote("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: body.error ?? "Could not block that time." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-wrap items-end gap-3 text-sm"
    >
      <label className="flex flex-col gap-1 font-bold text-mid">
        Saturday
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 font-bold text-mid">
        Time
        <select value={span} onChange={(e) => setSpan(e.target.value)} className={input}>
          {SPANS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 font-bold text-mid">
        Reason (internal)
        <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
      </label>
      <button
        type="submit"
        disabled={busy || !date}
        className="rounded-full bg-blue px-5 py-2 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Blocking…" : "Block"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className="w-full text-black">
          {message.text}
        </p>
      )}
    </form>
  );
}

export function UnblockButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        const res = await fetch(`/api/admin/private-bookings/${id}/unblock`, { method: "POST" }).catch(() => null);
        if (res?.ok) router.refresh();
        else setFailed(true);
        setBusy(false);
      }}
      className="rounded-full border border-line px-4 py-1.5 text-sm font-bold text-black disabled:opacity-50"
    >
      {busy ? "…" : failed ? "Failed — retry" : "Unblock"}
    </button>
  );
}
