// Public catalogue client — anon key, no cookies, no session.
//
// Deliberately separate from lib/supabase/server.ts: that one reads
// cookies(), which is a Next.js dynamic API, so any page touching it can
// never be statically rendered or cached. The catalogue tables all carry
// identical anon and authenticated RLS policies (active offerings,
// scheduled occurrences, runs of active offerings, venues — see
// _config/registry/supabase.md), so reading them without a session
// returns exactly the same rows the cookie client would. Dropping the
// cookie dependency is therefore free, and it is what lets
// lib/catalogue.ts wrap these reads in unstable_cache().
//
// Never use this for anything user-scoped — it has no session, so RLS
// sees it as anon and own-row policies will return nothing.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
