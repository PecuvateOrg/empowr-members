// Small shared form primitives in the Empowr brand system — enough for
// auth + account forms without pulling shadcn in yet (revisit at Step 3+
// when dialog/table/calendar primitives are genuinely needed).
//
// No hooks in this file. Server components (e.g. app/auth/confirm/page.tsx)
// import Input/Label/etc directly without "use client" — a hook anywhere
// in here would force every consumer into the client bundle. PasswordInput
// needs useState, so it lives in its own client-only file instead.
import { type ComponentProps, forwardRef } from "react";

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`block text-sm font-bold text-black ${className}`}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black placeholder:text-muted focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft disabled:opacity-60 ${className}`}
        {...props}
      />
    );
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<"textarea">
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black placeholder:text-muted focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft disabled:opacity-60 ${className}`}
      {...props}
    />
  );
});

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm font-semibold text-red-dark">{message}</p>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary:
      "bg-blue text-white shadow-blue hover:bg-blue-dark disabled:hover:bg-blue",
    secondary:
      "border border-line bg-card text-black hover:border-blue hover:text-blue",
    danger: "bg-red-soft text-red-dark hover:bg-red hover:text-white",
  }[variant];
  return (
    <button
      className={`rounded-full px-6 py-2.5 font-extrabold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    />
  );
}

export function FormNotice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  const styles =
    tone === "success"
      ? "bg-blue-pale text-blue-dark"
      : "bg-red-soft text-red-dark";
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${styles}`}>
      {children}
    </div>
  );
}
