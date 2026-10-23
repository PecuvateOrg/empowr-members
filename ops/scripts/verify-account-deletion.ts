/**
 * verify-account-deletion.ts — the app half of account deletion (lib/account-deletion-core.ts and
 * lib/emails/account-deletion.ts). The SQL half is verify-account-deletion-sql.mjs.
 *
 * Run:  npm run verify:account-deletion     (from src/)
 *
 * Pins: signed links verify only for their own kind and request; reminders go once each, on the
 * right day; only a staff hold or an open dispute HOLDS, everything else defers; a Stripe customer
 * is deleted only when it is Members' AND this account's; a retry after a partial failure never
 * repeats a step; the staff alert carries no personal data; legal@ is copied on legal holds only.
 *
 * Supabase is a small in-memory fake covering exactly the calls the core makes. Every assertion
 * here was made to fail once by breaking the code it guards.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const core = await import("@/lib/account-deletion-core");
const emails = await import("@/lib/emails/account-deletion");

type Row = Record<string, unknown>;
const DAY = 24 * 60 * 60 * 1000;

/** The subset of the Supabase client the core uses, over in-memory tables. */
function fakeSupabase(tables: Record<string, Row[]>, opts: { users?: Record<string, string>; rpcFails?: boolean } = {}) {
  const calls: string[] = [];
  const users = { ...(opts.users ?? {}) };
  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let head = false;
    let selectCols = "";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const withJoins = (r: Row) => {
      if (selectCols.includes("account:mem_accounts")) {
        const a = (tables.mem_accounts ?? []).find((x) => x.id === r.account_id);
        return { ...r, account: a ? { user_id: a.user_id, stripe_customer_id: a.stripe_customer_id } : null };
      }
      return r;
    };
    const result = () => {
      if (patch) { for (const r of rows()) Object.assign(r, patch); return { data: null, error: null }; }
      if (head) return { data: null, count: rows().length, error: null };
      return { data: rows().map(withJoins), error: null };
    };
    const b = {
      select(cols: string, o?: { head?: boolean }) { selectCols = cols; head = Boolean(o?.head); return b; },
      update(p: Row) { patch = p; calls.push(`update ${table} ${Object.keys(p).join(",")}`); return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      lte(c: string, v: string) { filters.push((r) => String(r[c]) <= v); return b; },
      gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return b; },
      single: async () => ({ data: rows().map(withJoins)[0] ?? null, error: rows().length ? null : { message: "no row" } }),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return b;
  }
  return {
    calls,
    users,
    from: query,
    rpc: async (name: string, args: Row) => {
      calls.push(`rpc ${name}`);
      if (opts.rpcFails) return { data: null, error: { message: "rpc failed" } };
      const acct = (tables.mem_accounts ?? []).find((a) => a.id === args.p_account_id);
      if (acct) acct.name = "Deleted member";
      return { data: { participants_deleted: 0, participants_anonymised: 1 }, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users[id] ? { email: users[id] } : null }, error: null }),
        deleteUser: async (id: string) => { calls.push(`deleteUser ${id}`); delete users[id]; for (const a of tables.mem_accounts ?? []) if (a.user_id === id) a.user_id = null; return { error: null }; },
        updateUserById: async (id: string, p: Row) => { calls.push(`ban ${id} ${p.ban_duration}`); return { error: null }; },
      },
    },
  };
}

function fakeStripe(o: { customer?: Row; disputeStatus?: string | null; failCharges?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    customers: {
      retrieve: async () => o.customer ?? { deleted: false, metadata: {} },
      del: async (id: string) => { calls.push(`del ${id}`); return {}; },
    },
    charges: {
      list: () => {
        if (o.failCharges) throw new Error("stripe down");
        const data = o.disputeStatus === undefined ? [] : [{ id: "ch_1", disputed: true }];
        return { async *[Symbol.asyncIterator]() { for (const c of data) yield c; } };
      },
    },
    disputes: { list: async () => ({ data: o.disputeStatus ? [{ status: o.disputeStatus }] : [] }) },
  };
}

const outbox = () => {
  const sent: { to: string; subject: string; html: string }[] = [];
  return { sent, send: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return true; } };
};

