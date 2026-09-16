import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.0/16", "10.0.0.0/8"],

  // IMAGE OPTIMISATION IS OFF BECAUSE IT WAS BROKEN IN PRODUCTION, and
  // because this app has nothing for it to do.
  //
  // Measured on members.empowrcic.org, 2026-09-16:
  //   /_next/image?url=/logo.png&w=256  ->  502 after ~40s, repeatedly
  //   /_next/image?url=/logo.png&w=64   ->  200, but after 32-38s
  //   /logo.png (the raw file)          ->  200 in 0.5s
  // The logo sits in the header of EVERY page, so every visitor was waiting
  // on a request that mostly failed. The file is not the problem: 1080x1080,
  // 37.5KB, 8-bit RGBA, no ICC profile, no ancillary chunks. Middleware
  // already excludes /_next/image, so that is not it either. The fault is in
  // the hosting side's optimiser.
  //
  // Turning it off globally rather than passing `unoptimized` at five call
  // sites is deliberate: grep the app and there are exactly two kinds of
  // image in it — /logo.png, and QR codes rendered from data: URLs, which
  // the optimiser never touches anyway. So this costs nothing real (37.5KB
  // served raw for a logo shown at 44-72px) and it cannot be defeated by
  // someone adding a sixth <Image> and not knowing about this.
  //
  // If the platform fixes the optimiser and a real photo is ever added to
  // this app, revisit — but re-measure the URLs above first.
  images: { unoptimized: true },

  // Netlify's [[headers]] block covers CDN-served files, but not HTML emitted
  // by the Next.js runtime. Keep the baseline on both paths so pages and
  // static assets receive the same browser protections.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // "Beginners Foundation" is singular — Empowr's own wording: it is the
      // foundation of a skater's skills. The slug stayed plural until
      // 2026-08-31. The page had been publicly reachable since launch on
      // 08-27, so the old URL is kept alive rather than left to 404: it costs
      // three lines, and /sessions/[slug] sets dynamicParams = false, which
      // means a retired slug returns a hard 404 with nothing to follow.
      //
      // Permanent (308) because the rename is not going to be reversed.
      {
        source: "/sessions/beginners-foundations",
        destination: "/sessions/beginners-foundation",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
