// Server-side auth helpers. Session comes from the RLS server client;
// the account row is read through the same client (own-row RLS policy).
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export type AuthedAccount = { user: User; account: Account };

/** Resolve the signed-in user and their mem_accounts row, or null.
 *  API routes return 401 on null; pages rely on middleware but should
 *  still handle null defensively.
 *
 *  Wrapped in React cache(): this costs an auth round trip plus a query,
 *  and a route that resolves the account in both a layout and its page —
 *  or in a page and a helper it calls — would otherwise pay for both.
 *  Deduping is per-request, so it never leaks one visitor's account into
 *  another's render. */
export const getAuthedAccount = cache(
  async (): Promise<AuthedAccount | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: account } = await supabase
      .from("mem_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) return null;

    return { user, account: account as Account };
  }
);