function world(over: { account?: Row; deletion?: Row; refunds?: Row[]; bookings?: Row[] } = {}) {
  const account = { id: "acc-1", user_id: "user-1", name: "Alex Parent", deletion_hold: false, stripe_customer_id: "cus_1", ...over.account };
  const deletion = {
    id: "11111111-2222-3333-4444-555555555555", account_id: "acc-1", status: "scheduled",
    confirmed_at: new Date(Date.now() - 14 * DAY).toISOString(), erase_after: new Date(Date.now() - 60_000).toISOString(),
    reminder_7_sent_at: null, reminder_13_sent_at: null, outcome: null, hold_reasons: [], ...over.deletion,
  };
  return {
    tables: { mem_accounts: [account], mem_account_deletions: [deletion], mem_booking_refunds: over.refunds ?? [], mem_bookings: over.bookings ?? [], mem_course_attendance: [] as Row[] },
    deletion,
    account,
  };
}

// ---- Signed links ---------------------------------------------------------------------------
test("a signed link verifies only for its own kind and request", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const t = core.deletionLinkToken("cancel", id);
  assert.equal(core.verifyDeletionLinkToken("cancel", id, t), true);
  assert.equal(core.verifyDeletionLinkToken("confirm", id, t), false);
  assert.equal(core.verifyDeletionLinkToken("cancel", "99999999-2222-3333-4444-555555555555", t), false);
  assert.equal(core.verifyDeletionLinkToken("cancel", id, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")), false);
  assert.match(core.deletionLink("cancel", id), /\/account-deletion\/cancel\?id=11111111-2222-3333-4444-555555555555&t=/);
});

// ---- Reminders ------------------------------------------------------------------------------
test("the halfway reminder goes on day 7, once", async () => {
  const w = world({ deletion: { confirmed_at: new Date(Date.now() - 7 * DAY - 60_000).toISOString(), erase_after: new Date(Date.now() + 7 * DAY).toISOString() } });
  const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
  const box = outbox();
  assert.equal((await core.sendDeletionReminders(db as never, box.send)).sent, 1);
  assert.match(box.sent[0].subject, /coming up/);
  assert.ok(w.deletion.reminder_7_sent_at);
  assert.equal((await core.sendDeletionReminders(db as never, box.send)).sent, 0);
});

test("the final reminder goes in the last 24 hours, once, and not before day 7's", async () => {
  const w = world({ deletion: { confirmed_at: new Date(Date.now() - 13 * DAY - 60_000).toISOString(), erase_after: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(), reminder_7_sent_at: new Date().toISOString() } });
  const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
  const box = outbox();
  assert.equal((await core.sendDeletionReminders(db as never, box.send)).sent, 1);
  assert.match(box.sent[0].subject, /tomorrow/);
  assert.equal((await core.sendDeletionReminders(db as never, box.send)).sent, 0);
  const early = world({ deletion: { confirmed_at: new Date(Date.now() - 3 * DAY).toISOString(), erase_after: new Date(Date.now() + 11 * DAY).toISOString() } });
  assert.equal((await core.sendDeletionReminders(fakeSupabase(early.tables, { users: { "user-1": "x@y.z" } }) as never, box.send)).sent, 0);
});

// ---- Holds ----------------------------------------------------------------------------------
test("a staff hold or an open dispute HOLDS the request and emails staff + legal@", async () => {
  for (const [label, w, stripe] of [
    ["staff hold", world({ account: { deletion_hold: true } }), fakeStripe()],
    ["dispute", world(), fakeStripe({ disputeStatus: "needs_response" })],
  ] as const) {
    const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
    const box = outbox();
    const r = await core.runDueErasures(db as never, { stripe: stripe as never, brevo: null, send: box.send });
    assert.equal(r.held, 1, label);
    assert.equal(w.deletion.status, "held", label);
    assert.deepEqual(box.sent.map((m) => m.to).sort(), ["bookings@empowrcic.org", "legal@empowrcic.org"], label);
    assert.ok(!db.calls.includes("rpc mem_erase_account"), label);
  }
});

test("a settled (lost or won) dispute does not hold", async () => {
  const w = world();
  const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
  const r = await core.runDueErasures(db as never, { stripe: fakeStripe({ disputeStatus: "lost", customer: { deleted: false, metadata: { app: "members", mem_account_id: "acc-1" } } }) as never, brevo: null, send: outbox().send });
  assert.equal(r.erased, 1);
});

test("a recent session, an unsettled refund or a Stripe outage only DEFERS, with no staff email", async () => {
  const recent = world({ bookings: [{ id: "b1", account_id: "acc-1", status: "attended", occurrence: { starts_at: new Date(Date.now() - 2 * DAY).toISOString() } }] });
  recent.tables.mem_bookings = recent.tables.mem_bookings.map((b) => ({ ...b }));
  const cases = [
    ["recent session", recent, fakeStripe()],
    ["refund", world({ refunds: [{ account_id: "acc-1", completed: false }] }), fakeStripe()],
    ["stripe outage", world(), fakeStripe({ failCharges: true })],
  ] as const;
  for (const [label, w, stripe] of cases) {
    const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
    const box = outbox();
    const r = await core.runDueErasures(db as never, { stripe: stripe as never, brevo: null, send: box.send });
    assert.equal(r.deferred, 1, label);
    assert.equal(w.deletion.status, "scheduled", label);
    assert.equal(box.sent.length, 0, label);
  }
});

// ---- Erasure --------------------------------------------------------------------------------
test("erasure: Members customer deleted, completion email, database, login — then erased", async () => {
  const w = world();
  const db = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
  const stripe = fakeStripe({ customer: { deleted: false, metadata: { app: "members", mem_account_id: "acc-1" } } });
  const box = outbox();
  const brevoCalls: string[] = [];
  const brevo = { deleteContact: async (e: string) => { brevoCalls.push(e); } };
  const r = await core.runDueErasures(db as never, { stripe: stripe as never, brevo: brevo as never, send: box.send });
  assert.equal(r.erased, 1);
  assert.deepEqual(stripe.calls, ["del cus_1"]);
  assert.deepEqual(brevoCalls, ["tech@pecuvate.com"]);
  assert.equal(box.sent[0].to, "tech@pecuvate.com");
  assert.match(box.sent[0].subject, /has been deleted/);
  assert.ok(db.calls.indexOf("rpc mem_erase_account") < db.calls.indexOf("deleteUser user-1"));
  assert.equal(w.deletion.status, "erased");
  assert.equal(w.account.user_id, null);
});

test("a Stripe customer that is not this account's Members customer is never deleted", async () => {
  for (const metadata of [{}, { app: "heroes" }, { app: "members", mem_account_id: "someone-else" }]) {
    const w = world();
    const stripe = fakeStripe({ customer: { deleted: false, metadata } });
    await core.runDueErasures(fakeSupabase(w.tables, { users: { "user-1": "x@y.z" } }) as never, { stripe: stripe as never, brevo: null, send: outbox().send });
    assert.deepEqual(stripe.calls, [], JSON.stringify(metadata));
    assert.equal((w.deletion.outcome as Row).stripe_customer, "skipped_not_members");
  }
});

test("a retry after a failed erasure does not repeat a finished step", async () => {
  const w = world();
  const stripe = fakeStripe({ customer: { deleted: false, metadata: { app: "members", mem_account_id: "acc-1" } } });
  const box = outbox();
  const failing = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" }, rpcFails: true });
  const first = await core.runDueErasures(failing as never, { stripe: stripe as never, brevo: null, send: box.send });
  assert.equal(first.failed, 1);
  assert.equal(w.deletion.status, "scheduled");
  const memberEmails = () => box.sent.filter((m) => m.to === "tech@pecuvate.com").length;
  assert.equal(memberEmails(), 1);
  const retry = fakeSupabase(w.tables, { users: { "user-1": "tech@pecuvate.com" } });
  const second = await core.runDueErasures(retry as never, { stripe: stripe as never, brevo: null, send: box.send });
  assert.equal(second.erased, 1);
  assert.deepEqual(stripe.calls, ["del cus_1"]);
  assert.equal(memberEmails(), 1);
});

// ---- Emails ---------------------------------------------------------------------------------
test("the staff alert carries no personal data", () => {
  const { subject, html } = emails.buildDeletionStaffAlertEmail({ event: "held", ref: "DEL-11111111", holdReasons: ["staff_hold"], adminUrl: "https://members.empowrcic.org/admin/deletions#x" });
  assert.match(subject, /DEL-11111111/);
  for (const personal of ["Alex", "Parent", "tech@pecuvate.com", "07700"]) assert.ok(!html.includes(personal), personal);
});

test("the scheduled email states the date, the cancel link and what is kept", () => {
  const { html } = emails.buildDeletionScheduledEmail({
    eraseAfter: "2026-11-06T10:00:00Z", cancelUrl: "https://members.empowrcic.org/account-deletion/cancel?id=x&t=y", held: false,
    bookings: [{ title: "Skate Jam", when: "Sat 1 Nov", outcome: "refunded" }], membershipsCancelled: 1, creditPence: 500,
  });
  assert.match(html, /Friday,? 6 November 2026/);
  assert.match(html, /account-deletion\/cancel\?id=x&amp;t=y|account-deletion\/cancel\?id=x&t=y/);
  assert.match(html, /7 years/);
  assert.match(html, /turns 21/);
  assert.match(html, /£5(\.00)? of unused credit/);
});
