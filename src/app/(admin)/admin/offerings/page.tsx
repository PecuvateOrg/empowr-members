import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listAdminOfferings } from "@/lib/admin-data";
import { TYPE_LABELS_SINGULAR } from "@/lib/catalogue";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/form";

export const metadata: Metadata = { title: "Offerings — Members Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOfferingsPage() {
  const offerings = await listAdminOfferings();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black">
            Offerings
          </h1>
          <p className="mt-1 text-mid">
            Session types, courses, camps and events. Manage dates and course
            runs from an offering&apos;s own page.
          </p>
        </div>
        <Link href="/admin/offerings/new">
          <Button className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" aria-hidden /> New offering
          </Button>
        </Link>
      </div>

      {offerings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No offerings yet — create the first one.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {offerings.map((offering) => (
            <li key={offering.id}>
              <Link
                href={`/admin/offerings/${offering.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
              >
                <div>
                  <p className="font-extrabold text-black">
                    {offering.title}
                    {!offering.active && (
                      <span className="ml-2 rounded-full bg-line px-2.5 py-0.5 text-xs font-bold text-mid">
                        Inactive
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-semibold text-mid">
                    {TYPE_LABELS_SINGULAR[offering.type]} · {offering.slug}
                  </p>
                </div>
                <span className="font-black text-blue">
                  {formatPrice(offering.price_pence)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
