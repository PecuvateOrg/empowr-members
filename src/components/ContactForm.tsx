"use client";

// Members contact form (owner, 2026-10-10): the Members way to reach
// Empowr, in place of an email address. It posts to the same backend as the
// main site's own form (empowrcic.org/contact): Main Site's
// netlify/functions/contact.ts sends it to PecuvateCRM's enquiries
// (Escalations), falling back to enquiries@, with the visitor's
// confirmation email. Subject is prefixed "Members —" and source is
// "members", so the team can see where it came from.
//
// Members has its own Turnstile widget. Its secret lives on Main Site
// (MEMBERS_TURNSTILE_SECRET_KEY), which picks it by this request's origin.
import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Button, FormNotice, Input, Label, Textarea } from "@/components/ui/form";
import { links } from "@/lib/links";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// The `www` host, not the apex: the apex redirects, and browsers fail a
// redirected CORS preflight outright (the same reason EELA uses www).
const CONTACT_ENDPOINT = "https://www.empowrcic.org/.netlify/functions/contact";

const TOPICS = [
  "Bookings and sessions",
  "Membership",
  "Private bookings and parties",
  "Payments and refunds",
  "My account",
  "Something else",
] as const;

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [turnstileToken, setTurnstileToken] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          subject: `Members — ${form.get("topic")}`,
          message: form.get("message"),
          // Honeypot — real users leave this blank; bots fill it in.
          company: form.get("company"),
          source: "members",
          turnstileToken,
        }),
      });
      if (!res.ok) throw new Error("Non-OK response");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <FormNotice tone="success">
        Thanks — we&apos;ve got your message and will reply within 2 working days. We&apos;ve
        sent you a confirmation email too.
      </FormNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="contact-name">Your name</Label>
        <Input id="contact-name" name="name" className="mt-1" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" name="email" type="email" className="mt-1" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="contact-topic">What is it about?</Label>
        <select
          id="contact-topic"
          name="topic"
          required
          defaultValue=""
          className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
        >
          <option value="" disabled>Choose one</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="contact-message">Message</Label>
        <Textarea id="contact-message" name="message" rows={6} className="mt-1" required />
      </div>
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="contact-company">Company</label>
        <input id="contact-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {TURNSTILE_SITE_KEY && (
        <Turnstile
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={setTurnstileToken}
          onError={() => setTurnstileToken("")}
          onExpire={() => setTurnstileToken("")}
        />
      )}

      {status === "error" && (
        <FormNotice tone="error">Your message could not be sent. Please try again.</FormNotice>
      )}

      <p className="text-xs text-mid">
        We use your details only to reply to you. See our{" "}
        <a href={links.privacyPolicy} target="_blank" rel="noopener noreferrer" className="font-bold underline">
          Privacy Policy
        </a>
        .
      </p>

      <Button type="submit" disabled={status === "submitting" || (!!TURNSTILE_SITE_KEY && !turnstileToken)}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
