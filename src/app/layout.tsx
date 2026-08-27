import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Footer } from "@/components/Footer";
import PostHogProvider from "@/components/PostHogProvider";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  metadataBase: new URL("https://members.empowrcic.org"),
  // Launched publicly 2026-08-27 — the temporary `robots: { index: false }`
  // that sat here through the review period has been removed, so every route
  // now indexes normally. app/robots.ts allows the crawl of the public
  // catalogue; member and admin areas are disallowed there because they are
  // behind auth, not because they are secret.
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
