// Loads the REAL schema of record into an in-memory PGlite database for
// tests. Owner approved PGlite 2026-09-28 (dev-only; never bundled).
//
// 🔑 WHY THE LEDGER AND NOT A HAND-WRITTEN FIXTURE. #78's harness declared its
// own miniature tables (`status text`, no occurrences), and its own rollout
// note says that "does not prove compatibility with the current production
// schema". Replaying Empowr CIC/supabase/migrations/ (the shared DB's ledger,
// regenerated from live by dump-ledger.mjs) gives the real enum, columns,
// triggers and functions, then the deployment inputs go on top in the order
// they must be applied live.
//
// ⚠️ STUBS, AND WHAT THEY COST. PGlite has no pg_cron, no Storage and none of
// Supabase's own helpers. They are stubbed as no-ops below so the files that
// touch them still apply — a failed file rolls back WHOLE, so without the cron
// stub the entire booking-flow migration silently vanished. Anything the stubs
// stand in for (scheduled jobs, buckets) is NOT tested by this harness.
//
// ⚠️ NOT CONCURRENCY. One connection, one session: row locks are exercised
// for correctness, never raced.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// node_modules lives in src/, not above this file, so resolve from there.
const fromSrc = createRequire(new URL("../../src/package.json", import.meta.url));
const { PGlite } = await import(
  pathToFileURL(fromSrc.resolve("@electric-sql/pglite")).href
);

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const LEDGER = here("../../../supabase/migrations/");

/** The ledger lives in the PRIVATE workspace repo and covers the whole shared
 *  database, so it is never copied into this PUBLIC repo — and CI, which
 *  checks out only this repo, cannot see it. Owner decision 2026-09-28: skip
 *  in CI with a stated reason, and enforce locally with the pre-push hook
 *  (ops/scripts/pre-push-credit-sql.sh). */
export const LEDGER_AVAILABLE = existsSync(LEDGER);

const SUPABASE_STUBS = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb,
    created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as
    $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.role() returns text language sql stable as
    $$select current_setting('request.jwt.claim.role',true)$$;

  create schema cron;
  create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text);
  create function cron.schedule(text, text, text) returns bigint language sql as
    $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
  create function cron.schedule(text, text) returns bigint language sql as
    $$insert into cron.job(schedule,command) values($1,$2) returning jobid$$;
  create function cron.unschedule(text) returns boolean language sql as
    $$delete from cron.job where jobname=$1 returning true$$;
  create function cron.unschedule(bigint) returns boolean language sql as
    $$delete from cron.job where jobid=$1 returning true$$;

  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], owner uuid,
    created_at timestamptz default now(), updated_at timestamptz default now());
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text,
    name text, owner uuid, metadata jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as
    $$select string_to_array($1,'/')$$;

  create function public.rls_auto_enable() returns void language sql as $$select$$;
`;

// Infra-only migrations whose whole job is something stubbed above.
const SKIP = new Set(["20260516080424_enable_pg_cron.sql"]);

/** Some ledger files seed rows that point at a REAL venue (private bookings
 *  names The Ladywell Centre). Live, that venue was created through the admin
 *  UI, not a migration, so an empty database has nothing for the foreign key
 *  to find and the whole file rolls back. The venue id is read from the file
 *  itself rather than written here, because this repository is public and the
 *  id is deliberately kept out of it. The placeholder row carries no real
 *  venue data. */
async function seedReferencedVenues(db, sql) {
  // Only uuids inside an INSERT that names a venue_id column.
  const inserts = sql.match(/insert into[^;]*\bvenue_id\b[^;]*;/gi) ?? [];
  const ids = inserts.flatMap((s) =>
    [...s.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((m) => m[1])
  );
  if (ids.length === 0) return;
  const { rows } = await db.query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'mem_venues'"
  );
  if (rows.length === 0) return;
  for (const id of new Set(ids)) {
    await db.query(
      "insert into public.mem_venues (id, name) values ($1, 'test venue') on conflict (id) do nothing",
      [id]
    );
  }
}

/** Fresh in-memory database: stubs → ledger → deployment inputs, in order.
 *  Any file that fails to apply THROWS — a silently skipped migration is the
 *  exact false green this harness exists to avoid. */
export async function loadSchema({ inputs = [] } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(LEDGER).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (SKIP.has(f)) continue;
    const sql = readFileSync(LEDGER + f, "utf8");
    try {
      await seedReferencedVenues(db, sql);
      await db.exec(sql);
    } catch (e) {
      throw new Error(`ledger ${f} failed to apply: ${e.message}`);
    }
  }
  for (const f of inputs) {
    try {
      await db.exec(readFileSync(here(`./${f}`), "utf8"));
    } catch (e) {
      throw new Error(`deployment input ${f} failed to apply: ${e.message}`);
    }
  }
  return db;
}
