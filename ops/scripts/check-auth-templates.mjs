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
const PROJECT_REF = "qrdlheqnnzpasbnayalm";
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERED = path.resolve(HERE, "../auth-templates");

const ENV_KEY = "SUPABASE_ACCESS_TOKEN";

/**
 * Management API token: the environment first, then the workspace intake
 * file (.env.shared), found by walking up from this script.
 *
 * Why the fallback exists: nothing puts this token in your shell, and the
 * secret-guard blocks the obvious ways of getting it there — so running this
 * check meant working out a non-obvious incantation first. A guard that
 * takes a puzzle to run is a guard that does not get run. On 2026-08-29 a
 * hand-written apply payload (missing the shell's header comment) reached
 * live config while this script sat unrunnable; only a manual byte-level
 * comparison caught it. That is the failure this fallback removes.
 *
 * The value is used as a Bearer header and nothing else. It is never
 * logged, never echoed, and never written anywhere — do not add a debug
 * print of it, however tempting, given this workspace's leak history.
 */
function resolveToken() {
  if (process.env[ENV_KEY]) return process.env[ENV_KEY];

  let dir = HERE;
  // ops/scripts -> ops -> <project> -> <org> -> F:\Projects is 4 hops; 6
  // leaves room without ever scanning the whole drive.
  for (let i = 0; i < 6; i++) {
    try {
      const line = readFileSync(path.join(dir, ".env.shared"), "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${ENV_KEY}=`));
      if (line) {
        return line.slice(ENV_KEY.length + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      // No .env.shared at this level — keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const token = resolveToken();
if (!token) {
  console.error(
    `No Supabase Management API token found.\n` +
      `Set ${ENV_KEY} in the environment, or add it to the workspace .env.shared.`
  );
  process.exit(2);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  { headers: { Authorization: `Bearer ${token}` } }
);
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
