/**
 * check-auth-templates.mjs
 *
 * Run:
 *   npm run check:auth-emails
 *
 * Needs a Supabase Management API token. Taken from SUPABASE_ACCESS_TOKEN if
 * it is set, otherwise read straight out of the workspace secrets file — see
 * resolveToken() below for why that fallback exists.
 *
 * Compares the Supabase auth email templates LIVE on the project against the
 * output of render-auth-templates.ts in ops/auth-templates/. Exits non-zero
 * if any applied template has drifted.
 *
 * Why this exists: the auth templates are the one part of this app's email
 * surface that does not live in the codebase — Supabase stores them as
 * strings in project config. Nothing about a green build or a clean git tree
 * says the deployed template still matches the shell it was rendered from, so
 * a brand change to shell.ts silently desyncs them. This is the only check
 * that catches that.
 *
 * A template reported "not applied" is stock Supabase content, not drift.
 */
const KEYS = [
  "confirmation",
  "magic_link",
  "recovery",
  "email_change",
  "invite",
  "reauthentication",
];

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireToken, AUTH_CONFIG_URL } from "./management-token.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERED = path.resolve(HERE, "../auth-templates");

const token = requireToken(HERE);

const res = await fetch(AUTH_CONFIG_URL, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`auth config fetch failed: HTTP ${res.status}`);
  process.exit(2);
}
const cfg = await res.json();

let drift = 0;
let unapplied = 0;

for (const key of KEYS) {
  const live = cfg[`mailer_templates_${key}_content`] ?? "";
  const applied =
    cfg.mailer_templates_custom_contents?.[
      `MAILER_TEMPLATES_${key.toUpperCase()}_CONTENT`
    ] === true;

  let local;
  try {
    local = readFileSync(path.join(RENDERED, `${key}.html`), "utf8");
  } catch {
    console.log(`  ${key.padEnd(18)} SKIP    (not rendered locally)`);
    continue;
  }

  if (!applied) {
    console.log(`  ${key.padEnd(18)} STOCK   (branded version not applied)`);
    unapplied++;
  } else if (live === local) {
    console.log(`  ${key.padEnd(18)} OK      in sync with ops/auth-templates`);
  } else {
    console.log(
      `  ${key.padEnd(18)} DRIFT   live ${live.length}B vs local ${local.length}B`
    );
    drift++;
  }
}

console.log(
  `\n${KEYS.length - drift - unapplied} in sync, ${unapplied} stock, ${drift} drifted`
);
if (drift > 0) {
  console.error("Re-run `npm run render:auth-emails` and re-apply payload.json.");
  process.exit(1);
}
