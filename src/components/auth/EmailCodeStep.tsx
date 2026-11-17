"use client";

// Step two of every email sign-in and sign-up (owner, 2026-11-17: passwords removed in favour of an
// emailed code, then a passkey). The member types or pastes the 6-digit code; it signs in here, in
// this browser, which matters for the installed app on iPhone: a link would open Safari or the Gmail
// app instead and sign them in there.
//
// autoComplete="one-time-code" lets iPhone offer the code above the keyboard when the email arrives
// in Apple Mail. A full code (typed or pasted) submits itself.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";

export const CODE_LENGTH = 6; // mirrors auth config mailer_otp_length

export function EmailCodeStep({
  email,
  next,
  onResend,
  onChangeEmail,
}: {
  email: string;
  next: string;
  /** Asks for a new code; returns an error message or null. */
  onResend: () => Promise<string | null>;
  onChangeEmail: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  async function verify(token: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      setBusy(false);
      setCode("");
      setError(
        /expired|invalid/i.test(verifyError.message)
          ? "That code is wrong or has expired. Check the latest email, or send a new code."
          : verifyError.message
      );
      inputRef.current?.focus();
      return;
    }
    router.push(next);
    router.refresh();
  }

  function onChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  }

  async function resend() {
    setError(null);
    setNotice(null);
    const message = await onResend();
    if (message) setError(message);
    else setNotice("A new code is on its way.");
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === CODE_LENGTH) void verify(code);
      }}
    >
      <FormNotice tone="success">
        We&apos;ve emailed a {CODE_LENGTH}-digit code to <strong>{email}</strong>. It expires in 10 minutes.
      </FormNotice>
      {error && <FormNotice tone="error">{error}</FormNotice>}
      {notice && !error && <FormNotice tone="success">{notice}</FormNotice>}
      <div>
        <Label htmlFor="email-code">Your code</Label>
        <Input
          ref={inputRef}
          id="email-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH + 4}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          className="mt-1 text-center text-2xl font-black tracking-[0.5em]"
        />
      </div>
      <Button type="submit" disabled={busy || code.length !== CODE_LENGTH} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between gap-4 text-sm font-semibold">
        <button type="button" onClick={onChangeEmail} className="min-h-11 text-blue underline">
          Use a different email
        </button>
        <button type="button" onClick={resend} className="min-h-11 text-blue underline">
          Send a new code
        </button>
      </div>
    </form>
  );
}
