"use client";

import { useState } from "react";
import { Button, FormNotice } from "@/components/ui/form";

export function DeletionLinkAction(props: { kind: "confirm" | "cancel"; id: string; token: string; label: string; done: string; danger: boolean }) {
  const [state, setState] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act() {
    setBusy(true);
    const res = await fetch(`/api/account/deletion/${props.kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: props.id, t: props.token }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setState(res.ok ? { tone: "success", message: props.done } : { tone: "error", message: body.error ?? "Something went wrong. Please try again." });
  }

  if (state?.tone === "success") return <FormNotice tone="success">{state.message}</FormNotice>;
  return (
    <div className="space-y-4">
      {state && <FormNotice tone="error">{state.message}</FormNotice>}
      <Button variant={props.danger ? "danger" : "primary"} disabled={busy} onClick={act}>
        {busy ? "Working…" : props.label}
      </Button>
    </div>
  );
}
