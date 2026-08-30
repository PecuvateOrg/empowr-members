/**
 * management-token.mjs
 *
 * Supabase Management API token resolution, shared by check-auth-templates.mjs
 * and apply-auth-templates.mjs.
 *
 * This lives in one file on purpose. The two scripts are a matched pair — the
 * applier writes what the checker verifies — and this project has already
 * shipped the same bug three times over by letting near-identical code exist
 * in two places (Public/Member/AdminHeader). A second copy of the walk-up
 * logic would work fine right up until one of them learned about a new
 * location and the other did not.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ENV_KEY = "SUPABASE_ACCESS_TOKEN";

/**
 * The environment first, then the workspace intake file (.env.shared), found
 * by walking up from `fromDir`.
 *
 * Why the fallback exists: nothing puts this token in your shell, and the
 * secret-guard blocks the obvious ways of getting it there — so running these
 * scripts meant working out a non-obvious incantation first. A guard that
 * takes a puzzle to run is a guard that does not get run. On 2026-08-29 a
 * hand-written apply payload (missing the shell's header comment) reached live
 * config while the checker sat unrunnable; only a manual byte-level comparison
 * caught it.
 *
 * The value is used as a Bearer header and nothing else. It is never logged,
 * never echoed, and never written anywhere — do not add a debug print of it,
 * however tempting, given this workspace's leak history.
 */
export function resolveToken(fromDir) {
  if (process.env[ENV_KEY]) return process.env[ENV_KEY];

  let dir = fromDir;
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

/** Resolve or exit(2) with the same message both scripts used to print. */
export function requireToken(fromDir) {
  const token = resolveToken(fromDir);
  if (!token) {
    console.error(
      `No Supabase Management API token found.\n` +
        `Set ${ENV_KEY} in the environment, or add it to the workspace .env.shared.`
    );
    process.exit(2);
  }
  return token;
}

export const PROJECT_REF = "qrdlheqnnzpasbnayalm";
export const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
