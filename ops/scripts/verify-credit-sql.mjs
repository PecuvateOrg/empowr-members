// Proves the credit-notes SQL against the REAL schema of record, not a
// hand-written fixture — see pglite-schema.mjs for how and what it stubs.
//
// 🔑 WHAT THE TS SUITES COULD NOT. verify:cancel-refund-split fakes the
// database: it pins that the route spends the card/credit split the database
// returns and never recomputes it. It says nothing about whether the SQL
// subtracts correctly, whether the trigger releases credit on `refunded` (and
// ONLY then), or whether the rescue guard in rescue-credit-guard.sql refuses
// what it should. Stage 3a/3b were "built, not proven" until this ran.
//
// The credit SQL is part of the ledger since 2026-09-28; this suite now
// proves what is LIVE, not what is about to be.
import { test as nodeTest, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { loadSchema, LEDGER_AVAILABLE } from "./pglite-schema.mjs";

// ⚠️ SKIP ONLY IN CI. Locally a missing ledger is a broken checkout and must
// FAIL — a suite that quietly skips where it is meant to run is a false green.
// In CI it is expected (private repo), and every test reports the reason.
if (!LEDGER_AVAILABLE && !process.env.CI) {
  throw new Error("schema ledger not found at Empowr CIC/supabase/migrations/ — this suite must run locally");
}
const SKIP = LEDGER_AVAILABLE
  ? false
  : "schema ledger is in the private workspace repo; enforced locally by the pre-push hook";
const test = (name, fn) => nodeTest(name, { skip: SKIP }, fn);

let db;
let account, occurrence;
let seq = 0;

const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => Object.values(await one(sql, args))[0];
const balance = () =>
  scalar(
    "select coalesce(sum(available_pence),0)::int from mem_credit_balances where account_id=$1",
    [account]
  );
const allocationStates = (booking) =>
  db
    .query("select state from mem_credit_allocations where booking_id=$1 order by state", [booking])
    .then((r) => r.rows.map((x) => x.state));

async function issueCredit(amount) {
  seq += 1;
  await db.query(
    `select mem_issue_credit($1, gen_random_uuid(), $1, null, $2, 'Wix', $3, 'Old session',
       '2026-08-01', 'Staff approved', now() + interval '12 months')`,
    [account, amount, `WIX-${seq}`]
  );
}

/** A live hold on a future session — the only state credit can reserve on. */
const newParticipant = () =>
  scalar("insert into mem_participants(account_id, name, dob) values ($1, 'Sam', '2015-01-01') returning id", [account]);

const hold = async (price) =>
  scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence, expires_at)
     values ($1, $2, $3, 'pending_payment', $4, now() + interval '30 minutes') returning id`,
    [account, await newParticipant(), occurrence, price]
  );

/** Reserve credit, then settle the checkout the way the app does. */
async function bookWithCredit(price, credit, { pi = null } = {}) {
  const id = await hold(price);
  const token = `tok-${id}`;
  await db.query("select * from mem_reserve_credit($1, $2, $3, $4)", [account, [id], credit, token]);
  await db.query("select mem_settle_credit_checkout($1, $2, $3, $4, $5, 'paid')", [
    token, account, `cs-${id}`, pi, price - credit,
  ]);
  return id;
}

const status = (id) => scalar("select status::text from mem_bookings where id=$1", [id]);
const beginRefund = (id) => one("select * from mem_begin_booking_refund($1, $2)", [id, account]);
const finishRefund = (id) => scalar("select mem_finish_booking_refund($1)", [id]);
const rescue = (session, pi = "pi_rescue") =>
  db.query("select * from mem_rescue_checkout($1, $2, $3, false)", [session, account, pi]);

before(async () => {
  if (SKIP) return;
  // Both deployment inputs were applied live 2026-09-28 and are now IN the
  // ledger (members_credit_notes, members_rescue_credit_guard), so the replay
  // alone is the real schema. Re-applying them would double-create.
  db = await loadSchema();
  const venue = await scalar("insert into mem_venues(name, default_capacity) values ('Hall', 50) returning id");
  const offering = await scalar(
    `insert into mem_offerings(slug, title, type, price_pence, venue_id)
     values ('movewell', 'MoveWell', 'drop_in', 5000, $1) returning id`,
    [venue]
  );
  occurrence = await scalar(
    `insert into mem_occurrences(offering_id, starts_at, ends_at)
     values ($1, now() + interval '7 days', now() + interval '7 days 1 hour') returning id`,
    [offering]
  );
});
// A fresh member per test. Credit reservation takes the WHOLE available
// balance, and the schema allows one live booking per participant per
// session, so shared state between tests would change the numbers under test.
async function freshMember() {
  const user = await scalar("insert into auth.users(id, email) values (gen_random_uuid(), 'tech@pecuvate.com') returning id");
  // The ledger's own auth.users trigger creates the account, as it does live.
  account = await scalar("select id from mem_accounts where user_id=$1", [user]);
}
beforeEach(async () => {
  if (!SKIP) await freshMember();
});
after(() => db?.close());

test("a split booking refunds card = price - credit, and credit only returns on `refunded`", async () => {
  await issueCredit(2000);
  const id = await bookWithCredit(5000, 2000, { pi: "pi_split" });
  assert.equal(await status(id), "confirmed");
  assert.deepEqual(await allocationStates(id), ["spent"]);
  assert.equal(await balance(), 0);

  const claim = await beginRefund(id);
  assert.equal(claim.card_pence, 3000, "the card gets back only what the card paid");
  assert.equal(claim.credit_pence, 2000);
  assert.equal(claim.payment_intent, "pi_split");
  // 🔑 `cancelled` now means "refund in flight". The credit must NOT be back
  // yet, or a Stripe failure would leave the member with both.
  assert.equal(await status(id), "cancelled");
  assert.deepEqual(await allocationStates(id), ["spent"]);
  assert.equal(await balance(), 0, "credit released before the card refund is accepted");

  assert.equal(await finishRefund(id), true);
  assert.equal(await status(id), "refunded");
  assert.deepEqual(await allocationStates(id), ["released"]);
  assert.equal(await balance(), 2000);

  assert.equal(await finishRefund(id), false, "finishing twice is a no-op");
  assert.equal(await balance(), 2000, "and never returns the credit twice");
});

test("beginning a refund twice returns the SAME claim — a retry cannot re-split", async () => {
  await issueCredit(1000);
  const id = await bookWithCredit(4000, 1000, { pi: "pi_retry" });
  const first = await beginRefund(id);
  const second = await beginRefund(id);
  assert.deepEqual(second, first);
  assert.equal(await scalar("select count(*)::int from mem_booking_refunds where booking_id=$1", [id]), 1);
  await finishRefund(id);
});

test("a full-credit booking refunds £0 to card, needs no payment intent, and returns all its credit", async () => {
    await issueCredit(1200);
  const id = await bookWithCredit(1200, 1200);
  assert.equal(await balance(), 0);

  const claim = await beginRefund(id);
  assert.equal(claim.card_pence, 0);
  assert.equal(claim.credit_pence, 1200);
  assert.equal(claim.payment_intent, null);
  await finishRefund(id);
  assert.equal(await balance(), 1200);
});

test("a card booking with no payment intent is refused, and no claim is written", async () => {
  const id = await scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence)
     values ($1, $2, $3, 'confirmed', 700) returning id`,
    [account, await newParticipant(), occurrence]
  );
  await assert.rejects(beginRefund(id), /mem_payment_missing/);
  assert.equal(await status(id), "confirmed");
  assert.equal(await scalar("select count(*)::int from mem_booking_refunds where booking_id=$1", [id]), 0);
});

