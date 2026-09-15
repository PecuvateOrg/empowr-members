import { links } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-line bg-warm-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-8 sm:px-6 text-sm text-mid sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Empowr CIC. Company no. 13660924.</p>
        {/* DESKTOP ONLY. On a phone these three sit immediately above the
            fixed bottom bar, which made the end of every page a stack of
            pale chrome. They moved into the bottom bar's Menu panel instead
            — same three links, same order, one tap away rather than a
            scroll to the bottom. Keep the two lists in step: BottomNav's
            LEGAL_LINKS is the mobile copy of this. */}
        <div className="hidden flex-wrap gap-x-5 gap-y-1 sm:flex">
          <a
            href={links.privacyPolicy}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-blue"
          >
            Privacy Policy
          </a>
          <a
            href={links.termsAndConditions}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-blue"
          >
            Terms &amp; Conditions
          </a>
          <a
            href={links.riskWaiver}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-blue"
          >
            Risk Waiver
          </a>
        </div>
      </div>
    </footer>
  );
}
