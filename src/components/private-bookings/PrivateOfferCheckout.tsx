"use client";
import { useState } from "react";

export function PrivateOfferCheckout({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-3">
    <button disabled={busy} className="rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
      onClick={async () => {
        setBusy(true); setError("");
        try {
          const response = await fetch(`/api/private-bookings/offers/${token}`, { method: "POST" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not start payment.");
          window.location.assign(data.checkout_url);
        } catch (e) { setError(e instanceof Error ? e.message : "Could not start payment."); setBusy(false); }
      }}>{busy ? "Opening payment…" : "Continue to payment"}</button>
    {error && <p role="alert" className="text-red-dark">{error}</p>}
  </div>;
}
