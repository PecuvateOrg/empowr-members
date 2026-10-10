"use client";

import { useState } from "react";

export function InviteLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-mid">Invite link:</span>
      <code className="max-w-full truncate rounded bg-blue-pale/40 px-2 py-1 text-xs">{url}</code>
      <button
        type="button"
        className="font-bold text-blue underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
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
