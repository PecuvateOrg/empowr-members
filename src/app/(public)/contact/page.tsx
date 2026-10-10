import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "Contact us — Empowr Members" };

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-black">Contact us</h1>
        <p className="mt-1 text-mid">
          Questions about bookings, membership, parties or your account — send us a message and
          we&apos;ll get back to you.
        </p>
      </div>
      <ContactForm />
    </main>
  );
}
