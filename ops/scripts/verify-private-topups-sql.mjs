// Proves the add-places / gear-only migration (ops/sql/members-private-add-places.sql)
// against the REAL schema of record, the same way verify-credit-sql.mjs does.
// Plan: planning/architecture/private-bookings-add-places.md.
//
// What this pins: the price of every addition, the 80 cap counting additions
// still being paid for, the 48-hour online cutoff, the door window, who may
// add whom, equipment validation BEFORE money is taken, a replayed webhook,
// and that gear-only is priced like hire on the original booking too.
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

let db;
let day = 0;

const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => Object.values(await one(sql, args))[0];

async function member() {
  const user = await scalar(
    "insert into auth.users(id, email) values (gen_random_uuid(), 'tech@pecuvate.com') returning id"
  );
  return scalar("select id from mem_accounts where user_id=$1", [user]);
}
const skater = (account, name = "Sam") =>
  scalar("insert into mem_participants(account_id, name, dob) values ($1, $2, '2012-01-01') returning id", [
    account,
    name,
  ]);

/** A confirmed online booking starting `inHours` from now, on its own day so
 *  the no-overlap rule never couples tests. */
async function booking(kind, host, { paid = 10, inHours = 24 * 20, hours = 2, status = "confirmed" } = {}) {
  day += 1;
  return scalar(
    `insert into mem_private_bookings(kind, status, source, venue_id, starts_at, ends_at, host_account_id,
       paid_places, total_places, price_pence)
     select $1::mem_private_kind, $2::mem_private_status, 'online', venue_id,
            now() + make_interval(hours => $3) + make_interval(days => $4 * 400),
            now() + make_interval(hours => $3 + $5) + make_interval(days => $4 * 400),
            $6, $7, $7 + case when $1 = 'birthday' then 1 else 0 end, 100
       from mem_private_booking_types where kind = $1::mem_private_kind
     returning id`,
    [kind, status, inHours, day, hours, host, paid]
  );
}
// Every booking above is pushed `day*400` days out so they never overlap; the
// cutoff tests need a start that is genuinely near, so they shift it back.
const startIn = (id, hours) =>
  db.query(
    "update mem_private_bookings set starts_at = now() + make_interval(hours => $2), ends_at = now() + make_interval(hours => $2 + 2) where id = $1",
    [id, hours]
  );

const holdTopup = (bookingId, account, added, places = [], source = "online", staff = null) =>
  one("select * from mem_hold_private_topup($1, $2, $3, $4::jsonb, $5, $6)", [
    bookingId,
    account,
    added,
    JSON.stringify(places),
    source,
    staff,
  ]);
async function pay(topup) {
  await db.query("update mem_private_booking_topups set stripe_checkout_session_id=$2 where id=$1", [
    topup.id,
    `cs_${topup.id}`,
  ]);
  return db.query("select * from mem_confirm_private_topup($1, 'pi_x')", [`cs_${topup.id}`]);
}
const places = (id) => one("select paid_places, total_places from mem_private_bookings where id=$1", [id]);
const STAFF = "00000000-0000-0000-0000-000000000001";

before(async () => {
  if (SKIP) return;
  db = await loadSchema({ inputs: ["../sql/members-private-add-places.sql"] });
  await db.query("update mem_private_booking_types set max_places = 80 where kind in ('birthday','coaching_group')");
});
after(() => db?.close());

test("birthday: +3 costs £60, opens 3 more invite places, and a replayed webhook adds nothing", async () => {
  const host = await member();
  const b = await booking("birthday", host, { paid: 10 });
  const t = await holdTopup(b, host, 3);
  assert.equal(t.amount_pence, 6000);
  assert.equal((await pay(t)).rows.length, 1);
  assert.deepEqual(await places(b), { paid_places: 13, total_places: 14 });
  assert.equal((await db.query("select * from mem_confirm_private_topup($1, 'pi_x')", [`cs_${t.id}`])).rows.length, 0);
  assert.deepEqual(await places(b), { paid_places: 13, total_places: 14 });
});

test("the 80 cap counts additions still being paid for, and frees them once expired", async () => {
  const host = await member();
  const b = await booking("birthday", host, { paid: 75 });
  const first = await holdTopup(b, host, 4);
  await assert.rejects(holdTopup(b, host, 2), /mem_private_above_maximum/);
  await holdTopup(b, host, 1); // exactly 80
  await db.query("update mem_private_booking_topups set expires_at = now() - interval '1 minute' where id=$1", [first.id]);
  await holdTopup(b, host, 4); // the expired one no longer reserves
});

test("online closes 48 hours before the start; the door stays open until the end", async () => {
  const host = await member();
  const b = await booking("birthday", host);
  await startIn(b, 47);
  await assert.rejects(holdTopup(b, host, 1), /mem_private_topup_closed/);
  await holdTopup(b, host, 1, [], "door", STAFF);
  await startIn(b, -3); // ended an hour ago
  await assert.rejects(holdTopup(b, host, 1, [], "door", STAFF), /mem_private_topup_closed/);
});

test("control: online is accepted just outside 48 hours", async () => {
  const host = await member();
  const b = await booking("birthday", host);
  await startIn(b, 49);
  await holdTopup(b, host, 1);
});

test("only the host adds online; a door addition needs a staff member", async () => {
  const host = await member();
  const b = await booking("birthday", host);
  await assert.rejects(holdTopup(b, await member(), 1), /mem_private_not_host/);
  await assert.rejects(holdTopup(b, host, 1, [], "door", null), /mem_private_topup_needs_staff/);
});