test("a swept hold releases its RESERVED credit straight away", async () => {
    await issueCredit(500);
  const id = await hold(500);
  await db.query("select * from mem_reserve_credit($1, $2, 500, $3)", [account, [id], `tok-${id}`]);
  assert.equal(await balance(), 0);
  await db.query("update mem_bookings set status='cancelled', cancelled_at=now() where id=$1", [id]);
  assert.deepEqual(await allocationStates(id), ["released"]);
  assert.equal(await balance(), 500);
});

// ── rescue-credit-guard.sql ────────────────────────────────────────────────

test("rescue refuses a mid-refund FULL-CREDIT booking (no payment intent to trip the old guard)", async () => {
  await issueCredit(800);
  const id = await bookWithCredit(800, 800);
  await beginRefund(id); // parked in `cancelled`, claim written, not finished
  await assert.rejects(rescue(`cs-${id}`), /mem_credit_not_rescuable/);
  assert.equal(await status(id), "cancelled");
});

test("rescue refuses a mid-refund CARD booking via the existing all-or-nothing guard", async () => {
  await issueCredit(100);
  const id = await bookWithCredit(3100, 100, { pi: "pi_card_mid" });
  await beginRefund(id);
  await assert.rejects(rescue(`cs-${id}`), /mem_not_rescuable/);
});

