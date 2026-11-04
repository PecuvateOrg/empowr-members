"use client";

import { useState } from "react";

/** One labelled value with a Copy button — for details staff paste into another app. */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-black">{label}</span>
      <code className="max-w-full break-all rounded bg-blue-pale/40 px-2 py-1 text-xs">{value}</code>
      <button
        type="button"
        className="font-bold text-blue underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
