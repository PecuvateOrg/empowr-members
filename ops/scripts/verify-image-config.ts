/**
 * verify-image-config.ts
 *
 * Run:
 *   npm run verify:image-config
 *
 * THE INCIDENT THIS EXISTS FOR. On 2026-09-16 the hosting platform's image
 * optimiser was timing out on the Empowr logo in production:
 *
 *   /_next/image?url=/logo.png&w=256  ->  502 after ~40s, repeatedly
 *   /_next/image?url=/logo.png&w=64   ->  200, but after 32-38s
 *   /logo.png (the raw file)          ->  200 in 0.5s
 *
 * The logo is in the header of every page, so every visitor on the live site
 * was waiting on a request that mostly failed. `images: { unoptimized: true }`
 * routes around it.
 *
 * This is pinned rather than left to a comment because the failure is
 * INVISIBLE from inside the app: nothing throws, no build breaks, no test
 * goes red, and `next/image` reserves the box from its width/height
 * attributes so the layout does not even shift. The page just quietly waits
 * on an image that never arrives. Someone tidying config months from now
 * would have no way to know, and no symptom to find.
 *
 * It is also why the fix is global rather than `unoptimized` on each call
 * site: a sixth <Image> added later would silently reintroduce it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..", "src");
const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

function tsxFilesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") return [];
        return tsxFilesUnder(full);
      }
      return entry.name.endsWith(".tsx") ? [full] : [];
    });
}

test("image optimisation stays off while the platform optimiser is broken", () => {
  assert.match(
    config.replace(/\s+/g, " "),
    /images: \{ unoptimized: true \}/,
    "next.config.ts must keep images.unoptimized. The platform's optimiser was " +
      "returning 502 after ~40s for /logo.png, which is in the header of every " +
      "page. Re-measure /_next/image?url=%2Flogo.png&w=256 against production " +
      "before removing this — the failure is silent from inside the app."
  );
});

test("the app still has no image that the optimiser would help", () => {
  // The justification for turning it off globally is that there is nothing to
  // optimise: the logo, and QR codes from data: URLs which the optimiser never
  // touches. If a real photograph is ever added, that reasoning expires and
  // this test is where it should be reconsidered.
  const srcs = new Set<string>();
  for (const file of tsxFilesUnder(path.join(root, "app")).concat(
    tsxFilesUnder(path.join(root, "components"))
  )) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes('from "next/image"')) continue;
    for (const m of text.matchAll(/src=(?:"([^"]+)"|\{([^}]+)\})/g)) {
      srcs.add((m[1] ?? m[2]).trim());
    }
  }

  const unexpected = [...srcs].filter(
    (s) => s !== "/logo.png" && !/qrDataUrl/i.test(s)
  );
  assert.deepEqual(
    unexpected,
    [],
    `a new <Image> source appeared: ${unexpected.join(", ")}.\n` +
      "Image optimisation is globally OFF (see next.config.ts). That was safe " +
      "when the only images were a 37.5KB logo and data: URL QR codes. If this " +
      "is a photograph it will now be served at full size to every visitor — " +
      "decide deliberately, then update this list."
  );
});
