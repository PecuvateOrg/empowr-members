"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Guest registration link"
        className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs text-black"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-full bg-blue px-5 py-2 text-sm font-extrabold text-white"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
