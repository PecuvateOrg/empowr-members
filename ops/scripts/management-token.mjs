/**
 * management-token.mjs
 *
 * Supabase Management API token resolution, shared by check-auth-templates.mjs
 * and apply-auth-templates.mjs.
 *
 * This lives in one file on purpose. The two scripts are a matched pair — the
 * applier writes what the checker verifies — and this project has already
 * shipped the same bug three times over by letting near-identical code exist
 * in two places (Public/Member/AdminHeader). A second copy of the resolution
 * logic would work fine right up until one of them learned about a new
 * location and the other did not.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_KEY = "SUPABASE_ACCESS_TOKEN";
const CLI_TOKEN_PATH = join(homedir(), ".supabase", "access-token");

/**
 * The environment first, then the Supabase CLI's own saved login.
 *
 * 2026-09-24: these scripts are operator tooling, and the estate's rule for
 * operator tasks is the saved CLI login, not a stored key. The vault entry this
 * used to name (SUPABASE_ACCESS_TOKEN) was deleted 2026-09-22 when the shared
 * management PAT was retired, which left both scripts unable to run.
 *
 * The CLI manages that file itself (mode 600, written by `supabase login`); it
 * is never opened in an editor, which is what made the old `.env.shared` read
 * dangerous. Run `supabase login` if it is missing or expired.
 *
 * The value is used as a Bearer header and nothing else. It is never logged,
 * never echoed, and never written anywhere — do not add a debug print of it,
 * however tempting, given this workspace's leak history.
 */
export function resolveToken() {
  if (process.env[ENV_KEY]) return process.env[ENV_KEY];
  try {
    return readFileSync(CLI_TOKEN_PATH, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function requireToken() {
  const token = resolveToken();
  if (!token) {
    console.error(
      `No Supabase Management API token found.\n` +
        `Log in with the Supabase CLI first (it saves the session for these scripts):\n` +
        `  npx supabase login`
    );
    process.exit(2);
  }
  return token;
}

export const PROJECT_REF = "qrdlheqnnzpasbnayalm";
export const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
