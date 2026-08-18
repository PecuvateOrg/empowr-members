import { links } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-line bg-warm-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-8 sm:px-6 text-sm text-mid sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Empowr CIC. Company no. 13660924.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
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
