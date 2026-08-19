import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Footer } from "@/components/Footer";
import PostHogProvider from "@/components/PostHogProvider";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  metadataBase: new URL("https://members.empowrcic.org"),
  // TEMPORARY — remove at public launch.
  //
  // Keeps the site out of search results while it is being reviewed. The
  // site is already publicly reachable (no password gate; that needs a
  // Netlify Pro plan), so this does NOT stop anyone who has the URL — it
  // only stops a half-reviewed platform becoming the indexed public face
  // of members.empowrcic.org, which is the part that is slow to undo.
  //
  // Deliberately NOT paired with a robots.txt Disallow: blocking the
  // crawl would stop search engines ever READING this tag, and a blocked
  // page can still be listed as a bare URL. noindex is the thing that
  // actually keeps pages out of results, so the crawl must stay allowed.
  //
  // No page sets its own `robots`, so every route inherits this. Removing
  // these two lines restores normal indexing.
  robots: { index: false, follow: false },
  title: "Empowr Members",
  description:
    "Book sessions, manage your membership, and access everything Empowr CIC offers — in one place.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Empowr Members",
    description:
      "Book sessions, manage your membership, and access everything Empowr CIC offers — in one place.",
    url: "https://members.empowrcic.org",
    siteName: "Empowr Members",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Empowr Members",
    description:
      "Book sessions, manage your membership, and access everything Empowr CIC offers — in one place.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body
        className={`${nunito.variable} flex min-h-screen flex-col bg-cream font-sans antialiased`}
      >
        <PostHogProvider>
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
          <CookieConsentBanner />
        </PostHogProvider>
      </body>
    </html>
  );
}
