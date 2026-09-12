"use client";

import { type ComponentProps, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** A password field with a show/hide toggle, so a member can check what
 *  they typed before submitting rather than guessing from a row of dots.
 *  Client-only (needs useState) and deliberately kept out of ui/form.tsx,
 *  which server components import without "use client". */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<"input">, "type">
>(function PasswordInput({ className = "", ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={`w-full rounded-xl border border-line bg-card px-4 py-2.5 pr-11 text-black placeholder:text-muted focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft disabled:opacity-60 ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-blue"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  );
});
