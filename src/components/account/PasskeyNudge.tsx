"use client";

// "Sign in with Face ID next time?" (owner, 2026-11-17). Passwords are gone, so without a passkey every
// sign-in means fetching an emailed code. Shown on /account and in the admin area while the account
// has no passkey; "Not now" hides it on this device for 30 days. Full management stays in PasskeyManager.

import { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, FormNotice } from "@/components/ui/form";

const DISMISS_KEY = "passkey-nudge-dismissed-at";
const DISMISS_DAYS = 30;

export function PasskeyNudge() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (typeof window.PublicKeyCredential !== "function") return;
    try {
      const at = Number(window.localStorage.getItem(DISMISS_KEY));
      if (at && Date.now() - at < DISMISS_DAYS * 86_400_000) return;
    } catch {
      // no storage: still offer it
    }
    void createClient()
      .auth.passkey.list()
      .then(({ data, error }) => setShow(!error && (data?.length ?? 0) === 0));
  }, []);

  function notNow() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // hidden for this visit only
    }
  }

  async function add() {
    setBusy(true);
    setResult(null);
    const { error } = await createClient().auth.registerPasskey();
    setBusy(false);
    if (!error) return setResult({ tone: "success", message: "Done. Next time, tap \"Sign in with a passkey\"." });
    if (/abort|cancel|not allowed/i.test(error.message)) return;
    setResult({ tone: "error", message: "Could not add the passkey. Please try again." });
  }

  if (!show) return null;

  return (
    <section className="relative rounded-2xl border-2 border-blue bg-card p-6 shadow-sm sm:p-8">
      {result?.tone !== "success" && (
        <button
          type="button"
          onClick={notNow}
          aria-label="Not now"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-mid hover:bg-warm-white hover:text-black"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      )}
      <h2 className="pr-10 text-xl font-extrabold text-black">Skip the code next time</h2>
      <p className="mt-1 text-sm text-mid">
        Add a passkey and sign in with your face, fingerprint or phone PIN. No email, no code.
      </p>
      {result ? (
        <div className="mt-4">
          <FormNotice tone={result.tone}>{result.message}</FormNotice>
        </div>
      ) : (
        <Button type="button" onClick={add} disabled={busy} className="mt-4 inline-flex min-h-12 items-center gap-2">
          <Fingerprint className="h-5 w-5" aria-hidden /> {busy ? "Setting up…" : "Add a passkey"}
        </Button>
      )}
    </section>
  );
}
