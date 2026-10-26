// Proves the member-messaging migration (ops/sql/members-member-messaging.sql) against the REAL schema of
// record, the same way verify-account-deletion-sql.mjs does. Spec: planning/spec/member-messaging.md.
//
// What this pins: recipient resolution (who is, and is not, told); row-level security (a member sees only
// their own messages and can set only their own read_at, as the authenticated role, not as superuser); the
// API roles cannot read push credentials or run the resolver; account erasure removes push subscriptions and
// recipient rows and nothing else.
import { test as nodeTest, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadSchema, LEDGER_AVAILABLE } from "./pglite-schema.mjs";

if (!LEDGER_AVAILABLE && !process.env.CI) {
  throw new Error("schema ledger not found (set EMPOWR_LEDGER_DIR or run from the main checkout) - this suite must run locally");
}
const SKIP = LEDGER_AVAILABLE
  ? false
  : "schema ledger is in the private workspace repo; enforced locally by the pre-push hook";
const test = (name, fn) => nodeTest(name, { skip: SKIP }, fn);

// The migration is in the ledger (20261026104755_members_member_messaging), so the replay alone is the real schema.
const INPUTS = [];

let db, venue, offering, occ, occOther, occPast, occCancelled, run, runOcc;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => Object.values(await one(sql, args))[0];
const count = (sql, args = []) => scalar(`select count(*)::int from (${sql}) x`, args);

async function member(name = "Parent") {
  const user = await scalar("insert into auth.users(id, email) values (gen_random_uuid(), 'tech@pecuvate.com') returning id");
  const account = await scalar("select id from mem_accounts where user_id=$1", [user]);
  await db.query("update mem_accounts set name=$2 where id=$1", [account, name]);
  return { user, account };
}
const skater = (account, name) =>
  scalar("insert into mem_participants(account_id, name, dob) values ($1, $2, '2014-06-15') returning id", [account, name]);
