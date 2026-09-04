import { createClient } from "@supabase/supabase-js";
import { addMemberToBrevo } from "../../src/lib/brevo.ts";

const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey || !process.env.BREVO_API_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BREVO_API_KEY"
  );
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let checked = 0;
let eligible = 0;
let updated = 0;
let skipped = 0;

for (let from = 0; ; from += 500) {
  const { data: accounts, error } = await service
    .from("mem_accounts")
    .select("user_id")
    .order("created_at", { ascending: true })
    .range(from, from + 499);
  if (error) throw error;
  if (!accounts?.length) break;

  for (const account of accounts) {
    checked += 1;
    const { data, error: userError } = await service.auth.admin.getUserById(
      account.user_id as string
    );
    if (userError) throw userError;

    const user = data.user;
    if (!user?.email || !user.email_confirmed_at) {
      skipped += 1;
      continue;
    }

    eligible += 1;
    if (apply) {
      await addMemberToBrevo(user.email);
      updated += 1;
    }
  }

  if (accounts.length < 500) break;
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  checked,
  eligible,
  updated,
  skipped,
}));
