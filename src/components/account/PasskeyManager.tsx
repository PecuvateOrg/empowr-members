"use client";

import { useCallback, useEffect, useState } from "react";
import type { PasskeyListItem } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button, FormNotice } from "@/components/ui/form";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Add and remove passkeys (Face ID, Touch ID, Windows Hello, a phone).
 *  Everything goes through Supabase Auth's own passkey store — this app keeps
 *  no table of its own, so there is nothing here to drift from what sign-in
 *  actually accepts. Rendered only when NEXT_PUBLIC_PASSKEYS_ENABLED is on. */
export function PasskeyManager() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().auth.passkey.list();
    // A failed read must not look like "no passkeys" — that would invite a
    // member to add a duplicate, or think one they rely on has gone.
    if (error) {
      setNotice({ tone: "error", message: "Could not load your passkeys. Refresh to try again." });
      return;
    }
    setPasskeys(data);
  }, []);

  useEffect(() => {
    const ok = typeof window.PublicKeyCredential === "function";
    setSupported(ok);
    if (ok) load();
  }, [load]);

  async function add() {
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().auth.registerPasskey();
    setBusy(false);
    if (error) {
      if (/abort|cancel|not allowed/i.test(error.message)) return;
      setNotice({
        tone: "error",
        message: /exist|already/i.test(error.message)
          ? "This device already has a passkey for your account."
          : "Could not add the passkey. Please try again.",
      });
      return;
    }
    setNotice({ tone: "success", message: "Passkey added — you can use it next time you sign in." });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this passkey? You can still sign in with your email.")) return;
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().auth.passkey.delete({ passkeyId: id });
    setBusy(false);
    if (error) {
      setNotice({ tone: "error", message: "Could not remove the passkey. Please try again." });
      return;
    }
    load();
  }

  if (supported === null) return null;
  if (!supported) {
    return (
      <p className="text-sm font-semibold text-mid">
        This browser doesn&apos;t support passkeys. Try again on your phone or
        an up-to-date browser.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {notice && <FormNotice tone={notice.tone}>{notice.message}</FormNotice>}
      {passkeys && passkeys.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-bold text-black">{p.friendly_name || "Passkey"}</p>
                <p className="text-sm text-mid">
                  Added {dateFormat.format(new Date(p.created_at))}
                  {p.last_used_at &&
                    ` · last used ${dateFormat.format(new Date(p.last_used_at))}`}
                </p>
              </div>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => remove(p.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" disabled={busy || passkeys === null} onClick={add}>
        {busy ? "Waiting for your device…" : "Create a passkey"}
      </Button>
    </div>
  );
}
