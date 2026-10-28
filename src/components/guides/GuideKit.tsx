import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, AlertTriangle, Info } from "lucide-react";

// Building blocks for the staff guides under /admin/guides and /checkin/guide.
// Each guide is written once as a component; the routes only choose where the
// back link points, so the admin and door copies can never disagree again.

export function GuidePage({
  backHref,
  backLabel,
  title,
  intro,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
      </Link>
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">{title}</h1>
        {intro && <p className="mt-1 text-mid">{intro}</p>}
      </div>
      {children}
    </main>
  );
}

export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-extrabold text-black">{title}</h2>
      <div className="mt-3 space-y-3 text-sm font-semibold text-mid [&_strong]:text-black [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_h3]:pt-2 [&_h3]:text-base [&_h3]:font-extrabold [&_h3]:text-black">
        {children}
      </div>
    </section>
  );
}

export function Warning({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-red bg-red-soft px-4 py-3 text-sm font-semibold text-mid">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-dark" aria-hidden />
        <span>
          {title && <strong className="text-red-dark">{title} </strong>}
          {children}
        </span>
      </p>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A simple two-or-more column table that scrolls sideways on a phone
 *  instead of pushing the page wider. */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-line px-1 py-2 font-extrabold text-black">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="align-top">
              {cells.map((c, j) => (
                <td key={j} className="border-b border-line px-1 py-2 font-semibold text-mid">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "The customer says…" style question and answer pairs. */
export function QA({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="space-y-4">
      {items.map(([q, a], i) => (
        <div key={i}>
          <dt className="font-extrabold text-black">{q}</dt>
          <dd className="mt-1">{a}</dd>
        </div>
      ))}
    </dl>
  );
}
