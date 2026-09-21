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
const ENV_KEY = "SUPABASE_ACCESS_TOKEN";

/**
 * The environment, and nothing else.
 *
 * 2026-09-21: the previous implementation walked up the tree reading
 * `.env.shared` for this token. That was dead code on two counts — the token
 * was never in that file (it held only HEALTHCHECK_*), and the file itself was
 * deleted once both its keys were confirmed in the vault. Worse, it was a
 * read-a-credential-from-a-file path, which is the exact mechanism behind this
 * workspace's leak history: any file holding a live key gets copied into agent
 * and editor file-history the moment it is touched.
 *
 * The estate's retrieval path is the vault. Nothing on disk holds this token.
 *
 * The value is used as a Bearer header and nothing else. It is never logged,
 * never echoed, and never written anywhere — do not add a debug print of it,
 * however tempting, given this workspace's leak history.
 */
export function resolveToken() {
  return process.env[ENV_KEY] || null;
}

export function requireToken() {
  const token = resolveToken();
  if (!token) {
    console.error(
      `No Supabase Management API token found.\n` +
        `Source it from the vault first — it is not stored in any file:\n` +
        `  source ~/projects/_config/skills/sync-secrets/scripts/inject-secrets.sh ${ENV_KEY}`
    );
    process.exit(2);
  }
  return token;
}

export const PROJECT_REF = "qrdlheqnnzpasbnayalm";
export const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
