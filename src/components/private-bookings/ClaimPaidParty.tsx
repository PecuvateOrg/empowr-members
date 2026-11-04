"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ClaimPaidParty({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-3"><button disabled={busy} className="rounded-full bg-blue px-6 py-3 font-bold text-white disabled:opacity-50" onClick={async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/private-bookings/setup/${token}`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Could not set up your party.");
      router.refresh();
    } catch(e) {setError(e instanceof Error ? e.message : "Please try again.");}
    finally {setBusy(false);}
  }}>{busy ? "Setting up…" : "Connect this party to my account"}</button>{error && <p role="alert" className="text-red-dark">{error}</p>}</div>;
}
