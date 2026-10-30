const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../src/node_modules/typescript');

function compile(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, console, Date, Intl, Map });
  return exports;
}

async function cancel({ source = 'member', price = 0, covered = true, issueFails = false, sessions = 5 } = {}) {
  const writes = [], calls = [], emails = [];
  const occurrence = { id: 'occurrence', offering_id: 'offering', status: 'scheduled',
    starts_at: '2026-11-02T16:00:00Z', ends_at: '2026-11-02T17:00:00Z', offering: { title: 'Monday session' } };
  const booking = { id: 'booking', account_id: 'account', participant_id: 'participant',
    source, price_paid_pence: price, status: 'confirmed', participant: { name: 'Skater' } };
  const service = {
    from(table) {
      let mutation = false;
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        update(value) { mutation = true; writes.push({ table, value }); return query; },
        maybeSingle() { return query; },
        then(resolve) { return Promise.resolve({ error: null, data: table === 'mem_occurrences'
          ? occurrence : table === 'mem_accounts' ? { user_id: 'user' } : mutation ? null : [booking] }).then(resolve); },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { error: issueFails ? new Error('credit failure') : null }; },
    auth: { admin: { async getUserById() { return { data: { user: { email: 'test@example.invalid' } } }; } } },
  };
  const route = compile('../../src/app/api/admin/occurrences/[id]/cancel/route.ts', {
    'node:crypto': require('node:crypto'),
    'next/server': { NextResponse: { json: (data, init) => ({ data, status: init?.status ?? 200 }) } },
    '@/lib/admin': { getAuthedAdmin: async () => ({ id: 'admin' }) },
    '@/lib/supabase/service': { createServiceClient: () => service },
    '@/lib/credits': { refundBooking() { throw new Error('Unexpected refund'); } },
    '@/lib/membership': {
      coverForOccurrence: async () => covered ? [{ participant_id: 'participant', account_id: 'account', plan_id: 'plan' }] : [],
      plansForOccurrence: async () => [{ id: 'plan', price_pence: 3000 }],
    },
    '@/lib/subscriber-cancellation-credit': compile('../../src/lib/subscriber-cancellation-credit.ts', {}),
    '@/lib/revalidate': { revalidateCatalogue: async () => {} },
    '@/lib/business-rules': { CREDIT_EXPIRY_MONTHS: 12 },
    '@/lib/format': { formatOccurrence: () => '2 November' },
    '@/lib/validation': { cancelOccurrenceSchema: { safeParse: data => ({ success: true, data }) } },
    '@/lib/notifications': { sendOccurrenceCancelledEmail: async (to, data) => emails.push(data) },
  });
  const response = await route.POST({ json: async () => ({ outcome: 'credit', reason: 'Venue closed', sessions_in_month: sessions }) },
    { params: Promise.resolve({ id: 'occurrence' }) });
  return { response, writes, calls, emails };
}

test('subscriber receives £6 account credit and an explanation, using a stable request id', async () => {
  const result = await cancel();
  assert.equal(result.response.data.processed, 1);
  assert.equal(result.calls[0].args.p_amount, 600);
  assert.equal(result.calls[0].args.p_booking_id, null);
  assert.equal(result.calls[0].args.p_request_id, 'booking');
  assert.equal(result.calls[0].args.p_session_date, '2026-11-02');
  assert.equal(result.emails[0].outcome.amountPence, 600);
  assert.match(result.emails[0].creditExplanations[0], /using 5 sessions/);
  assert.equal(result.writes.at(-1).value.status, 'credited');
});
test('unresolved subscription fails before cancelling or crediting anything', async () => {
  const result = await cancel({ covered: false });
  assert.equal(result.response.status, 409);
  assert.equal(result.writes.length, 0);
  assert.equal(result.calls.length, 0);
  assert.equal(result.emails.length, 0);
});
test('selected four-session divisor reaches the credit and email', async () => {
  const result = await cancel({ sessions: 4 });
  assert.equal(result.calls[0].args.p_amount, 750);
  assert.match(result.emails[0].creditExplanations[0], /using 4 sessions/);
});
test('paid bookings still use the original booking-linked credit path', async () => {
  const result = await cancel({ source: 'online', price: 800 });
  assert.equal(result.calls[0].args.p_booking_id, 'booking');
  assert.equal(result.calls[0].args.p_amount, null);
  assert.equal(result.emails[0].outcome.amountPence, 800);
  assert.equal(result.emails[0].creditExplanations.length, 0);
});
test('a free non-subscription booking does not receive subscription compensation', async () => {
  const result = await cancel({ source: 'online' });
  assert.equal(result.calls.length, 0);
  assert.equal(result.writes.at(-1).value.status, 'cancelled');
});
test('failed credit is reported and never emailed as successful', async () => {
  const result = await cancel({ issueFails: true });
  assert.equal(result.response.data.failed, 1);
  assert.equal(result.response.data.processed, 0);
  assert.equal(result.emails.length, 0);
  assert.equal(result.writes.filter(w => w.table === 'mem_bookings').length, 0);
});
