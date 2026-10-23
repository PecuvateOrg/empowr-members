"use client";

// The request step. The reason is optional (UK GDPR: deletion can't depend on giving one) and is
// stored without any link to the account.
import { useState } from "react";
import { Button, FormNotice, Label, Textarea } from "@/components/ui/form";

const REASONS = [
  ["child_stopped", "My child no longer skates"],
  ["moving_away", "Moving away"],
  ["too_expensive", "Too expensive"],
  ["unhappy_sessions", "Not happy with sessions"],
  ["rather_not_say", "Rather not say"],
  ["other", "Other"],
] as const;

export function DeleteAccountForm() {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [state, setState] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setState(null);
    const res = await fetch("/api/account/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, detail: reason === "other" ? detail : null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setState(res.ok
      ? { tone: "success", message: "We've emailed you a link to confirm. Your account stays as it is until you click it." }
      : { tone: "error", message: body.error ?? "Something went wrong. Please try again." });
  }

  if (state?.tone === "success") return <FormNotice tone="success">{state.message}</FormNotice>;

  return (
    <div className="space-y-5">
      {state && <FormNotice tone="error">{state.message}</FormNotice>}
      <fieldset>
        <legend className="text-sm font-bold text-black">Why are you leaving? (optional)</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 text-sm has-[:checked]:border-blue">
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {reason === "other" && (
        <div>
          <Label htmlFor="delete-detail">Tell us more (optional)</Label>
          <Textarea id="delete-detail" className="mt-1" maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 text-sm text-black">
        <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        I understand my account will be locked when I confirm and deleted on the date shown above.
      </label>
      <Button variant="danger" disabled={!understood || busy} onClick={submit}>
        {busy ? "Sending…" : "Email me a confirmation link"}
      </Button>
    </div>
  );
}
