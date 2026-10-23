// Proves the account-deletion migration (ops/sql/members-account-deletion.sql) against the REAL
// schema of record, the same way verify-credit-sql.mjs does. Spec:
// planning/spec/account-deletion.md.
//
// What this pins: erasure never loses a booking, credit or refund row (the 7-year records);
// a participant with history is anonymised and one without is deleted, and BOTH get their
// waivers archived exactly as "remove from household" does; the login can be deleted while the
// anonymous account row survives; erasure is idempotent; household removal still archives
// through the refactored trigger; one open request per account; the API roles cannot erase.
import { test as nodeTest, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadSchema, LEDGER_AVAILABLE } from "./pglite-schema.mjs";

if (!LEDGER_AVAILABLE && !process.env.CI) {
  throw new Error("schema ledger not found at Empowr CIC/supabase/migrations/ — this suite must run locally");
}
const SKIP = LEDGER_AVAILABLE
  ? false
  : "schema ledger is in the private workspace repo; enforced locally by the pre-push hook";
const test = (name, fn) => nodeTest(name, { skip: SKIP }, fn);

let db, occurrence, formVersion;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => Object.values(await one(sql, args))[0];
const count = (sql, args = []) => scalar(`select count(*)::int from (${sql}) x`, args);

async function member() {
  const user = await scalar("insert into auth.users(id, email) values (gen_random_uuid(), 'tech@pecuvate.com') returning id");
  const account = await scalar("select id from mem_accounts where user_id=$1", [user]);
  return { user, account };
}
const skater = (account, name, dob = "2014-06-15") =>
  scalar(
    `insert into mem_participants(account_id, name, dob, emergency_contact_name, emergency_contact_phone, medical_notes)
     values ($1, $2, $3, 'Alex Parent', '07700900000', 'asthma') returning id`,
    [account, name, dob]
  );
