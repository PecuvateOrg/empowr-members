import { DiscountManager } from "@/components/admin/DiscountManager";

export default function DiscountsPage() {
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-black">Discount codes</h1>
    <p className="font-semibold text-mid">Create a code for all sessions or one session type. Members apply it in their basket when booking.</p>
    <DiscountManager />
  </main>;
}