const book = (account, participant, { occurrence = occ, status = "confirmed", runId = null } = {}) =>
  scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, course_run_id, status, price_paid_pence)
     values ($1, $2, $3, $4, $5, 1000) returning id`,
    [account, participant, runId ? null : occurrence, runId, status]
  );
const audience = (type, id) => db.query("select * from mem_message_audience($1, $2) order by account_name", [type, id]).then((r) => r.rows);
const newMessage = (senderUser = "00000000-0000-0000-0000-000000000001") =>
  scalar(
    `insert into mem_messages(sender_user_id, sender_role, sender_name, audience_type, audience_id, subject, body)
     values ($1, 'admin', 'Empowr CIC', 'occurrence', $2, 'Hi', 'Body') returning id`,
    [senderUser, occ]
  );
const asMember = (user) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
const asSuper = () => db.exec("reset role");

before(async () => {
  if (SKIP) return;
  db = await loadSchema({ inputs: INPUTS });
  venue = await scalar("insert into mem_venues(name, default_capacity) values ('Hall', 50) returning id");
  offering = await scalar(
    `insert into mem_offerings(slug, title, type, price_pence, venue_id)
     values ('skate-jam', 'Skate Jam', 'drop_in', 1000, $1) returning id`,
    [venue]
  );
  const mk = (offset, status = "scheduled", offeringId = offering, runId = null) =>
    scalar(
      `insert into mem_occurrences(offering_id, starts_at, ends_at, status, course_run_id)
       values ($1, now() + $2::interval, now() + $2::interval + interval '1 hour', $3, $4) returning id`,
      [offeringId, offset, status, runId]
    );
  occ = await mk("2 days");
  occOther = await mk("3 days");
  occPast = await mk("-3 days");
  occCancelled = await mk("4 days", "cancelled_by_empowr");
  run = await scalar(
    `insert into mem_course_runs(offering_id, label, starts_on, ends_on, price_pence, capacity)
     values ($1, 'Camp', current_date + 5, current_date + 7, 5000, 20) returning id`,
    [offering]
  );
  runOcc = await mk("5 days", "scheduled", offering, run);
});
after(() => db?.close());

test("occurrence audience: confirmed and attended families, one row per account naming every child", async () => {
  const a = await member("Alice Adams");
  const [k1, k2] = [await skater(a.account, "Kid One"), await skater(a.account, "Kid Two")];
  await book(a.account, k1);
  await book(a.account, k2, { status: "attended" });
  const b = await member("Bob Brown");
  await book(b.account, await skater(b.account, "Kid Three"));
  const rows = (await audience("occurrence", occ)).filter((r) => [a.account, b.account].includes(r.account_id));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((r) => r.account_id === a.account).participant_names, ["Kid One", "Kid Two"]);
});

test("occurrence audience excludes cancelled, credited, refunded, no_show, pending_payment and other sessions", async () => {
  const c = await member("Carol");
  for (const status of ["cancelled", "credited", "refunded", "no_show", "pending_payment"]) {
    await book(c.account, await skater(c.account, `K-${status}`), { status });
  }
  await book(c.account, await skater(c.account, "Elsewhere"), { occurrence: occOther });
  const rows = (await audience("occurrence", occ)).filter((r) => r.account_id === c.account);
  assert.equal(rows.length, 0, "no booking on this session is live, so Carol is not told");
});

test("a course-run enrolment covers the run's occurrences", async () => {
  const d = await member("Dana");
  await book(d.account, await skater(d.account, "Camper"), { runId: run });
  const rows = (await audience("occurrence", runOcc)).filter((r) => r.account_id === d.account);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].participant_names, ["Camper"]);
});

test("offering audience: upcoming scheduled occurrences only", async () => {
  const e = await member("Eve");
  const k = await skater(e.account, "Past Kid");
  await book(e.account, k, { occurrence: occPast });
  assert.equal((await audience("offering", offering)).filter((r) => r.account_id === e.account).length, 0, "past session only");
  const f = await member("Fay");
  await book(f.account, await skater(f.account, "Future Kid"), { occurrence: occOther });
  const g = await member("Gus");
  await book(g.account, await skater(g.account, "Cancelled Session Kid"), { occurrence: occCancelled });
  const rows = await audience("offering", offering);
  assert.ok(rows.some((r) => r.account_id === f.account), "upcoming booking is told");
  assert.ok(!rows.some((r) => r.account_id === g.account), "booking on a cancelled session is not");
});

test("account audience is exactly that account; unknown audience type throws", async () => {
  const h = await member("Hal");
  const rows = await audience("account", h.account);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].account_id, h.account);
  await assert.rejects(() => audience("everyone", h.account), /unknown audience type/);
});

test("RLS: a member sees only their own messages and recipient rows", async () => {
  const m1 = await member("Mia");
  const m2 = await member("Max");
  const msg = await newMessage();
  const other = await newMessage();
  await db.query("insert into mem_message_recipients(message_id, account_id) values ($1,$2), ($3,$4)", [msg, m1.account, other, m2.account]);
  try {
    await asMember(m1.user);
    const msgs = (await db.query("select id from mem_messages")).rows.map((r) => r.id);
    assert.deepEqual(msgs, [msg]);
    assert.equal(await count("select 1 from mem_message_recipients"), 1);
    await asMember(m2.user);
    assert.deepEqual((await db.query("select id from mem_messages")).rows.map((r) => r.id), [other]);
  } finally {
    await asSuper();
  }
});

test("RLS: a member can set only their own read_at, and only that column", async () => {
  const m1 = await member("Nia");
  const m2 = await member("Ned");
  const msg = await newMessage();
  await db.query("insert into mem_message_recipients(message_id, account_id) values ($1,$2), ($1,$3)", [msg, m1.account, m2.account]);
  try {
    await asMember(m1.user);
    const own = await db.query("update mem_message_recipients set read_at = now() where message_id=$1 and account_id=$2", [msg, m1.account]);
    assert.equal(own.affectedRows, 1);
    const theirs = await db.query("update mem_message_recipients set read_at = now() where message_id=$1 and account_id=$2", [msg, m2.account]);
    assert.equal(theirs.affectedRows, 0, "another member's row is invisible to update");
    await assert.rejects(() => db.query("update mem_message_recipients set email_status='sent' where account_id=$1", [m1.account]), /permission denied/);
    await assert.rejects(() => db.query("select sender_user_id from mem_messages"), /permission denied/);
    await assert.rejects(() => db.query("select email_id from mem_message_recipients"), /permission denied/);
    await assert.rejects(() => db.query("insert into mem_messages(sender_user_id, sender_role, sender_name, audience_type, audience_id, subject, body) values (gen_random_uuid(),'admin','x','account',gen_random_uuid(),'s','b')"), /permission denied/);
  } finally {
    await asSuper();
  }
  assert.equal(await scalar("select (read_at is null) from mem_message_recipients where message_id=$1 and account_id=$2", [msg, m2.account]), true);
});

test("API roles cannot touch push subscriptions or run the resolver", async () => {
  const p = await member("Pat");
  await db.query("insert into mem_push_subscriptions(account_id, endpoint, p256dh, auth) values ($1, 'https://push.example/e1', 'k', 'a')", [p.account]);
  try {
    await asMember(p.user);
    await assert.rejects(() => db.query("select * from mem_push_subscriptions"), /permission denied/);
    await assert.rejects(() => db.query("delete from mem_push_subscriptions"), /permission denied/);
    await assert.rejects(() => db.query("select * from mem_message_audience('account', $1)", [p.account]), /permission denied/);
  } finally {
    await asSuper();
  }
});

test("erasing an account deletes its push subscriptions and recipient rows, and only that account's", async () => {
  const x = await member("Xan");
  const y = await member("Yul");
  const msg = await newMessage();
  for (const [acc, ep] of [[x.account, "https://push.example/x"], [y.account, "https://push.example/y"]]) {
    await db.query("insert into mem_message_recipients(message_id, account_id) values ($1,$2)", [msg, acc]);
    await db.query("insert into mem_push_subscriptions(account_id, endpoint, p256dh, auth) values ($1,$2,'k','a')", [acc, ep]);
  }
  await one("select mem_erase_account($1)", [x.account]);
  assert.equal(await count("select 1 from mem_push_subscriptions where account_id=$1", [x.account]), 0);
  assert.equal(await count("select 1 from mem_message_recipients where account_id=$1", [x.account]), 0);
  assert.equal(await count("select 1 from mem_push_subscriptions where account_id=$1", [y.account]), 1);
  assert.equal(await count("select 1 from mem_message_recipients where account_id=$1", [y.account]), 1);
  assert.equal(await count("select 1 from mem_messages where id=$1", [msg]), 1, "the message itself is kept");
  assert.equal(await scalar("select name from mem_accounts where id=$1", [x.account]), "Deleted member");
});

test("one recipient row per account per message; request_id is unique", async () => {
  const z = await member("Zed");
  const msg = await newMessage();
  await db.query("insert into mem_message_recipients(message_id, account_id) values ($1,$2)", [msg, z.account]);
  await assert.rejects(() => db.query("insert into mem_message_recipients(message_id, account_id) values ($1,$2)", [msg, z.account]), /duplicate key/);
  const rid = "11111111-1111-1111-1111-111111111111";
  const ins = () => db.query(
    `insert into mem_messages(request_id, sender_user_id, sender_role, sender_name, audience_type, audience_id, subject, body)
     values ($1, gen_random_uuid(), 'admin', 'x', 'account', gen_random_uuid(), 's', 'b')`, [rid]);
  await ins();
  await assert.rejects(ins, /duplicate key/);
});
