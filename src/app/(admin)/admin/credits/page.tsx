import { CreditManager } from "@/components/admin/CreditManager";
export const dynamic = "force-dynamic";
export default function CreditsPage() {
  return <main className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6"><h1 className="text-3xl font-black">Member credit notes</h1><p>Issue credit for a Members booking or a verified booking from the old platform.</p><CreditManager /></main>;
}