test("rescue refuses any checkout carrying a refund claim (defence in depth)", async () => {
  // Unreachable through the functions today — a card claim needs a payment
  // intent, which the older guard already refuses — so the claim is written
  // directly. It pins the check the guard's own comment says it relies on.
  const id = await scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence, stripe_checkout_session_id)
     values ($1, $2, $3, 'cancelled', 600, 'cs-claimed') returning id`,
    [account, await newParticipant(), occurrence]
  );
  await db.query(
    "insert into mem_booking_refunds(booking_id, account_id, card_pence, credit_pence) values ($1, $2, 600, 0)",
    [id, account]
  );
  await assert.rejects(rescue("cs-claimed"), /mem_refund_in_progress/);
});

test("control: a plain swept card hold IS still rescued — the guards are not blanket refusals", async () => {
  const id = await scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence, stripe_checkout_session_id, cancelled_at)
     values ($1, $2, $3, 'cancelled', 700, 'cs-swept', now()) returning id`,
    [account, await newParticipant(), occurrence]
  );
  const rows = (await rescue("cs-swept", "pi_swept")).rows;
  assert.equal(rows.length, 1);
  assert.equal(await status(id), "confirmed");
});

// ── Ported from #78's verify-credits.mjs (hand-written fixture, retired) ───
// Same intent, now against the real schema. `reserve`/`settle` mirror the
// app's calls in lib/booking-checkout.ts and the webhook.
const reserve = (ids, expected, token) =>
  db.query("select * from mem_reserve_credit($1, $2, $3, $4)", [account, ids, expected, token]);
const settle = (token, action, amount, session = token) =>
  scalar("select mem_settle_credit_checkout($1, $2, $3, $4, $5, $6)", [
    token, account, session, amount ? "pi_test" : null, amount, action,
  ]);
const issueRef = (ref, amount = 2000) =>
  db.query(
    `select mem_issue_credit($1, gen_random_uuid(), $1, null, $2, 'Wix', $3, 'Old session',
       '2026-08-01', 'Staff approved', now() + interval '12 months')`,
    [account, amount, ref]
  );

test("a legacy payment can be credited once, whatever its case or spacing", async () => {
  await issueRef("WIX-DUP");
  await assert.rejects(issueRef(" wix-dup "));
  assert.equal(await balance(), 2000);
});

test("a second checkout cannot spend credit the first already reserved", async () => {
  await issueCredit(2000);
  await reserve([await hold(1200)], 1200, "first");
  assert.equal(await balance(), 800);
  await assert.rejects(reserve([await hold(1200)], 1200, "second"), /mem_credit_balance_changed/);
  assert.equal(await balance(), 800);
});

test("credit cannot be reserved against another member's booking", async () => {
  await issueCredit(500);
  const mine = account;
  await freshMember();
  const theirs = await hold(200);
  account = mine;
  await assert.rejects(reserve([theirs], 200, "foreign"), /mem_credit_hold_invalid/);
});

test("a wrong amount cannot confirm a credit checkout, and a replay is harmless", async () => {
  await issueCredit(2000);
  await reserve([await hold(1200)], 1200, "replay");
  await assert.rejects(settle("replay", "paid", 1), /mem_checkout_amount_mismatch/);
  assert.equal(await settle("replay", "paid", 0), 1);
  assert.equal(await settle("replay", "paid", 0), 0, "a redelivered event confirms nothing new");
  assert.equal(await balance(), 800);
});

test("Stripe's 30p minimum keeps credit back instead of overcharging", async () => {
  await issueCredit(2000);
  const id = await hold(2010);
  await reserve([id], 1980, "minimum");
  assert.equal(await balance(), 20);
  await settle("minimum", "paid", 30, "cs_min");
  const claim = await beginRefund(id);
  assert.equal(claim.card_pence, 30);
  assert.equal(claim.credit_pence, 1980);
  await finishRefund(id);
  assert.equal(await balance(), 2000);
});

test("expired and already-redeemed notes are not spendable", async () => {
  const redeemedOn = await hold(100);
  await db.query(
    "insert into mem_credits(account_id, amount_pence, expires_at) values ($1, 10000, now() - interval '1 day')",
    [account]
  );
  await db.query(
    "insert into mem_credits(account_id, amount_pence, redeemed_booking_id) values ($1, 10000, $2)",
    [account, redeemedOn]
  );
  assert.equal(await balance(), 0);
});

