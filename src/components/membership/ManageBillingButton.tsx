"use client";

// Opens Stripe's hosted Customer Portal. Cancellation, card updates and
// invoice history live there rather than being rebuilt here — see the
// reasoning in app/api/memberships/portal/route.ts.
import { useState } from "react";
import { Button, FormNotice } from "@/components/ui/form";

export function ManageBillingButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/memberships/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.portal_url) {
        setError(body.error ?? "Could not open the billing portal.");
        setPending(false);
        return;
      }
      window.location.href = body.portal_url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <FormNotice tone="error">{error}</FormNotice>}
      <Button type="button" variant="secondary" onClick={open} disabled={pending}>
        {pending ? "Opening…" : "Manage or cancel"}
      </Button>
    </div>
  );
}