test("nothing can be added to a cancelled booking, or to 1-to-1 coaching", async () => {
  const host = await member();
  await assert.rejects(holdTopup(await booking("birthday", host, { status: "cancelled" }), host, 1), /mem_private_not_joinable/);
  await assert.rejects(holdTopup(await booking("coaching_one", host, { paid: 1 }), host, 1), /mem_private_not_found/);
});

test("group: 2 skaters for 2 hours, one hiring and one gear-only, costs £90 and adds both places", async () => {
  const host = await member();
  const b = await booking("coaching_group", host, { paid: 3, hours: 2 });
  const a = await skater(host, "A");
  const c = await skater(host, "C");
  const t = await holdTopup(b, host, 2, [
    { participant_id: a, equipment: "hire", hire_size: "UK4-UK7" },
    { participant_id: c, equipment: "gear" },
  ]);
  assert.equal(t.amount_pence, 2000 * 2 * 2 + 500 * 2);
  await pay(t);
  assert.deepEqual(await places(b), { paid_places: 5, total_places: 5 });
  const rows = (
    await db.query("select equipment::text, hire_size from mem_private_booking_places where private_booking_id=$1 order by equipment", [b])
  ).rows;
  assert.deepEqual(rows, [
    { equipment: "hire", hire_size: "UK4-UK7" },
    { equipment: "gear", hire_size: null },
  ].sort((x, y) => x.equipment.localeCompare(y.equipment)));
});

test("group: a skater already on the booking, or in another addition being paid for, is refused", async () => {
  const host = await member();
  const b = await booking("coaching_group", host, { paid: 3 });
  const a = await skater(host);
  await holdTopup(b, host, 1, [{ participant_id: a, equipment: "own" }]);
  await assert.rejects(holdTopup(b, host, 1, [{ participant_id: a, equipment: "own" }]), /mem_private_already_joined/);
});

test("group: online adds only the host's own household; the door can add any member's skater", async () => {
  const host = await member();
  const other = await member();
  const b = await booking("coaching_group", host, { paid: 3 });
  const theirs = await skater(other);
  await assert.rejects(
    holdTopup(b, host, 1, [{ participant_id: theirs, equipment: "own" }]),
    /mem_private_participant_mismatch/
  );
  const t = await holdTopup(b, other, 1, [{ participant_id: theirs, equipment: "own" }], "door", STAFF);
  await pay(t);
  assert.equal(
    await scalar("select account_id from mem_private_booking_places where participant_id=$1", [theirs]),
    other
  );
});

test("equipment is validated before payment: hire needs a size, gear and own take none", async () => {
  const host = await member();
  const b = await booking("coaching_group", host, { paid: 3 });
  const a = await skater(host);
  for (const bad of [
    { equipment: "hire" },
    { equipment: "gear", hire_size: "UK4-UK7" },
    { equipment: "own", hire_size: "UK4-UK7" },
    { equipment: "hire", hire_size: "UK12" },
    { equipment: "skates-only" },
  ]) {
    await assert.rejects(holdTopup(b, host, 1, [{ participant_id: a, ...bad }]), /mem_private_bad_places/, JSON.stringify(bad));
  }
});

test("a birthday addition carries no named skaters; a group addition must name exactly as many as it adds", async () => {
  const host = await member();
  const a = await skater(host);
  await assert.rejects(
    holdTopup(await booking("birthday", host), host, 1, [{ participant_id: a, equipment: "own" }]),
    /mem_private_bad_places/
  );
  await assert.rejects(holdTopup(await booking("coaching_group", host, { paid: 3 }), host, 2, [{ participant_id: a, equipment: "own" }]), /mem_private_bad_places/);
});

test("gear-only is priced like hire on the original booking too", async () => {
  const host = await member();
  const [a, c, d] = [await skater(host, "A"), await skater(host, "C"), await skater(host, "D")];
  await db.query("update mem_private_booking_types set active = true where kind = 'coaching_group'");
  try {
    const saturday = await scalar(
      `select ((date_trunc('week', ((now() at time zone 'Europe/London')::date + 21)::timestamp) + interval '5 days 15 hours')
                at time zone 'Europe/London')`
    );
    const row = await one(
      "select * from mem_hold_private_booking($1, 'coaching_group', $2, 1, 3, $3::jsonb)",
      [
        host,
        saturday,
        JSON.stringify([
          { participant_id: a, equipment: "gear" },
          { participant_id: c, equipment: "hire", hire_size: "UK1-UK3" },
          { participant_id: d, equipment: "own" },
        ]),
      ]
    );
    assert.equal(row.hire_pence, 1000);
    assert.equal(row.price_pence, 2000 * 3 * 1 + 1000);
  } finally {
    await db.query("update mem_private_booking_types set active = false where kind = 'coaching_group'");
  }
});

test("members can read only their own additions and cannot call the add functions", async () => {
  const host = await member();
  const b = await booking("birthday", host);
  await holdTopup(b, host, 1);
  const stranger = await scalar("select user_id from mem_accounts where id=$1", [await member()]);
  const owner = await scalar("select user_id from mem_accounts where id=$1", [host]);
  try {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${stranger}',false)`);
    assert.equal(await scalar("select count(*)::int from mem_private_booking_topups"), 0);
    await assert.rejects(holdTopup(b, host, 1));
    await assert.rejects(db.query("select * from mem_confirm_private_topup('x','y')"));
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
    assert.equal(await scalar("select count(*)::int from mem_private_booking_topups"), 1);
  } finally {
    await db.exec("reset role");
  }
});