test("one checkout across a household allocates the credit exactly", async () => {
  await issueCredit(2000);
  const a = await hold(1500), b = await hold(1500);
  await reserve([a, b], 2000, "household");
  assert.equal(await balance(), 0);
  assert.equal(await settle("household", "processing", 1000, "cs_household"), 2);
  assert.equal(await settle("household", "paid", 1000, "cs_household"), 2);
  assert.equal(await settle("household", "paid", 1000, "cs_household"), 0);
  assert.equal(
    await scalar("select coalesce(sum(credit_applied_pence),0)::int from mem_bookings where id = any($1)", [[a, b]]),
    2000
  );
});

test("members see only their own credit and cannot call the write functions", async () => {
  await issueCredit(777);
  const mine = account;
  await freshMember();
  const other = await scalar("select user_id from mem_accounts where id=$1", [account]);
  const owner = await scalar("select user_id from mem_accounts where id=$1", [mine]);
  try {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`);
    assert.equal(await scalar("select count(*)::int from mem_credit_balances where account_id=$1", [mine]), 0);
    await assert.rejects(issueRef("ILLEGAL"));
    await assert.rejects(db.exec("insert into mem_credit_allocations default values"));
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
    assert.equal(await scalar("select coalesce(sum(available_pence),0)::int from mem_credit_balances where account_id=$1", [mine]), 777);
  } finally {
    await db.exec("reset role");
  }
});

test("crediting a current booking cancels it and issues exactly once", async () => {
  const id = await scalar(
    `insert into mem_bookings(account_id, participant_id, occurrence_id, status, price_paid_pence)
     values ($1, $2, $3, 'confirmed', 1500) returning id`,
    [account, await newParticipant(), occurrence]
  );
  const req = "00000000-0000-4000-8000-000000000099";
  const sql = `select id from mem_issue_credit($1, $2, $1, $3, null, null, null, null, null,
    'Agreed credit', now() + interval '12 months')`;
  const first = await scalar(sql, [account, req, id]);
  assert.equal(await scalar(sql, [account, req, id]), first, "same request id = same note");
  assert.equal(await status(id), "credited");
  await assert.rejects(db.query(sql, [account, "00000000-0000-4000-8000-000000000098", id]));
});

// --- General credit (owner, 2026-09-28) ------------------------------------

const general = (amount, { request = null, platform = null, reference = null, session = null, date = null } = {}) =>
  one(
    `select * from mem_issue_credit($1, coalesce($2::uuid, gen_random_uuid()), $1, null, $3,
       $4, $5, $6, $7::date, 'Took credit instead of a refund', now() + interval '12 months')`,
    [account, request, amount, platform, reference, session, date]
  );

test("general credit needs only an amount and a reason, and is spendable", async () => {
  const c = await general(1500);
  assert.equal(c.amount_pence, 1500);
  assert.equal(c.source_booking_id, null);
  assert.equal(c.external_platform, null);
  assert.equal(c.external_reference, null);
  assert.equal(await balance(), 1500);
  const id = await bookWithCredit(5000, 1500, { pi: "pi_general" });
  assert.equal(await status(id), "confirmed");
  assert.equal(await balance(), 0);
});

test("two general credits for one member are both issued (no external duplicate check)", async () => {
  await general(500);
  await general(700);
  assert.equal(await balance(), 1200);
});

test("resubmitting the same request issues general credit once", async () => {
  const request = "00000000-0000-4000-8000-000000000001";
  const first = await general(900, { request });
  const again = await general(900, { request });
  assert.equal(again.id, first.id);
  assert.equal(await balance(), 900);
});

test("general credit without an amount is refused", async () => {
  await assert.rejects(general(null), /mem_credit_invalid/);
  await assert.rejects(general(0), /mem_credit_invalid|amount_pence_check/);
});

test("a PARTLY filled old-platform credit is refused, not turned into general credit", async () => {
  // Otherwise a migration credit missing its date would lose the
  // platform/reference duplicate check without anyone noticing.
  await assert.rejects(general(1000, { platform: "Wix", reference: "WIX-9" }), /mem_legacy_details_required/);
  await assert.rejects(general(1000, { reference: "WIX-9" }), /mem_legacy_details_required/);
  assert.equal(await balance(), 0);
});

test("old-platform credit still keeps its duplicate check", async () => {
  await general(1000, { platform: "Wix", reference: "WIX-GENERAL-DUP", session: "Skate", date: "2026-08-01" });
  await assert.rejects(
    general(1000, { platform: "wix", reference: "wix-general-dup ", session: "Skate", date: "2026-08-01" }),
    /mem_credit_external_unique|duplicate key/
  );
});