const book = (account, participant) =>
  scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence)
     values ($1, $2, $3, 'confirmed', 1000) returning id`,
    [account, participant, occurrence]
  );
async function waiverFor(participant, skaterName) {
  const person = await scalar(
    "insert into people(first_name, last_name, email) values ('Alex', 'Parent', 'tech@pecuvate.com') returning id"
  );
  const response = await scalar(
    `insert into waiver_responses(person_id, form_version_id, session_date, skating_mode, has_minors,
       emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, session_policy_type,
       agreed_tc, agreed_waiver, agreed_photo, skater_names)
     values ($1, $2, current_date, 'others', true, 'Alex Parent', '07700900000', 'Parent', 'none', true, true, true, $3)
     returning id`,
    [person, formVersion, [skaterName]]
  );
  await db.query("insert into mem_waiver_consents(participant_id, person_id, waiver_response_id) values ($1, $2, $3)", [
    participant,
    person,
    response,
  ]);
  return response;
}
const erase = (account) => one("select mem_erase_account($1) as r", [account]).then((x) => x.r);

before(async () => {
  if (SKIP) return;
  // Applied live 2026-10-23 (members_account_deletion) and now IN the ledger, so the replay alone
  // is the real schema. Before applying, each assertion was made to fail against a deliberately
  // broken copy of ops/sql/members-account-deletion.sql (no archive, account name kept, refunds
  // deleted, erase granted to authenticated, user_id back to CASCADE).
  db = await loadSchema();
  const venue = await scalar("insert into mem_venues(name, default_capacity) values ('Hall', 50) returning id");
  const offering = await scalar(
    `insert into mem_offerings(slug, title, type, price_pence, venue_id)
     values ('skate-jam', 'Skate Jam', 'drop_in', 1000, $1) returning id`,
    [venue]
  );
  occurrence = await scalar(
    `insert into mem_occurrences(offering_id, starts_at, ends_at)
     values ($1, now() - interval '30 days', now() - interval '30 days' + interval '1 hour') returning id`,
    [offering]
  );
  formVersion = await scalar("insert into form_versions(version) values ('test') returning id");
});
after(() => db?.close());

test("erasure keeps every booking, credit and refund row (the 7-year records)", async () => {
  const { account } = await member();
  const kid = await skater(account, "Sam Smith");
  const b = await book(account, kid);
  await db.query("insert into mem_credits(account_id, amount_pence, expires_at) values ($1, 500, now() + interval '1 year')", [account]);
  await db.query("insert into mem_booking_refunds(booking_id, account_id, card_pence, credit_pence) values ($1, $2, 1000, 0)", [b, account]);
  const before = {
    bookings: await count("select 1 from mem_bookings where account_id=$1", [account]),
    credits: await count("select 1 from mem_credits where account_id=$1", [account]),
    refunds: await count("select 1 from mem_booking_refunds where account_id=$1", [account]),
    paid: await scalar("select sum(price_paid_pence)::int from mem_bookings where account_id=$1", [account]),
  };
  await erase(account);
  assert.deepEqual(
    {
      bookings: await count("select 1 from mem_bookings where account_id=$1", [account]),
      credits: await count("select 1 from mem_credits where account_id=$1", [account]),
      refunds: await count("select 1 from mem_booking_refunds where account_id=$1", [account]),
      paid: await scalar("select sum(price_paid_pence)::int from mem_bookings where account_id=$1", [account]),
    },
    before
  );
});

test("a participant with history is anonymised in place and their waiver archived", async () => {
  const { account } = await member();
  const kid = await skater(account, "Sam Smith");
  await book(account, kid);
  const response = await waiverFor(kid, "Sam Smith");
  const r = await erase(account);
  assert.equal(r.participants_anonymised, 1);
  const p = await one("select * from mem_participants where id=$1", [kid]);
  assert.equal(p.name, "Deleted skater");
  assert.equal(new Date(p.dob).toISOString().slice(0, 10), "2014-01-01");
  for (const f of ["emergency_contact_name", "emergency_contact_phone", "medical_notes", "person_id"]) assert.equal(p[f], null, f);
  const archived = await one("select * from mem_waiver_archive where source_participant_id=$1", [kid]);
  assert.equal(archived.skater_name, "Sam Smith");
  // A child: kept until 21 (born 2014-06-15, archived with the real dob, before coarsening).
  assert.equal(new Date(archived.purge_after).getUTCFullYear(), 2035);
  assert.equal(await count("select 1 from mem_waiver_consents where participant_id=$1", [kid]), 0);
  assert.equal(await count("select 1 from waiver_responses where id=$1", [response]), 0);
});

test("a participant with no history is deleted through the existing household-removal trigger", async () => {
  const { account } = await member();
  const kid = await skater(account, "Jo Smith");
  await waiverFor(kid, "Jo Smith");
  const r = await erase(account);
  assert.equal(r.participants_deleted, 1);
  assert.equal(await count("select 1 from mem_participants where id=$1", [kid]), 0);
  assert.equal(await count("select 1 from mem_waiver_archive where source_participant_id=$1", [kid]), 1);
});

test("a participant held by a membership (RESTRICT) is anonymised, not left untouched", async () => {
  const { account } = await member();
  const kid = await skater(account, "Max Smith");
  const plan = await scalar("insert into mem_membership_plans(name, price_pence) values ('Weekly', 3000) returning id");
  await db.query("insert into mem_memberships(account_id, participant_id, plan_id, status) values ($1, $2, $3, 'cancelled')", [account, kid, plan]);
  const r = await erase(account);
  assert.equal(r.participants_anonymised, 1);
  assert.equal(await scalar("select name from mem_participants where id=$1", [kid]), "Deleted skater");
});

test("the account row is anonymised and survives deletion of the login", async () => {
  const { user, account } = await member();
  await db.query("update mem_accounts set name='Alex Parent', phone='07700900000', whatsapp_opt_in=true, stripe_customer_id='cus_x', deletion_hold=true, deletion_hold_note='note' where id=$1", [account]);
  await book(account, await skater(account, "Sam Smith"));
  await erase(account);
  await db.query("delete from auth.users where id=$1", [user]);
  const a = await one("select * from mem_accounts where id=$1", [account]);
  assert.equal(a.user_id, null);
  assert.equal(a.name, "Deleted member");
  for (const f of ["phone", "stripe_customer_id", "deletion_hold_note"]) assert.equal(a[f], null, f);
  assert.equal(a.whatsapp_opt_in, false);
  assert.equal(a.deletion_hold, false);
});

test("erasure is idempotent", async () => {
  const { account } = await member();
  await book(account, await skater(account, "Sam Smith"));
  await erase(account);
  const snapshot = await one("select row_to_json(p)::text as j from mem_participants p where account_id=$1", [account]);
  const again = await erase(account);
  assert.equal(again.participants_anonymised, 1);
  assert.equal((await one("select row_to_json(p)::text as j from mem_participants p where account_id=$1", [account])).j.replace(/"updated_at":"[^"]*"/, ""), snapshot.j.replace(/"updated_at":"[^"]*"/, ""));
  assert.equal(await count("select 1 from mem_waiver_archive where source_account_id=$1", [account]), 0);
});

test("household removal still archives through the refactored trigger", async () => {
  const { account } = await member();
  const kid = await skater(account, "Ali Smith");
  await waiverFor(kid, "Ali Smith");
  await db.query("delete from mem_participants where id=$1", [kid]);
  assert.equal(await count("select 1 from mem_waiver_archive where source_participant_id=$1", [kid]), 1);
});

test("an account can have only one open deletion request", async () => {
  const { account } = await member();
  await db.query("insert into mem_account_deletions(account_id, status) values ($1, 'scheduled')", [account]);
  await assert.rejects(db.query("insert into mem_account_deletions(account_id, status) values ($1, 'pending_confirmation')", [account]));
  await db.query("update mem_account_deletions set status='cancelled' where account_id=$1", [account]);
  await db.query("insert into mem_account_deletions(account_id, status) values ($1, 'pending_confirmation')", [account]);
});

test("the API roles cannot run erasure or read deletion tables", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await scalar("select has_function_privilege($1, 'public.mem_erase_account(uuid)', 'execute')", [role]), false, role);
    assert.equal(await scalar("select has_table_privilege($1, 'public.mem_account_deletions', 'select')", [role]), false, role);
    assert.equal(await scalar("select has_table_privilege($1, 'public.mem_account_deletion_reasons', 'select')", [role]), false, role);
  }
});

test("children's collection consents are kept 18 years by the nightly job", async () => {
  const jobs = await db.query("select command from cron.job where jobname='delete-old-waivers'");
  assert.equal(jobs.rows.length, 1);
  const cmd = jobs.rows[0].command;
  assert.match(cmd, /departure_consents\s+WHERE COALESCE\(session_date, submitted_at::date\) < CURRENT_DATE - INTERVAL '18 years'/);
  assert.doesNotMatch(cmd, /departure_consents\s+WHERE session_date < CURRENT_DATE - INTERVAL '3 years'/);
});
