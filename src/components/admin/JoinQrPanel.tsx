"use client";

// Door: a guest who arrives unregistered scans this on the staff phone,
// then joins the party and signs the waiver on their own phone. Refresh the
// guest list afterwards to see them with their waiver badge.
import { useState } from "react";
import Image from "next/image";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/form";

export function JoinQrPanel({ url, qrDataUrl }: { url: string; qrDataUrl: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <Button type="button" onClick={() => setOpen((o) => !o)}>
        <QrCode className="mr-2 inline h-5 w-5" aria-hidden />
        {open ? "Hide QR code" : "Show QR code for a guest to join"}
      </Button>
      {open && (
        <div className="mt-4 space-y-3 text-center">
          <p className="font-bold text-black">
            Guest scans this, registers and signs the waiver on their phone. Then refresh this page.
          </p>
          {qrDataUrl ? (
            <Image src={qrDataUrl} alt="QR code to join this booking" width={300} height={300} unoptimized className="mx-auto" />
          ) : (
            <p className="text-sm font-bold text-red-dark">The QR code could not be made — use the link below.</p>
          )}
          <p className="break-all text-xs text-mid">{url}</p>
        </div>
      )}
    </section>
  );
}
