import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
// tools.ts reaches next/cache and next/headers through the modules it shares
// with the screens; resolve every extensionless next/* subpath like next/server.
register('data:text/javascript,' + encodeURIComponent(`
  export function resolve(specifier, context, next) {
    return next(/^next\\/[a-z-]+$/.test(specifier) && specifier !== 'next/server' ? specifier + '.js' : specifier, context);
  }
`), import.meta.url);

const booking = '00000000-0000-4000-8000-000000000001';
const block = '00000000-0000-4000-8000-000000000002';
const customer = '00000000-0000-4000-8000-000000000003';
const preview = '00000000-0000-4000-8000-000000000004';
const oldStart = '2099-12-12T15:00:00.000Z';
const newStart = '2099-12-05T15:00:00+00:00';

const rows: Record<string, Record<string, unknown>> = {
  [booking]: { kind: 'birthday', status: 'confirmed', starts_at: oldStart, ends_at: '2099-12-12T17:00:00.000Z', host_account_id: 'host', host: { name: 'Example Host' }, places: [{ count: 7 }] },
  [block]: { kind: 'block', status: 'confirmed', starts_at: '2099-12-05T15:00:00.000Z', ends_at: '2099-12-05T17:00:00.000Z', note: 'Held for move' },
  [customer]: { kind: 'birthday', status: 'confirmed', starts_at: '2099-12-05T15:00:00.000Z', ends_at: '2099-12-05T17:00:00.000Z', note: null },
};
let logged: { tool: string; input: Record<string, unknown>; result: Record<string, unknown>; ok: boolean }[] = [];
let stored: { input: Record<string, unknown>; result: Record<string, unknown> } | null = null;
let recent = 0, moveCalls: { id: string; input: Record<string, unknown>; user: string }[] = [], moveStatus = 200;

mock.module('server-only', { namedExports: {} });
mock.module('next/server', { namedExports: { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } } });
mock.module('@/lib/mcp/actions', { namedExports: {
  PREVIEW_TTL_MINUTES: 10, SENDS_PER_HOUR: 5, MAX_RECIPIENTS_PER_SEND: 300, CREDITS_PER_HOUR: 10, CANCELS_PER_HOUR: 3,
  RESCHEDULES_PER_HOUR: 5, MAX_REFUND_PENCE: 50000, MAX_CREDIT_PENCE: 20000, messageFingerprint: () => 'x',
  logAction: async (_c: unknown, tool: string, input: Record<string, unknown>, result: Record<string, unknown>, ok: boolean) => {
    logged.push({ tool, input, result, ok });
    if (tool === 'preview_reschedule_private_booking') stored = { input, result };
    return preview;
  },
  findPreview: async (_c: unknown, id: string, tool: string) => (id === preview && tool === 'preview_reschedule_private_booking' ? stored : null),
  actionsInLastHour: async () => recent,
} });
mock.module('@/lib/private-reschedule', { namedExports: {
  privateRescheduleSchema: (await import('zod')).z.object({}).passthrough(),
  reschedulePrivateBooking: async (id: string, input: Record<string, unknown>, user: string) => {
    moveCalls.push({ id, input, user });
    return Response.json(moveStatus === 200 ? { hostNotified: true } : { error: 'This booking was changed by someone else.' }, { status: moveStatus });
  },
} });
mock.module('@/lib/supabase/service', { namedExports: { createServiceClient: () => ({
  from: () => {
    let id = '';
    const b = { select: () => b, eq: (_k: string, v: string) => { id = v; return b; }, maybeSingle: async () => ({ data: rows[id] ?? null, error: null }) };
    return b;
  },
}) } });

const { TOOLS, toolsFor: toolList } = await import('@/lib/mcp/tools') as unknown as {
  TOOLS: Record<string, { roles: string[]; input: { parse: (v: unknown) => unknown }; run: (a: unknown, c: unknown) => Promise<Record<string, unknown>> }>;
  toolList?: unknown;
};
const caller = { user: { id: 'staff-user', email: 'staff@example.test' }, role: 'admin', clientId: null };
const run = (name: string, args: unknown) => TOOLS[name].run(TOOLS[name].input.parse(args), caller);
function reset() { logged = []; stored = null; recent = 0; moveCalls = []; moveStatus = 200; }

test('admin-only tools with a publishable schema', async () => {
  const { z } = await import('zod');
  for (const name of ['preview_reschedule_private_booking', 'reschedule_private_booking']) {
    assert.deepEqual(TOOLS[name].roles, ['admin']);
    assert.ok(z.toJSONSchema(TOOLS[name].input as never));
  }
  assert.throws(() => TOOLS.preview_reschedule_private_booking.input.parse({ booking_id: booking, new_starts_at: newStart, reason: 'Venue closed', block_old_slot: true }));
  void toolList;
});

test('preview changes nothing, shows what moves, and never treats a customer booking as a hold', async () => {
  reset();
  const out = await run('preview_reschedule_private_booking', { booking_id: booking, new_starts_at: newStart, reason: 'Venue closed', replace_block_id: block, notify_host: true });
  assert.equal(out.preview_id, preview);
  assert.equal(out.guests_registered, 7);
  assert.match(String(out.current_time), /Sat 12 Dec 2099/);
  assert.match(String(out.new_time), /Sat 5 Dec 2099/);
  assert.match(String(out.replacing_staff_block), /Held for move/);
  assert.equal(out.host_emailed, true);
  assert.equal(moveCalls.length, 0, 'preview never moves anything');
  await assert.rejects(run('preview_reschedule_private_booking', { booking_id: booking, new_starts_at: newStart, reason: 'Venue closed', replace_block_id: customer }), /customer booking can never be replaced/);
  await assert.rejects(run('preview_reschedule_private_booking', { booking_id: block, new_starts_at: newStart, reason: 'Venue closed' }), /could not be found/);
  assert.equal(moveCalls.length, 0);
});

test('move needs a fresh preview, respects the hourly cap and passes the time the person saw', async () => {
  reset();
  await assert.rejects(run('reschedule_private_booking', { preview_id: preview }), /No reschedule preview/);
  await run('preview_reschedule_private_booking', { booking_id: booking, new_starts_at: newStart, reason: 'Venue closed', replace_block_id: block, block_old_slot: true, old_slot_note: 'Closure' });
  recent = 5;
  await assert.rejects(run('reschedule_private_booking', { preview_id: preview }), /in the last hour/);
  assert.equal(moveCalls.length, 0);
  recent = 0;
  const out = await run('reschedule_private_booking', { preview_id: preview });
  assert.equal(moveCalls.length, 1);
  assert.equal(moveCalls[0].id, booking);
  assert.equal(moveCalls[0].user, 'staff-user');
  assert.equal(moveCalls[0].input.expected_starts_at, oldStart);
  assert.equal(moveCalls[0].input.replace_block_id, block);
  assert.equal(moveCalls[0].input.block_old_slot, true);
  assert.equal(moveCalls[0].input.notify_host, false);
  assert.match(String(out.moved), /Sat 12 Dec 2099.*Sat 5 Dec 2099/);
  assert.ok(logged.some((l) => l.tool === 'reschedule_private_booking' && l.ok));

  moveStatus = 409;
  await assert.rejects(run('reschedule_private_booking', { preview_id: preview }), /changed by someone else/);
  assert.ok(logged.some((l) => l.tool === 'reschedule_private_booking' && !l.ok), 'refusal is logged');
});
