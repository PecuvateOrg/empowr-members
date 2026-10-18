// Browser client — anon key, RLS-scoped. Client components only.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Passkey methods (registerPasskey, signInWithPasskey, auth.passkey.*)
    // are behind this flag in auth-js and throw without it. The API is
    // experimental, which is why supabase-js is pinned to an exact version.
    { auth: { experimental: { passkey: true } } }
  );
}
