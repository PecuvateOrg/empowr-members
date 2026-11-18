// Fixture integration test for ops/sql/admin-reschedule-private-booking.sql.
// Uses the repository's original private-booking schema; the maintainer's
// current-schema dry run is also required before applying.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table mem_venues(id uuid primary key default gen_random_uuid());
    create table mem_accounts(id uuid primary key default gen_random_uuid());
    create table mem_participants(id uuid primary key default gen_random_uuid(), account_id uuid);
    create table mem_offerings(id uuid primary key default gen_random_uuid(), venue_id uuid);
    create table mem_occurrences(id uuid primary key default gen_random_uuid(), offering_id uuid, venue_id uuid, status text, starts_at timestamptz, ends_at timestamptz);
    create function mem_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
  `);
  const original = readFileSync(new URL('../../planning/architecture/private-bookings-schema.sql', import.meta.url), 'utf8');
  await db.exec(original.slice(0, original.indexOf('create function public.mem_block_private_slot')));
  await db.exec(readFileSync(new URL('../sql/admin-reschedule-private-booking.sql', import.meta.url), 'utf8'));

  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const scalar = async (sql, args = []) => Object.values(await one(sql, args))[0];
  const fails = (promise, code) => assert.rejects(promise, e => e.message.includes(code), `expected ${code}`);

  const venue = await scalar('insert into mem_venues default values returning id');
  const host = await scalar('insert into mem_accounts default values returning id');
  const other = await scalar('insert into mem_accounts default values returning id');
  const guest = await scalar('insert into mem_participants(account_id) values($1) returning id', [host]);
  const staff = await scalar("insert into auth.users values('00000000-0000-4000-8000-000000000001') returning id");
  await db.query("insert into mem_private_booking_types(kind,title,unit_price_pence,min_places,max_places,venue_id,active) values('birthday','Party',2000,10,80,$1,true),('coaching_one','One',4000,1,1,$1,true)", [venue]);

  // Saturdays 3pm London, 3, 4, 5 and 6 weeks out.
  const sat = async (weeks, hour = 15) => scalar(
    `select (((now() at time zone 'Europe/London')::date + ((6 - extract(isodow from now() at time zone 'Europe/London')::int + 7) % 7) + $1::int * 7) + make_time($2::int,0,0)) at time zone 'Europe/London'`,
    [weeks, hour]);
  const [a, b, c, d] = [await sat(3), await sat(4), await sat(5), await sat(6)];
  const book = async (kind, at, hours, account) => one(
    `insert into mem_private_bookings(kind,status,source,venue_id,starts_at,ends_at,host_account_id,paid_places,total_places,price_pence,hire_pence,stripe_checkout_session_id,stripe_payment_intent_id,payment_handling,created_by_user_id,invite_token)
     values($1,'confirmed','online',$2,$3,$3::timestamptz + make_interval(hours => $4),$5,10,11,20000,0,'cs_'||gen_random_uuid(),'pi_test',null,null,md5(gen_random_uuid()::text)) returning *`,
    [kind, venue, at, hours, account]);
  const block = async (at, hours = 2) => one(
    `insert into mem_private_bookings(kind,status,source,venue_id,starts_at,ends_at,created_by_user_id,note)
     values('block','confirmed','manual',$1,$2,$2::timestamptz + make_interval(hours => $3),$4,'Staff hold') returning *`,
    [venue, at, hours, staff]);
  const move = (id, expected, to, opts = {}) => one(
    'select * from mem_admin_reschedule_private_booking($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, expected, to, opts.staff ?? staff, opts.reason ?? 'Venue closed that day',
     opts.hold ?? null, opts.blockOld ?? false, opts.note ?? null]);
  const row = id => one('select * from mem_private_bookings where id=$1', [id]);

  // --- Happy path: move onto a staff hold the admin chose ---------------
  const party = await book('birthday', a, 2, host);
  await db.query('insert into mem_private_booking_places(private_booking_id,account_id,participant_id) values($1,$2,$3)', [party.id, host, guest]);
  const hold = await block(b);
  const audit = await move(party.id, party.starts_at, b, { hold: hold.id });
  const moved = await row(party.id);
  assert.equal(moved.id, party.id, 'booking id preserved');
  assert.equal(Date.parse(moved.starts_at), Date.parse(b));
  assert.equal(Date.parse(moved.ends_at) - Date.parse(moved.starts_at), 2 * 3600000, 'duration preserved');
  for (const k of ['invite_token', 'host_account_id', 'stripe_checkout_session_id', 'stripe_payment_intent_id', 'price_pence', 'paid_places', 'total_places', 'status', 'source']) {
    assert.deepEqual(moved[k], party[k], `${k} preserved`);
  }
  assert.equal(await scalar('select count(*)::int from mem_private_booking_places where private_booking_id=$1', [party.id]), 1, 'guests stay registered');
  assert.equal((await row(hold.id)).status, 'cancelled', 'chosen hold lifted');
  assert.equal(audit.replaced_block_id, hold.id);
  assert.equal(Date.parse(audit.old_starts_at), Date.parse(a));
  assert.equal(audit.staff_user_id, staff);
  assert.equal(audit.old_slot_block_id, null);
  assert.equal(await scalar(`select mem_private_slot_problem('birthday',$1,2,true)`, [a]), null, 'old slot is free again');

  // --- Stale screen / double submit -------------------------------------
  await fails(move(party.id, party.starts_at, c), 'mem_private_reschedule_stale');
  await fails(move(party.id, moved.starts_at, moved.starts_at), 'mem_private_reschedule_same_time');

  // --- Never over a customer booking, even if named as the hold ----------
  const customer = await book('birthday', c, 2, other);
  await fails(move(party.id, moved.starts_at, c), 'mem_private_unavailable');
  await fails(move(party.id, moved.starts_at, c, { hold: customer.id }), 'mem_private_reschedule_bad_hold');
  assert.equal((await row(customer.id)).status, 'confirmed', 'customer booking untouched');

  // --- An unselected hold is never lifted ---------------------------------
  const hold2 = await block(d);
  await fails(move(party.id, moved.starts_at, d), 'mem_private_unavailable');
  assert.equal((await row(hold2.id)).status, 'confirmed');
  // a hold that does not touch the new time cannot be named
  await fails(move(party.id, moved.starts_at, d, { hold: customer.id }), 'mem_private_reschedule_bad_hold');

  // --- Rollback: a failed rule leaves the chosen hold and booking alone ---
  // 4pm overlaps the hold, so the hold is lifted before the 5pm finish rule
  // refuses the time; the whole move must roll back.
  await fails(move(party.id, moved.starts_at, await sat(6, 16), { hold: hold2.id }), 'mem_private_past_window');
  assert.equal((await row(hold2.id)).status, 'confirmed', 'hold restored on failure');
  assert.equal(Date.parse((await row(party.id)).starts_at), Date.parse(b), 'booking unchanged on failure');
  assert.equal((await row(party.id)).status, 'confirmed', 'booking still confirmed on failure');
  assert.equal(await scalar('select count(*)::int from mem_private_booking_reschedules'), 1, 'no audit row on failure');

  // --- Keep the old time closed --------------------------------------------
  await fails(move(party.id, moved.starts_at, d, { hold: hold2.id, blockOld: true }), 'mem_private_reschedule_invalid');
  const second = await move(party.id, moved.starts_at, d, { hold: hold2.id, blockOld: true, note: 'Venue closure' });
  const oldBlock = await row(second.old_slot_block_id);
  assert.equal(oldBlock.kind, 'block');
  assert.equal(oldBlock.note, 'Venue closure');
  assert.equal(Date.parse(oldBlock.starts_at), Date.parse(b));
  assert.equal(await scalar(`select mem_private_slot_problem('birthday',$1,2,true)`, [b]), 'unavailable', 'old slot stays closed');

  // --- Coaching: cannot move onto 4pm on the strength of its own 3pm ------
  const coach = await book('coaching_one', await sat(7), 1, other);
  await fails(move(coach.id, coach.starts_at, await sat(7, 16)), 'mem_private_second_hour_locked');

  // --- Refusals ---------------------------------------------------------------
  await fails(move(hold2.id, hold2.starts_at, a), 'mem_private_reschedule_not_allowed');
  await fails(move(party.id, (await row(party.id)).starts_at, a, { reason: 'x' }), 'mem_private_reschedule_invalid');
  await db.query('update mem_private_booking_places set checked_in_at=now() where private_booking_id=$1', [party.id]);
  await fails(move(party.id, (await row(party.id)).starts_at, a), 'mem_private_reschedule_started');
  await db.query("update mem_private_bookings set status='cancelled' where id=$1", [customer.id]);
  await fails(move(customer.id, customer.starts_at, a), 'mem_private_reschedule_not_allowed');
  await fails(move('00000000-0000-4000-8000-0000000000ff', a, b), 'mem_private_not_found');

  // --- Permissions ---------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await fails(db.query('select * from mem_admin_reschedule_private_booking($1,$2,$3,$4,$5)', [party.id, a, b, staff, 'Venue closed']), 'permission denied');
    await fails(db.query('select * from mem_private_booking_reschedules'), 'permission denied');
    await db.exec('reset role');
  }
  console.log('PASS private booking reschedule: preservation, holds, customer protection, rollback, old-slot block, coaching rule, refusals, permissions');
} finally {
  await db.close();
}
