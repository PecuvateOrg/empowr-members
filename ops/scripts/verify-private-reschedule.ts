import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const id = '00000000-0000-4000-8000-000000000001';
const hold = '00000000-0000-4000-8000-000000000002';
const audit = '00000000-0000-4000-8000-000000000003';
const oldStart = '2099-12-12T15:00:00.000Z';
const newStart = '2099-12-05T15:00:00.000Z';
let authorised = true, rpcError: { message: string } | null = null, rpcCalls = 0, rpcArgs: Record<string, unknown> = {};
let emails: { to: string; subject: string; html: string }[] = [], mailOk = true, hostAccount: string | null = 'host-account';
let auditUpdates = 0;

mock.module('server-only', { namedExports: {} });
mock.module('next/server', { namedExports: { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } } });
mock.module('@/lib/admin', { namedExports: { getAuthedAdmin: async () => authorised ? { id: 'staff-user' } : null } });
mock.module('@/lib/email', { namedExports: { sendEmail: async (m: { to: string; subject: string; html: string }) => { emails.push(m); return mailOk; } } });
mock.module('@/lib/notifications', { namedExports: { accountContact: async (_s: unknown, account: string) => {
  assert.equal(account, 'host-account'); return { name: 'Example Host', email: 'host@example.test' };
} } });
mock.module('@/lib/private-bookings-confirm', { namedExports: { venueLine: async () => 'Example Venue' } });
mock.module('@/lib/supabase/service', { namedExports: { createServiceClient: () => ({
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls++; rpcArgs = args;
    assert.equal(name, 'mem_admin_reschedule_private_booking');
    if (rpcError) return { data: null, error: rpcError };
    return { data: { id: audit, old_starts_at: oldStart, old_ends_at: '2099-12-12T17:00:00.000Z', new_starts_at: newStart, new_ends_at: '2099-12-05T17:00:00.000Z' }, error: null };
  },
  from: (table: string) => {
    const builder = {
      select: () => builder,
      update: () => { if (table === 'mem_private_booking_reschedules') auditUpdates++; return builder; },
      eq: async () => ({ error: null }),
      maybeSingle: async () => ({ data: { kind: 'birthday', venue_id: 'v', host_account_id: hostAccount, invite_token: 'tok123', equipment_deadline_days: 14 }, error: null }),
    };
    // select(...).eq(...).maybeSingle() for the booking read
    if (table === 'mem_private_bookings') return { select: () => ({ eq: () => ({ maybeSingle: builder.maybeSingle }) }) };
    return builder;
  },
}) } });

const { POST } = await import('@/app/api/admin/private-bookings/[id]/reschedule/route');
const body = (extra: Record<string, unknown> = {}) => ({ expected_starts_at: oldStart, new_starts_at: newStart, reason: 'Venue closed that day', ...extra });
const post = (b: unknown, bookingId = id) => POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(b) }), { params: Promise.resolve({ id: bookingId }) });
function reset() { authorised = true; rpcError = null; rpcCalls = 0; rpcArgs = {}; emails = []; mailOk = true; hostAccount = 'host-account'; auditUpdates = 0; }

test('admin only; invalid input never reaches the database', async () => {
  reset(); authorised = false; assert.equal((await post(body())).status, 401);
  reset();
  for (const b of [null, {}, body({ reason: 'x' }), body({ new_starts_at: 'tomorrow' }), body({ block_old_slot: true }), body({ replace_block_id: 'not-a-uuid' })]) {
    assert.equal((await post(b)).status, 400, JSON.stringify(b));
  }
  assert.equal((await post(body(), 'not-a-uuid')).status, 404);
  assert.equal(rpcCalls, 0);
});

test('passes the staff identity, expected time and only the chosen hold', async () => {
  reset();
  const res = await post(body({ replace_block_id: hold, block_old_slot: true, old_slot_note: 'Venue closure' }));
  assert.equal(res.status, 200);
  assert.equal(rpcArgs.p_staff_user_id, 'staff-user');
  assert.equal(rpcArgs.p_booking_id, id);
  assert.equal(rpcArgs.p_expected_starts_at, oldStart);
  assert.equal(rpcArgs.p_replace_block_id, hold);
  assert.equal(rpcArgs.p_block_old_slot, true);
  assert.equal(rpcArgs.p_old_slot_note, 'Venue closure');
  assert.equal(emails.length, 0, 'no email unless staff ask for one');
  reset(); await post(body()); assert.equal(rpcArgs.p_replace_block_id, null); assert.equal(rpcArgs.p_old_slot_note, null);
});

test('database refusals become clear conflicts and never send mail', async () => {
  for (const [code, status] of [['mem_private_unavailable', 409], ['mem_private_reschedule_stale', 409], ['mem_private_reschedule_bad_hold', 409], ['mem_private_reschedule_started', 409], ['mem_private_not_saturday', 400], ['mem_private_past_window', 400]] as const) {
    reset(); rpcError = { message: code };
    const res = await post(body({ notify_host: true }));
    assert.equal(res.status, status, code);
    assert.ok(!(await res.json()).error.includes('mem_'), 'never echoes the database code');
    assert.equal(emails.length, 0);
  }
  reset(); rpcError = { message: 'connection reset' };
  const res = await post(body());
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /Nothing was changed/);
});

test('host notice: one reschedule email, unchanged invite link, no payment wording; mail failure does not fail the move', async () => {
  reset();
  const res = await post(body({ notify_host: true }));
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.hostNotified, true);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'host@example.test');
  assert.match(emails[0].subject, /moved/);
  assert.doesNotMatch(emails[0].subject, /confirm/i, 'not a second confirmation');
  assert.match(emails[0].html, /private-bookings\/join\/tok123/, 'same invite link');
  assert.match(emails[0].html, /Sat 5 Dec 2099/);
  assert.match(emails[0].html, /Sat 12 Dec 2099/);
  assert.equal(auditUpdates, 1, 'notification recorded');

  reset(); mailOk = false;
  const failed = await post(body({ notify_host: true }));
  assert.equal(failed.status, 200, 'the move already committed');
  assert.equal((await failed.json()).hostNotified, false);
  assert.equal(auditUpdates, 0);

  reset(); hostAccount = null;
  const noHost = await post(body({ notify_host: true }));
  assert.equal((await noHost.json()).hostNotified, false);
  assert.equal(emails.length, 0);
});
