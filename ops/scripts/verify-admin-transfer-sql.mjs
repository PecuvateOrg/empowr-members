// Admin booking transfer must respect the venue's default capacity when the
// target date has none of its own. Runs the first version of the function to
// prove it overbooked, then the fix.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = (name) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table mem_venues(id uuid primary key default gen_random_uuid(), default_capacity integer);
    create table mem_offerings(id uuid primary key default gen_random_uuid(), venue_id uuid);
    create table mem_occurrences(id uuid primary key default gen_random_uuid(), offering_id uuid, venue_id uuid,
      capacity integer, status text not null default 'scheduled', starts_at timestamptz not null default now() + interval '7 days');
    create table mem_bookings(id uuid primary key default gen_random_uuid(), participant_id uuid not null default gen_random_uuid(),
      occurrence_id uuid, status text not null default 'confirmed', transferred_at timestamptz, updated_at timestamptz);`);
  const id = async (q, args = []) => Object.values((await db.query(q, args)).rows[0])[0];
  const venue = await id('insert into mem_venues(default_capacity) values(1) returning id');
  const offering = await id('insert into mem_offerings(venue_id) values($1) returning id', [venue]);
  const occurrence = () => id('insert into mem_occurrences(offering_id) values($1) returning id', [offering]);
  const booking = (occ) => id('insert into mem_bookings(occurrence_id) values($1) returning id', [occ]);
  const staff = '00000000-0000-4000-8000-000000000001';
  const transfer = (b, to) => db.query('select mem_admin_transfer_booking($1,$2,$3,$4)', [b, to, staff, 'test move']);

  const from = await occurrence();
  const full = await occurrence(); // no capacity of its own: inherits the venue's 1
  await booking(full);

  await db.exec(sql('admin-booking-transfer.sql'));
  const first = await booking(from);
  await transfer(first, full);
  assert.equal(await id('select count(*)::int from mem_bookings where occurrence_id=$1', [full]), 2,
    'the first version is expected to overbook; if not, this test proves nothing');
  await db.query('delete from mem_booking_transfer_audit'); await db.query('delete from mem_bookings where id=$1', [first]);

  await db.exec(sql('admin-booking-transfer-capacity.sql'));
  const second = await booking(from);
  await assert.rejects(transfer(second, full), (e) => e.message.includes('mem_capacity_exceeded'));

  const own = await id('insert into mem_occurrences(offering_id,capacity) values($1,2) returning id', [offering]);
  await booking(own);
  await transfer(second, own); // a date's own capacity still wins over the venue default
  assert.equal(await id('select occurrence_id from mem_bookings where id=$1', [second]), own);
  assert.equal(await id('select count(*)::int from mem_booking_transfer_audit'), 1);
  console.log('ok admin transfer capacity');
} finally { await db.close(); }
