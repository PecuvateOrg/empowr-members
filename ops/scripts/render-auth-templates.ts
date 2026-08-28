/**
 * render-auth-templates.ts
 *
 * Run (from the project root):
 *   node --import ./ops/scripts/register-alias.mjs ops/scripts/render-auth-templates.ts
 *
 * Renders the six Supabase auth email templates from
 * src/lib/emails/auth-templates.ts into ops/auth-templates/:
 *   <key>.html   — one file per template, for eyeballing in a browser
 *   payload.json — the exact PATCH body for the Supabase auth config endpoint
 *
 * Why a script at all: Supabase stores these templates as HTML strings in
 * project config, so they cannot import the brand shell at send time. The
 * alternative was hand-writing a second copy of the shell, which is the
 * failure this project has already had three times over with its headers.
 * Re-run this after any change to shell.ts or auth-templates.ts, then apply
 * payload.json — the templates are NOT applied automatically.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allAuthTemplates } from "../../src/lib/emails/auth-templates.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../auth-templates");

// Every Go placeholder that must survive the shell verbatim. If one of these
// ever gets routed through esc(), it arrives at Supabase as &quot; / &lt;
// and the email ships a broken link — silently, because the template still
// renders and still looks fine.
const PLACEHOLDERS = /\{\{ \.[A-Za-z]+ \}\}/g;

mkdirSync(OUT, { recursive: true });

const templates = allAuthTemplates();
const patch: Record<string, string> = {};
let failures = 0;

for (const t of templates) {
  // Guard 1: the shell must not have escaped a placeholder.
  const found = t.html.match(PLACEHOLDERS) ?? [];
  if (found.length === 0) {
    console.error(`  FAIL ${t.key}: no Go placeholder survived rendering`);
    failures++;
  }
  // Guard 2: an escaped placeholder leaves these tell-tales behind.
  if (/&#123;|\{\{ \.[A-Za-z]+ &quot;/.test(t.html)) {
    console.error(`  FAIL ${t.key}: a placeholder was HTML-escaped`);
    failures++;
  }
  // Guard 3: catch a stray unreplaced token from a future refactor.
  if (t.html.includes("undefined")) {
    console.error(`  FAIL ${t.key}: rendered output contains "undefined"`);
    failures++;
  }

  writeFileSync(path.join(OUT, `${t.key}.html`), t.html, "utf8");
  patch[`mailer_subjects_${t.key}`] = t.subject;
  patch[`mailer_templates_${t.key}_content`] = t.html;

  console.log(
    `  ${t.key.padEnd(18)} ${String(t.html.length).padStart(5)} bytes  ` +
      `[${[...new Set(found)].join(", ")}]  "${t.subject}"`
  );
}

writeFileSync(
  path.join(OUT, "payload.json"),
  JSON.stringify(patch, null, 2),
  "utf8"
);

console.log(`\n${templates.length} templates -> ${OUT}`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED — do not apply payload.json`);
  process.exit(1);
}
console.log("All placeholder checks passed.");
